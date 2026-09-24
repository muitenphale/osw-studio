import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Guards in the grant store that the HTTP flow cannot reach.
 *
 * Revoking a grant deletes its tokens, so the `revoked` flag on the grant is never the thing that
 * refuses a call in practice, and removing the check leaves every route test passing. It is still
 * checked, because a token row outliving its grant would otherwise keep working. These tests put
 * the store in that state directly.
 */

vi.mock('server-only', () => ({}));

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'osws-mcp-store-'));
  vi.resetModules();
  vi.stubEnv('DATA_DIR', dir);
});

afterEach(async () => {
  const { closeSystemDatabase } = await import('@/lib/auth/system-database');
  closeSystemDatabase();
  vi.unstubAllEnvs();
  fs.rmSync(dir, { recursive: true, force: true });
});

/** A registered client, an approved grant, and a live pair of tokens for it. */
async function grantedToken() {
  const store = await import('@/lib/mcp/store');
  const { getSystemDatabase } = await import('@/lib/auth/system-database');
  const client = store.registerMcpClient('C', ['https://c.example.com/cb']);
  store.createAuthorizationCode({
    clientId: client.client_id, userId: 'u1', workspaceId: 'w1',
    scopes: ['projects:read'], codeChallenge: 'x', redirectUri: 'https://c.example.com/cb',
  });
  const row = getSystemDatabase().prepare('SELECT id FROM mcp_grants LIMIT 1').get() as { id: string };
  return { store, db: getSystemDatabase(), grantId: row.id, tokens: store.issueTokens(row.id) };
}

describe('mcp grant store', () => {
  it('refuses a token whose grant is marked revoked even when the token row survives', async () => {
    const { store, db, grantId, tokens } = await grantedToken();
    expect(store.subjectForAccessToken(tokens.accessToken)).toBeDefined();

    db.prepare('UPDATE mcp_grants SET revoked = 1 WHERE id = ?').run(grantId);

    expect(store.subjectForAccessToken(tokens.accessToken)).toBeUndefined();
  });

  it('refuses an access token after it expires', async () => {
    const { store, db, grantId, tokens } = await grantedToken();

    db.prepare('UPDATE mcp_tokens SET expires_at = 1 WHERE grant_id = ?').run(grantId);

    expect(store.subjectForAccessToken(tokens.accessToken)).toBeUndefined();
  });

  it('does not accept a refresh token at the access-token gate', async () => {
    const { store, tokens } = await grantedToken();

    expect(store.subjectForAccessToken(tokens.refreshToken)).toBeUndefined();
  });

  it('stores no token in the clear, so a copy of the database yields none', async () => {
    const { db, tokens } = await grantedToken();

    const stored = db.prepare('SELECT token_hash FROM mcp_tokens').all() as { token_hash: string }[];
    expect(stored).toHaveLength(2);
    for (const row of stored) {
      expect(row.token_hash).not.toBe(tokens.accessToken);
      expect(row.token_hash).not.toBe(tokens.refreshToken);
      expect(row.token_hash).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('records the grant that last used a token, for the connected-agents list', async () => {
    const { store, db, grantId, tokens } = await grantedToken();
    expect((db.prepare('SELECT last_used_at FROM mcp_grants WHERE id = ?').get(grantId) as { last_used_at: string | null }).last_used_at).toBeNull();

    store.subjectForAccessToken(tokens.accessToken);

    expect((db.prepare('SELECT last_used_at FROM mcp_grants WHERE id = ?').get(grantId) as { last_used_at: string | null }).last_used_at).toBeTruthy();
  });
});
