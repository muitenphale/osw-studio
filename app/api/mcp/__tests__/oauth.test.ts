import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createHash, randomBytes } from 'crypto';
import type { NextRequest } from 'next/server';

/**
 * The OAuth flow a client walks before it can call a tool: register, authorize, exchange, refresh,
 * revoke. Driven through the real routes against a real system database, because the parts worth
 * testing are the refusals, and every one of them is a database read.
 *
 * `getSession` is the only mock: the consent decision is made by a signed-in person in a browser,
 * and that session has to come from somewhere.
 */

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock('@/lib/auth/session', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth/session')>('@/lib/auth/session');
  return { ...actual, getSession: mocks.getSession, requireAuth: async () => {
    const s = await mocks.getSession();
    if (!s) throw new Error('Unauthorized');
    return s;
  } };
});

let dir: string;
let userId: string;
let workspaceId: string;

const REDIRECT = 'http://localhost:51000/callback';
const verifier = 'a'.repeat(64);
const challenge = createHash('sha256').update(verifier).digest('base64url');

async function seed() {
  const { createUser, createWorkspace } = await import('@/lib/auth/system-database');
  userId = createUser('owner@a.test', 'hash');
  workspaceId = createWorkspace('Agents', userId);
  mocks.getSession.mockResolvedValue({ userId, email: 'owner@a.test', isAdmin: false });
}

async function register(body: unknown = { client_name: 'Claude', redirect_uris: [REDIRECT] }) {
  const { POST } = await import('@/app/api/mcp/oauth/register/route');
  const res = await POST(new Request('http://localhost/api/mcp/oauth/register', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }) as unknown as NextRequest);
  return { status: res.status, body: await res.json() };
}

async function approve(overrides: Record<string, unknown> = {}) {
  const { POST } = await import('@/app/api/mcp/oauth/authorize/route');
  const res = await POST(new Request('http://localhost/api/mcp/oauth/authorize', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      decision: 'approve', redirectUri: REDIRECT, state: 'xyz', codeChallenge: challenge,
      workspaceId, scopes: ['projects:read', 'projects:write'], ...overrides,
    }),
  }) as unknown as NextRequest);
  return { status: res.status, body: await res.json() };
}

async function token(form: Record<string, string>) {
  const { POST } = await import('@/app/api/mcp/oauth/token/route');
  const res = await POST(new Request('http://localhost/api/mcp/oauth/token', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(form),
  }) as unknown as NextRequest);
  return { status: res.status, body: await res.json() };
}

function codeFrom(location: string): string {
  return new URL(location).searchParams.get('code')!;
}

/** Register, approve and exchange: the state every later test starts from. */
async function connectedClient(scopes = ['projects:read', 'projects:write']) {
  const { body: client } = await register();
  const { body: decision } = await approve({ clientId: client.client_id, scopes });
  const { body: tokens } = await token({
    grant_type: 'authorization_code', client_id: client.client_id,
    code: codeFrom(decision.location), redirect_uri: REDIRECT, code_verifier: verifier,
  });
  return { clientId: client.client_id, tokens };
}

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'osws-oauth-'));
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv('DATA_DIR', dir);
  vi.stubEnv('MCP_ENABLED', 'true');
  await seed();
});

