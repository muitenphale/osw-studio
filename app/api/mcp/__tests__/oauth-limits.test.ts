import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

/**
 * The two MCP OAuth endpoints an unauthenticated caller can reach. Registration writes a client
 * row on every call, and the token endpoint takes credentials, so both are paced; and the rows
 * those flows leave behind expire, so they are pruned rather than kept for the life of the
 * instance.
 */

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'osws-oauthlimit-'));
  vi.resetModules();
  vi.stubEnv('DATA_DIR', dir);
  vi.stubEnv('MCP_ENABLED', 'true');
});

afterEach(async () => {
  const { closeSystemDatabase } = await import('@/lib/auth/system-database');
  closeSystemDatabase();
  vi.unstubAllEnvs();
  fs.rmSync(dir, { recursive: true, force: true });
});

function registration(ip: string) {
  return new Request('http://localhost/api/mcp/oauth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify({ client_name: 'Probe', redirect_uris: ['http://localhost/cb'] }),
  }) as unknown as NextRequest;
}

describe('the open registration endpoint', () => {
  it('stops accepting registrations from one caller', async () => {
    const { POST } = await import('@/app/api/mcp/oauth/register/route');
    const statuses: number[] = [];
    for (let i = 0; i < 40; i++) statuses.push((await POST(registration('203.0.113.9'))).status);

    expect(statuses.filter(s => s === 201).length).toBeLessThanOrEqual(30);
    expect(statuses).toContain(429);
  });

  it('does not penalise a different caller', async () => {
    const { POST } = await import('@/app/api/mcp/oauth/register/route');
    for (let i = 0; i < 35; i++) await POST(registration('203.0.113.10'));

    expect((await POST(registration('198.51.100.4'))).status).toBe(201);
  });
});

describe('a caller that rotates its forwarded-for header', () => {
  it('is still bounded, because the endpoint has a ceiling of its own', async () => {
    // `getIdentifier` reads `x-forwarded-for`, which any client can set. Behind a proxy that
    // rewrites it that is fine; on a bare instance it means the per-address limit can be stepped
    // around by changing the header each call, so the endpoint carries a total as well.
    const { POST } = await import('@/app/api/mcp/oauth/register/route');
    const statuses: number[] = [];
    for (let i = 0; i < 260; i++) {
      statuses.push((await POST(registration(`203.0.113.${i % 250}`))).status);
    }

    expect(statuses).toContain(429);
    expect(statuses.filter(s => s === 201).length).toBeLessThanOrEqual(200);
  });
});

describe('expired rows', () => {
  it('are dropped when tokens are issued', async () => {
    const store = await import('@/lib/mcp/store');
    const { createUser } = await import('@/lib/auth/system-database');
    const userId = createUser('a@b.test', 'h');
    const client = store.registerMcpClient('Claude', ['http://localhost/cb']);
    const grantId = (() => {
      store.createAuthorizationCode({
        clientId: client.client_id, userId, workspaceId: 'w1',
        scopes: ['projects:read'], codeChallenge: 'c', redirectUri: 'http://localhost/cb',
      });
      return store.listGrantsForUser(userId)[0].id;
    })();

    const { getSystemDatabase } = await import('@/lib/auth/system-database');
    const db = getSystemDatabase();
    db.prepare("INSERT INTO mcp_tokens (token_hash, grant_id, kind, expires_at) VALUES ('stale', ?, 'access', 1)").run(grantId);
    expect(db.prepare("SELECT count(*) AS n FROM mcp_tokens WHERE token_hash = 'stale'").get()).toMatchObject({ n: 1 });

    store.issueTokens(grantId);

    expect(db.prepare("SELECT count(*) AS n FROM mcp_tokens WHERE token_hash = 'stale'").get()).toMatchObject({ n: 0 });
  });
});
