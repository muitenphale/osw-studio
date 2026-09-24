import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createHash } from 'crypto';
import type { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

let dir: string; let userId: string;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'osws-oauthhard-'));
  vi.resetModules();
  vi.stubEnv('DATA_DIR', dir);
  vi.stubEnv('MCP_ENABLED', 'true');
  const { createUser } = await import('@/lib/auth/system-database');
  userId = createUser('a@b.test', 'h');
});

afterEach(async () => {
  const { closeSystemDatabase } = await import('@/lib/auth/system-database');
  closeSystemDatabase();
  vi.unstubAllEnvs();
  fs.rmSync(dir, { recursive: true, force: true });
});

const VERIFIER = 'a-code-verifier-value-long-enough';
const CHALLENGE = createHash('sha256').update(VERIFIER).digest('base64url');

describe('revoking a grant', () => {
  it('accepts the refresh token, not only the access token', async () => {
    const store = await import('@/lib/mcp/store');
    const client = store.registerMcpClient('Claude', ['http://localhost/cb']);
    const code = store.createAuthorizationCode({
      clientId: client.client_id, userId, workspaceId: 'w1',
      scopes: ['projects:read'], codeChallenge: CHALLENGE, redirectUri: 'http://localhost/cb',
    });
    const redeemed = store.redeemAuthorizationCode({ code, clientId: client.client_id, codeVerifier: VERIFIER, redirectUri: 'http://localhost/cb' });
    const tokens = store.issueTokens((redeemed as { ok: true; grantId: string }).grantId);

    const { POST } = await import('@/app/api/mcp/oauth/revoke/route');
    const res = await POST(new Request('http://localhost/api/mcp/oauth/revoke', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: tokens.refreshToken }),
    }) as unknown as NextRequest);

    expect(res.status).toBe(200);
    expect(store.subjectForAccessToken(tokens.accessToken)).toBeUndefined();
    expect(store.listGrantsForUser(userId)).toHaveLength(0);
  });
});

describe('the consent decision', () => {
  async function approve(codeChallenge: string) {
    vi.doMock('@/lib/auth/session', () => ({ requireAuth: async () => ({ userId, email: 'a@b.test' }) }));
    vi.doMock('@/lib/auth/system-database', async () => {
      const real = await vi.importActual<typeof import('@/lib/auth/system-database')>('@/lib/auth/system-database');
      return { ...real, verifyWorkspaceAccess: () => true, getUserById: () => ({ id: userId, is_admin: 1 }) };
    });
    const store = await import('@/lib/mcp/store');
    const client = store.registerMcpClient('Claude', ['http://localhost/cb']);
    const { POST } = await import('@/app/api/mcp/oauth/authorize/route');
    return POST(new Request('http://localhost/api/mcp/oauth/authorize', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        clientId: client.client_id, redirectUri: 'http://localhost/cb', decision: 'approve',
        workspaceId: 'w1', scopes: ['projects:read'], codeChallenge,
      }),
    }) as unknown as NextRequest);
  }

  it('refuses a code_challenge that is not an S256 digest', async () => {
    const res = await approve('not-a-real-challenge');
    expect(res.status).toBe(400);
    expect((await res.json()).error_description).toMatch(/S256/);
  });

  it('accepts a proper one', async () => {
    const res = await approve(CHALLENGE);
    expect(res.status).toBe(200);
    expect((await res.json()).location).toContain('code=');
  });
});
