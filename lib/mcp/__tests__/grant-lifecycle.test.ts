import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createHash } from 'crypto';

vi.mock('server-only', () => ({}));

/**
 * Re-approving the same client used to leave the old grant live: two rows, two working tokens,
 * and a Settings list where revoking the one you can see leaves the other one working. A grant is
 * also written the moment consent is approved, before the code is redeemed, so an abandoned
 * approval left a row that looks connected but never will be.
 */

let dir: string;
let userId: string;
let store: typeof import('../store');

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'osws-grants-'));
  vi.resetModules();
  vi.stubEnv('DATA_DIR', dir);
  store = await import('../store');
  const { createUser } = await import('@/lib/auth/system-database');
  userId = createUser('a@b.test', 'h');
});

afterEach(async () => {
  const { closeSystemDatabase } = await import('@/lib/auth/system-database');
  closeSystemDatabase();
  vi.unstubAllEnvs();
  fs.rmSync(dir, { recursive: true, force: true });
});

const VERIFIER = 'a-code-verifier-value';
const CHALLENGE = createHash('sha256').update(VERIFIER).digest('base64url');

function approve(clientId: string, workspaceId = 'w1') {
  return store.createAuthorizationCode({
    clientId, userId, workspaceId,
    scopes: ['projects:read'],
    codeChallenge: CHALLENGE, redirectUri: 'http://localhost/cb',
  });
}

function redeem(code: string, clientId: string) {
  const out = store.redeemAuthorizationCode({ code, clientId, codeVerifier: VERIFIER, redirectUri: 'http://localhost/cb' });
  if (!out.ok) throw new Error(out.description);
  return out.grantId;
}

describe('a refresh token presented twice', () => {
  it('revokes the whole grant, because a consumed one means two holders', async () => {
    // Rotation consumes the presented token, so a second presentation is either a replay or the
    // legitimate client racing a thief who already used it. Refusing just that request leaves the
    // other holder's freshly issued pair working; the grant is what has to go.
    const client = store.registerMcpClient('Claude', ['http://localhost/cb']);
    const first = store.issueTokens(redeem(approve(client.client_id), client.client_id));

    const rotated = store.rotateRefreshToken(first.refreshToken, client.client_id);
    expect(rotated.ok).toBe(true);
    const stolen = (rotated as { ok: true; tokens: { accessToken: string; refreshToken: string } }).tokens;

    const replay = store.rotateRefreshToken(first.refreshToken, client.client_id);

    expect(replay.ok).toBe(false);
    // and the pair minted from the replayed token is dead too
    expect(store.subjectForAccessToken(stolen.accessToken)).toBeUndefined();
    expect(store.listGrantsForUser(userId)).toHaveLength(0);
  });

  it('leaves an unrelated grant alone', async () => {
    const a = store.registerMcpClient('Claude', ['http://localhost/cb']);
    const b = store.registerMcpClient('Cursor', ['http://localhost/cb']);
    const ta = store.issueTokens(redeem(approve(a.client_id), a.client_id));
    const tb = store.issueTokens(redeem(approve(b.client_id), b.client_id));

    store.rotateRefreshToken(ta.refreshToken, a.client_id);
    store.rotateRefreshToken(ta.refreshToken, a.client_id);

    expect(store.subjectForAccessToken(tb.accessToken)).toBeTruthy();
  });

  it('still refuses a token that never existed, without touching anything', async () => {
    const client = store.registerMcpClient('Claude', ['http://localhost/cb']);
    const tokens = store.issueTokens(redeem(approve(client.client_id), client.client_id));

    const out = store.rotateRefreshToken('never-issued-value', client.client_id);

    expect(out.ok).toBe(false);
    expect(store.subjectForAccessToken(tokens.accessToken)).toBeTruthy();
  });
});

describe('approving the same client twice', () => {
  it('leaves one live grant, not a pile', async () => {
    const client = store.registerMcpClient('Claude', ['http://localhost/cb']);

    store.issueTokens(redeem(approve(client.client_id), client.client_id));
    expect(store.listGrantsForUser(userId)).toHaveLength(1);

    store.issueTokens(redeem(approve(client.client_id), client.client_id));

    expect(store.listGrantsForUser(userId)).toHaveLength(1);
  });

  it('stops the tokens the previous approval issued', async () => {
    const client = store.registerMcpClient('Claude', ['http://localhost/cb']);
    const tokens = store.issueTokens(redeem(approve(client.client_id), client.client_id));
    expect(store.subjectForAccessToken(tokens.accessToken)).toBeTruthy();

    store.issueTokens(redeem(approve(client.client_id), client.client_id));

    expect(store.subjectForAccessToken(tokens.accessToken)).toBeUndefined();
  });

  it('does not disconnect the working client until the new approval is completed', async () => {
    // Superseding at consent time meant clicking Connect disconnected the client that was working,
    // even if the browser never came back with the code. The old grant stands until the new one is
    // actually redeemed.
    const client = store.registerMcpClient('Claude', ['http://localhost/cb']);
    const live = store.issueTokens(redeem(approve(client.client_id), client.client_id));

    approve(client.client_id); // approved, never redeemed

    expect(store.subjectForAccessToken(live.accessToken)).toBeTruthy();
  });

  it('keeps a grant for the same client in a different workspace', async () => {
    const client = store.registerMcpClient('Claude', ['http://localhost/cb']);
    store.issueTokens(redeem(approve(client.client_id, 'w1'), client.client_id));
    store.issueTokens(redeem(approve(client.client_id, 'w2'), client.client_id));

    expect(store.listGrantsForUser(userId)).toHaveLength(2);
  });

  it('keeps another client untouched', async () => {
    const a = store.registerMcpClient('Claude', ['http://localhost/cb']);
    const b = store.registerMcpClient('Cursor', ['http://localhost/cb']);
    store.issueTokens(redeem(approve(a.client_id), a.client_id));
    store.issueTokens(redeem(approve(b.client_id), b.client_id));
    store.issueTokens(redeem(approve(a.client_id), a.client_id));

    expect(store.listGrantsForUser(userId)).toHaveLength(2);
  });
});
