import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHash } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { NextRequest } from 'next/server';

/**
 * `files_upload_url` and `files_download_url`, and the route their URLs lead to, over the real
 * handlers: what matters is that the bytes a client PUTs are the bytes stored, and that a URL
 * does exactly one thing once.
 */

vi.mock('server-only', () => ({}));

let dir: string;
let workspaceId: string;
let userId: string;
const TOKEN = 'dev-token-for-tests';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64',
);
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

async function seed() {
  const { createUser, createWorkspace } = await import('@/lib/auth/system-database');
  userId = createUser('agent@a.test', 'hash');
  workspaceId = createWorkspace('Agents', userId);
  const { getWorkspaceAdapter } = await import('@/lib/vfs/adapters/server');
  const adapter = getWorkspaceAdapter(workspaceId);
  await adapter.init();
  const now = new Date();
  await adapter.createProject({ id: 'p1', name: 'Site', createdAt: now, updatedAt: now, settings: { runtime: 'static' } });
}

/** What the URL tools answer with. */
interface TransferAnswer { url: string; method: string; command: string; [key: string]: unknown }

async function callTool(name: string, args: Record<string, unknown>) {
  const { POST } = await import('@/app/api/mcp/route');
  const request = new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers: new Headers({
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': '2025-06-18',
      authorization: `Bearer ${TOKEN}`,
    }),
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
  });
  const res = await POST(request as unknown as NextRequest);
  const body = await res.text();
  const line = body.split('\n').find(l => l.startsWith('data: '));
  const message = JSON.parse(line ? line.slice(6) : body);
  const text = message.result?.content?.[0]?.text as string | undefined;
  const isError = message.result?.isError === true;
  // bash answers in plain text; the file tools answer in JSON.
  let json: TransferAnswer | undefined;
  try { json = !isError && text ? JSON.parse(text) : undefined; } catch { json = undefined; }
  return { text, isError, json };
}

function tokenOf(url: string) {
  return url.split('/api/mcp/files/')[1];
}

async function put(url: string, body: Uint8Array | string, headers: Record<string, string> = {}) {
  const { PUT } = await import('@/app/api/mcp/files/[token]/route');
  const request = new Request(url, { method: 'PUT', body: body as BodyInit, headers });
  return PUT(request as unknown as NextRequest, { params: Promise.resolve({ token: tokenOf(url) }) });
}

async function get(url: string) {
  const { GET } = await import('@/app/api/mcp/files/[token]/route');
  const request = new Request(url, { method: 'GET' });
  return GET(request as unknown as NextRequest, { params: Promise.resolve({ token: tokenOf(url) }) });
}

async function uploadUrl(filePath: string, overwrite?: boolean) {
  const out = await callTool('files_upload_url', { workspaceId, projectId: 'p1', path: filePath, ...(overwrite ? { overwrite } : {}) });
  expect(out.isError).toBe(false);
  return out.json!.url as string;
}

async function storedBytes(filePath: string): Promise<Uint8Array> {
  const { getWorkspaceAdapter } = await import('@/lib/vfs/adapters/server');
  const file = await getWorkspaceAdapter(workspaceId).getFile('p1', filePath);
  const content = file?.content;
  if (content instanceof ArrayBuffer) return new Uint8Array(content);
  if (typeof content === 'string') return new TextEncoder().encode(content);
  throw new Error('no content stored');
}

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'osws-files-transfer-'));
  vi.resetModules();
  delete (globalThis as { __mcpTransfers?: unknown }).__mcpTransfers;
  vi.stubEnv('DATA_DIR', dir);
  vi.stubEnv('MCP_ENABLED', 'true');
  // The endpoint requires server mode as well as the flag.
  vi.stubEnv('NEXT_PUBLIC_SERVER_MODE', 'true');
  vi.stubEnv('MCP_DEV_TOKEN', TOKEN);
  await seed();
  vi.stubEnv('MCP_DEV_USER_ID', userId);
  vi.stubEnv('MCP_DEV_WORKSPACE_ID', workspaceId);
});