afterEach(async () => {
  const { closeSystemDatabase } = await import('@/lib/auth/system-database');
  closeSystemDatabase();
  vi.unstubAllEnvs();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('discovery documents', () => {
  it('names this instance as its own authorization server, with the endpoints a client needs', async () => {
    const { GET } = await import('@/app/.well-known/oauth-protected-resource/[[...path]]/route');
    const res = await GET(new Request('https://studio.example.com/.well-known/oauth-protected-resource/api/mcp') as unknown as NextRequest);
    const doc = await res.json();

    expect(doc.resource).toBe('https://studio.example.com/api/mcp');
    expect(doc.authorization_servers).toEqual(['https://studio.example.com']);

    const as = await import('@/app/.well-known/oauth-authorization-server/[[...path]]/route');
    const meta = await (await as.GET(new Request('https://studio.example.com/.well-known/oauth-authorization-server') as unknown as NextRequest)).json();
    expect(meta).toMatchObject({
      issuer: 'https://studio.example.com',
      authorization_endpoint: 'https://studio.example.com/mcp/authorize',
      token_endpoint: 'https://studio.example.com/api/mcp/oauth/token',
      registration_endpoint: 'https://studio.example.com/api/mcp/oauth/register',
      code_challenge_methods_supported: ['S256'],
    });
    // Claude appends offline_access when the server advertises it, to get a refreshable token.
    expect(meta.scopes_supported).toContain('offline_access');
  });

  it('honours the forwarded host, so an instance behind a proxy advertises the URL clients reach', async () => {
    const { GET } = await import('@/app/.well-known/oauth-protected-resource/[[...path]]/route');
    const res = await GET(new Request('http://127.0.0.1:3000/.well-known/oauth-protected-resource', {
      headers: { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'studio.example.com' },
    }) as unknown as NextRequest);

    expect((await res.json()).resource).toBe('https://studio.example.com/api/mcp');
  });

  it('is absent unless the connector is enabled', async () => {
    vi.stubEnv('MCP_ENABLED', 'false');
    const { GET } = await import('@/app/.well-known/oauth-protected-resource/[[...path]]/route');
    expect((await GET(new Request('https://x/.well-known/oauth-protected-resource') as unknown as NextRequest)).status).toBe(404);
  });
});

describe('dynamic client registration', () => {
  it('issues a client id for a loopback callback, which is what Claude Code uses', async () => {
    const out = await register();
    expect(out.status).toBe(201);
    expect(out.body).toMatchObject({ client_name: 'Claude', redirect_uris: [REDIRECT], token_endpoint_auth_method: 'none' });
    expect(out.body.client_id).toMatch(/[0-9a-f-]{36}/);
  });

  it('accepts an https callback, which is what a hosted client uses', async () => {
    const out = await register({ client_name: 'Claude', redirect_uris: ['https://claude.ai/api/mcp/auth_callback'] });
    expect(out.status).toBe(201);
  });

  it('refuses a callback that is neither https nor loopback', async () => {
    for (const uri of ['http://evil.example.com/cb', 'ftp://x/cb', 'not-a-url', 'https://x/cb#frag']) {
      const out = await register({ client_name: 'X', redirect_uris: [uri] });
      expect(out.status, uri).toBe(400);
      expect(out.body.error).toBe('invalid_redirect_uri');
    }
  });

  it('refuses a registration with no callback at all', async () => {
    expect((await register({ client_name: 'X', redirect_uris: [] })).status).toBe(400);
  });
});

describe('the consent decision', () => {
  it('returns a redirect carrying the code and the state the client sent', async () => {
    const { body: client } = await register();
    const out = await approve({ clientId: client.client_id });

    const url = new URL(out.body.location);
    expect(url.origin + url.pathname).toBe(REDIRECT);
    expect(url.searchParams.get('state')).toBe('xyz');
    expect(url.searchParams.get('code')).toBeTruthy();
  });

  it('reports a decline to the client rather than minting a code', async () => {
    const { body: client } = await register();
    const out = await approve({ clientId: client.client_id, decision: 'deny' });

    const url = new URL(out.body.location);
    expect(url.searchParams.get('error')).toBe('access_denied');
    expect(url.searchParams.get('code')).toBeNull();
  });

  it('refuses a redirect address the client never registered', async () => {
    const { body: client } = await register();
    const out = await approve({ clientId: client.client_id, redirectUri: 'https://evil.example.com/cb' });

    expect(out.status).toBe(400);
    expect(out.body.location).toBeUndefined();
  });

  it('refuses a workspace the account cannot reach', async () => {
    const { createUser, createWorkspace } = await import('@/lib/auth/system-database');
    const other = createWorkspace('Theirs', createUser('other@a.test', 'h'));
    const { body: client } = await register();

    const out = await approve({ clientId: client.client_id, workspaceId: other });

    expect(out.status).toBe(403);
  });

  it('refuses a scope the account\'s role cannot grant', async () => {
    const { createUser, grantWorkspaceAccess } = await import('@/lib/auth/system-database');
    const viewer = createUser('viewer@a.test', 'h');
    grantWorkspaceAccess(viewer, workspaceId, 'viewer');
    mocks.getSession.mockResolvedValue({ userId: viewer, email: 'viewer@a.test', isAdmin: false });
    const { body: client } = await register();

    const out = await approve({ clientId: client.client_id, scopes: ['projects:read', 'projects:write'] });

    expect(out.status).toBe(400);
    expect(out.body.error).toBe('invalid_scope');
    expect(out.body.error_description).toMatch(/projects:write/);
    // A role problem, and the message has to say so rather than call it withdrawn.
    expect(out.body.error_description).toMatch(/above your role/);
    expect(out.body.error_description).toMatch(/viewer/);
  });

  it('tells an owner a withheld scope is not offered, rather than blaming their role', async () => {
    // `workspace:admin` is in MCP_SCOPES so old tokens still parse, but ACTIVE_SCOPES withholds it
    // from everyone because no tool reads it. Reporting that as a role problem told an owner that
    // an owner could not grant it.
    const { body: client } = await register();

    const out = await approve({ clientId: client.client_id, scopes: ['projects:read', 'workspace:admin'] });

    expect(out.status).toBe(400);
    expect(out.body.error).toBe('invalid_scope');
    expect(out.body.error_description).toMatch(/no longer offered/);
    expect(out.body.error_description).toMatch(/workspace:admin/);
    expect(out.body.error_description).not.toMatch(/above your role/);
  });

  it('refuses an unauthenticated decision', async () => {
    mocks.getSession.mockResolvedValue(null);
    const { body: client } = await register();

    expect((await approve({ clientId: client.client_id })).status).toBe(401);
  });
});

describe('the token endpoint', () => {
  it('exchanges a code for an access and refresh token carrying the granted scopes', async () => {
    const { body: client } = await register();
    const { body: decision } = await approve({ clientId: client.client_id });

    const out = await token({
      grant_type: 'authorization_code', client_id: client.client_id,
      code: codeFrom(decision.location), redirect_uri: REDIRECT, code_verifier: verifier,
    });

    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({ token_type: 'Bearer', expires_in: 3600, scope: 'projects:read projects:write' });
    expect(out.body.access_token).toBeTruthy();
    expect(out.body.refresh_token).toBeTruthy();
  });

  it('refuses a code whose PKCE verifier does not match', async () => {
    const { body: client } = await register();
    const { body: decision } = await approve({ clientId: client.client_id });

    const out = await token({
      grant_type: 'authorization_code', client_id: client.client_id,
      code: codeFrom(decision.location), redirect_uri: REDIRECT, code_verifier: 'b'.repeat(64),
    });

    expect(out.status).toBe(400);
    expect(out.body.error_description).toMatch(/PKCE/);
  });

  it('refuses a code with no verifier at all', async () => {
    const { body: client } = await register();
    const { body: decision } = await approve({ clientId: client.client_id });

    const out = await token({
      grant_type: 'authorization_code', client_id: client.client_id,
      code: codeFrom(decision.location), redirect_uri: REDIRECT,
    });

    expect(out.status).toBe(400);
  });

  it('spends a code once', async () => {
    const { body: client } = await register();
    const { body: decision } = await approve({ clientId: client.client_id });
    const args = {
      grant_type: 'authorization_code', client_id: client.client_id,
      code: codeFrom(decision.location), redirect_uri: REDIRECT, code_verifier: verifier,
    };

    expect((await token(args)).status).toBe(200);
    expect((await token(args)).status).toBe(400);
  });

  it('refuses a code presented by a different client', async () => {
    const { body: client } = await register();
    const { body: thief } = await register({ client_name: 'Thief', redirect_uris: [REDIRECT] });
    const { body: decision } = await approve({ clientId: client.client_id });

    const out = await token({
      grant_type: 'authorization_code', client_id: thief.client_id,
      code: codeFrom(decision.location), redirect_uri: REDIRECT, code_verifier: verifier,
    });

    expect(out.status).toBe(400);
  });

  it('refuses a redirect_uri that differs from the authorization request', async () => {
    const { body: client } = await register({ client_name: 'Two', redirect_uris: [REDIRECT, 'http://localhost:51001/callback'] });
    const { body: decision } = await approve({ clientId: client.client_id });

    const out = await token({
      grant_type: 'authorization_code', client_id: client.client_id,
      code: codeFrom(decision.location), redirect_uri: 'http://localhost:51001/callback', code_verifier: verifier,
    });

    expect(out.status).toBe(400);
  });

  it('rotates a refresh token and refuses the spent one', async () => {
    const { clientId, tokens } = await connectedClient();

    const first = await token({ grant_type: 'refresh_token', client_id: clientId, refresh_token: tokens.refresh_token });
    expect(first.status).toBe(200);
    expect(first.body.access_token).not.toBe(tokens.access_token);

    const replay = await token({ grant_type: 'refresh_token', client_id: clientId, refresh_token: tokens.refresh_token });
    expect(replay.status).toBe(400);
  });

  it('refuses an unknown client and an unsupported grant type', async () => {
    expect((await token({ grant_type: 'authorization_code', client_id: 'nope', code: 'x', redirect_uri: REDIRECT })).status).toBe(401);
    const { body: client } = await register();
    expect((await token({ grant_type: 'password', client_id: client.client_id })).body.error).toBe('unsupported_grant_type');
  });
});

describe('a granted token on the MCP endpoint', () => {
  async function callTool(accessToken: string, name: string, args: Record<string, unknown>) {
    const { POST } = await import('@/app/api/mcp/route');
    const res = await POST(new Request('http://localhost/api/mcp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json', accept: 'application/json, text/event-stream',
        'mcp-protocol-version': '2025-06-18', authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
    }) as unknown as NextRequest);
    const text = await res.text();
    if (!res.ok) return { status: res.status, isError: true, text };
    const line = text.split('\n').find(l => l.startsWith('data: '));
    const message = JSON.parse(line ? line.slice(6) : text);
    return { status: res.status, isError: message.result?.isError === true, text: message.result?.content?.[0]?.text as string };
  }

  it('works, and is confined to the granted workspace and scopes', async () => {
    const { createWorkspace, createUser } = await import('@/lib/auth/system-database');
    const elsewhere = createWorkspace('Theirs', createUser('third@a.test', 'h'));
    const { getWorkspaceAdapter } = await import('@/lib/vfs/adapters/server');
    const adapter = getWorkspaceAdapter(workspaceId);
    await adapter.init();
    const now = new Date();
    await adapter.createProject({ id: 'p1', name: 'Site', createdAt: now, updatedAt: now, settings: { runtime: 'static' } });

    const { tokens } = await connectedClient(['projects:read']);

    const ok = await callTool(tokens.access_token, 'projects_list', { workspaceId });
    expect(ok.isError).toBe(false);
    expect(JSON.parse(ok.text!)[0]).toMatchObject({ id: 'p1' });

    // Outside the grant's workspace.
    expect((await callTool(tokens.access_token, 'projects_list', { workspaceId: elsewhere })).isError).toBe(true);
    // Outside the grant's scopes.
    const write = await callTool(tokens.access_token, 'bash', { workspaceId, projectId: 'p1', command: "cat > /x.html << 'EOF'\nx\nEOF" });
    expect(write.isError).toBe(true);
    expect(write.text).toMatch(/projects:write/);

    const { closeWorkspaceAdapter } = await import('@/lib/vfs/adapters/server');
    closeWorkspaceAdapter(workspaceId);
  });

  it('stops working the moment the account revokes the grant', async () => {
    const { tokens, clientId } = await connectedClient();
    const { getWorkspaceAdapter, closeWorkspaceAdapter } = await import('@/lib/vfs/adapters/server');
    await (await getWorkspaceAdapter(workspaceId)).init();

    expect((await callTool(tokens.access_token, 'projects_list', { workspaceId })).isError).toBe(false);

    const { GET, DELETE } = await import('@/app/api/mcp/grants/route');
    const listed = await (await GET()).json();
    expect(listed.grants).toHaveLength(1);
    expect(listed.grants[0]).toMatchObject({ clientName: 'Claude', workspaceId });

    const revoked = await DELETE(new Request(`http://localhost/api/mcp/grants?id=${listed.grants[0].id}`, { method: 'DELETE' }) as unknown as NextRequest);
    expect(revoked.status).toBe(200);

    // The access token is refused, and the refresh token cannot mint a new one.
    expect((await callTool(tokens.access_token, 'projects_list', { workspaceId })).status).toBe(401);
    expect((await token({ grant_type: 'refresh_token', client_id: clientId, refresh_token: tokens.refresh_token })).status).toBe(400);
    closeWorkspaceAdapter(workspaceId);
  });

  it('refuses a revoke of a grant belonging to someone else', async () => {
    const { tokens } = await connectedClient();
    expect(tokens.access_token).toBeTruthy();
    const { GET, DELETE } = await import('@/app/api/mcp/grants/route');
    const listed = await (await GET()).json();

    const { createUser } = await import('@/lib/auth/system-database');
    mocks.getSession.mockResolvedValue({ userId: createUser('nosy@a.test', 'h'), email: 'nosy@a.test', isAdmin: false });

    const res = await DELETE(new Request(`http://localhost/api/mcp/grants?id=${listed.grants[0].id}`, { method: 'DELETE' }) as unknown as NextRequest);
    expect(res.status).toBe(404);
  });

  it('challenges an unknown token with a pointer to the discovery document', async () => {
    const { POST } = await import('@/app/api/mcp/route');
    const res = await POST(new Request('http://localhost/api/mcp', {
      method: 'POST', headers: { authorization: `Bearer ${randomBytes(32).toString('base64url')}` }, body: '{}',
    }) as unknown as NextRequest);

    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toMatch(/^Bearer/);
  });
});