afterEach(async () => {
  vi.restoreAllMocks();
  const { closeWorkspaceAdapter } = await import('@/lib/vfs/adapters/server');
  const { closeSystemDatabase } = await import('@/lib/auth/system-database');
  closeWorkspaceAdapter(workspaceId);
  closeSystemDatabase();
  vi.unstubAllEnvs();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('files_upload_url', () => {
  it('returns a URL on the instance the client reached, and a command to run', async () => {
    const out = await callTool('files_upload_url', { workspaceId, projectId: 'p1', path: '/assets/icon.png' });
    expect(out.isError).toBe(false);
    expect(out.json!.url).toMatch(/^http:\/\/localhost\/api\/mcp\/files\/[A-Za-z0-9_-]{43}$/);
    expect(out.json!.method).toBe('PUT');
    expect(out.json!.command).toContain(`-T <local-file> '${out.json!.url}'`);
  });

  it('stores a PNG byte for byte and answers with its sha256', async () => {
    const res = await put(await uploadUrl('/assets/icon.png'), new Uint8Array(PNG));

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ path: '/assets/icon.png', type: 'image', mimeType: 'image/png', size: PNG.byteLength, created: true });
    expect(body.sha256).toBe(sha256(PNG));
    expect(Array.from(await storedBytes('/assets/icon.png'))).toEqual(Array.from(PNG));
  });

  it('creates a folder that does not exist yet', async () => {
    const res = await put(await uploadUrl('/assets/new/icon.png'), new Uint8Array(PNG));
    expect(res.status).toBe(201);
    expect(Array.from(await storedBytes('/assets/new/icon.png'))).toEqual(Array.from(PNG));
  });

  it('stores a text file as text', async () => {
    const res = await put(await uploadUrl('/notes.md'), '# Hej då\n');
    expect(res.status).toBe(201);
    const { getWorkspaceAdapter } = await import('@/lib/vfs/adapters/server');
    const file = await getWorkspaceAdapter(workspaceId).getFile('p1', '/notes.md');
    expect(file?.content).toBe('# Hej då\n');
  });

  it('refuses bytes that are not UTF-8 under a text extension', async () => {
    const res = await put(await uploadUrl('/notes.md'), new Uint8Array(PNG));
    expect(res.status).toBe(415);
  });

  it('works once', async () => {
    const url = await uploadUrl('/assets/icon.png', true);
    expect((await put(url, new Uint8Array(PNG))).status).toBe(201);
    const again = await put(url, new Uint8Array(PNG));
    expect(again.status).toBe(404);
    expect((await again.json()).error).toContain('already used');
  });

  it('expires after ten minutes', async () => {
    const url = await uploadUrl('/assets/icon.png');
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + 10 * 60 * 1000 + 1);
    expect((await put(url, new Uint8Array(PNG))).status).toBe(404);
  });

  it('refuses an existing file unless overwrite is set, then replaces it', async () => {
    await put(await uploadUrl('/assets/icon.png'), new Uint8Array(PNG));

    const refusedCall = await callTool('files_upload_url', { workspaceId, projectId: 'p1', path: '/assets/icon.png' });
    expect(refusedCall.isError).toBe(true);
    expect(refusedCall.text).toContain('overwrite: true');

    const replacement = new Uint8Array([...PNG, 0]);
    const res = await put(await uploadUrl('/assets/icon.png', true), replacement);
    expect(res.status).toBe(200);
    expect((await res.json()).created).toBe(false);
    expect(Array.from(await storedBytes('/assets/icon.png'))).toEqual(Array.from(replacement));
  });

  it('refuses at upload time a file written after the URL was issued', async () => {
    const url = await uploadUrl('/notes.md');
    await callTool('files_write', { workspaceId, projectId: 'p1', path: '/notes.md', content: 'first' });
    const res = await put(url, 'second');
    expect(res.status).toBe(409);
    expect(new TextDecoder().decode(await storedBytes('/notes.md'))).toBe('first');
  });

  it('stops working when the connection it was issued to is revoked', async () => {
    // A real grant: the development token has none to revoke.
    const store = await import('@/lib/mcp/store');
    const client = store.registerMcpClient('Test client', ['http://localhost/cb']);
    const grantFor = () => {
      store.createAuthorizationCode({
        clientId: client.client_id, userId, workspaceId, scopes: ['projects:write'],
        codeChallenge: 'x', redirectUri: 'http://localhost/cb',
      });
      return store.listGrantsForUser(userId)[0].id;
    };
    const { createTransfer } = await import('@/lib/mcp/transfers');
    const urlFor = (grantId: string, filePath: string) => `http://localhost/api/mcp/files/${createTransfer({
      kind: 'upload', grantId, userId, workspaceId, projectId: 'p1', path: filePath,
      overwrite: false, clientLabel: 'Test client',
    }).token}`;

    const live = grantFor();
    expect((await put(urlFor(live, '/assets/a.png'), new Uint8Array(PNG))).status).toBe(201);

    const url = urlFor(live, '/assets/b.png');
    store.revokeGrant(live);
    const res = await put(url, new Uint8Array(PNG));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toContain('revoked');
  });

  it('refuses a body over the cap', async () => {
    const res = await put(await uploadUrl('/assets/big.png'), new Uint8Array(10 * 1024 * 1024 + 1));
    expect(res.status).toBe(413);
  });

  it('refuses a path that climbs out of the project', async () => {
    const out = await callTool('files_upload_url', { workspaceId, projectId: 'p1', path: '/a/../../etc/passwd' });
    expect(out.isError).toBe(true);
    expect(out.text).toContain('not a path inside the project');
  });

  it('refuses a connection without projects:write', async () => {
    vi.stubEnv('MCP_DEV_SCOPES', 'projects:read');
    const out = await callTool('files_upload_url', { workspaceId, projectId: 'p1', path: '/assets/icon.png' });
    expect(out.isError).toBe(true);
    expect(out.text).toContain('projects:write');
  });
});

describe('files_download_url', () => {
  it('answers with the stored bytes, their type and their sha256', async () => {
    await put(await uploadUrl('/assets/icon.png'), new Uint8Array(PNG));

    const out = await callTool('files_download_url', { workspaceId, projectId: 'p1', path: '/assets/icon.png' });
    expect(out.isError).toBe(false);
    expect(out.json).toMatchObject({ method: 'GET', mimeType: 'image/png', size: PNG.byteLength });
    expect(out.json!.command).toContain('-o <local-file>');

    const res = await get(out.json!.url);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('x-content-sha256')).toBe(sha256(PNG));
    expect(Array.from(new Uint8Array(await res.arrayBuffer()))).toEqual(Array.from(PNG));

    expect((await get(out.json!.url)).status).toBe(404);
  });

  /**
   * The URL is on the studio's own origin, so an HTML file answered inline would run there with
   * whatever session the viewer holds. `curl -o` ignores both headers, and nothing else is meant to
   * fetch this.
   */
  it('serves an HTML file as a download rather than a document', async () => {
    await put(await uploadUrl('/page.html'), new TextEncoder().encode('<script>alert(1)</script>'));

    const out = await callTool('files_download_url', { workspaceId, projectId: 'p1', path: '/page.html' });
    const res = await get(out.json!.url);

    expect(res.headers.get('content-disposition')).toBe('attachment; filename="page.html"');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('says which file is missing', async () => {
    const out = await callTool('files_download_url', { workspaceId, projectId: 'p1', path: '/nope.png' });
    expect(out.isError).toBe(true);
    expect(out.text).toContain('No file at /nope.png');
  });

  it('keeps upload and download URLs apart', async () => {
    const upload = await uploadUrl('/assets/icon.png');
    expect((await get(upload)).status).toBe(404);
    // Asking with the wrong method does not spend the URL.
    expect((await put(upload, new Uint8Array(PNG))).status).toBe(201);
  });
});

describe('edges', () => {
  it('refuses a URL whose account lost the role it needs after it was issued', async () => {
    const url = await uploadUrl('/assets/icon.png');
    const { grantWorkspaceAccess } = await import('@/lib/auth/system-database');
    grantWorkspaceAccess(userId, workspaceId, 'viewer');
    const res = await put(url, new Uint8Array(PNG));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toContain('Insufficient');
  });

  it('reports a full storage quota and stores nothing', async () => {
    const { updateWorkspace } = await import('@/lib/auth/system-database');
    updateWorkspace(workspaceId, { max_storage_mb: 1 });
    const res = await put(await uploadUrl('/assets/big.png'), new Uint8Array(2 * 1024 * 1024));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toContain('Storage limit reached');
    const { getWorkspaceAdapter } = await import('@/lib/vfs/adapters/server');
    expect(await getWorkspaceAdapter(workspaceId).getFile('p1', '/assets/big.png')).toBeFalsy();
  });

  it('stores nothing when the client goes away mid-upload', async () => {
    const url = await uploadUrl('/assets/cut.png');
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(PNG));
        controller.error(new Error('connection reset'));
      },
    });
    const { PUT } = await import('@/app/api/mcp/files/[token]/route');
    const request = new Request(url, { method: 'PUT', body, duplex: 'half' } as RequestInit);
    const res = await PUT(request as unknown as NextRequest, { params: Promise.resolve({ token: tokenOf(url) }) });

    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('interrupted');
    const { getWorkspaceAdapter } = await import('@/lib/vfs/adapters/server');
    expect(await getWorkspaceAdapter(workspaceId).getFile('p1', '/assets/cut.png')).toBeFalsy();
  });

  it('stores an empty file', async () => {
    const res = await put(await uploadUrl('/assets/empty.png'), new Uint8Array(0));
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ size: 0, sha256: sha256(new Uint8Array(0)) });
  });

  for (const [label, filePath, bytes] of [
    ['a text file', '/notes.md', new TextEncoder().encode('# Hej då\r\nrad två\n')],
    ['an SVG', '/assets/logo.svg', new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><text>å</text></svg>')],
    ['a path that is not ASCII', '/assets/bild-å ö.png', new Uint8Array(PNG)],
  ] as const) {
    it(`round-trips ${label} byte for byte`, async () => {
      const up = await put(await uploadUrl(filePath), new Uint8Array(bytes));
      expect(up.status).toBe(201);
      expect((await up.json()).sha256).toBe(sha256(bytes));

      const out = await callTool('files_download_url', { workspaceId, projectId: 'p1', path: filePath });
      const res = await get(out.json!.url);
      expect(res.headers.get('x-content-sha256')).toBe(sha256(bytes));
      expect(Array.from(new Uint8Array(await res.arrayBuffer()))).toEqual(Array.from(bytes));
    });
  }
});

describe('bash on a binary file', () => {
  it('points a refused cat at files_download_url', async () => {
    await put(await uploadUrl('/assets/icon.png'), new Uint8Array(PNG));
    const out = await callTool('bash', { workspaceId, projectId: 'p1', command: 'cat /assets/icon.png' });

    expect(out.text).toContain('binary or non-text file');
    expect(out.text).toContain('files_download_url');
  });

  it('points a refused redirect at files_upload_url and writes nothing', async () => {
    const out = await callTool('bash', { workspaceId, projectId: 'p1', command: 'echo hello > /assets/new.png' });

    expect(out.text).toContain('files_upload_url');
    const { getWorkspaceAdapter } = await import('@/lib/vfs/adapters/server');
    expect(await getWorkspaceAdapter(workspaceId).getFile('p1', '/assets/new.png')).toBeFalsy();
  });

  it('adds nothing to ordinary output', async () => {
    const out = await callTool('bash', { workspaceId, projectId: 'p1', command: 'echo hello > /notes.txt && cat /notes.txt' });

    expect(out.text).toContain('hello');
    expect(out.text).not.toContain('files_');
  });
});
