import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * An MCP grant outlives the access it was consented for unless something revokes it: the bearer
 * token stays valid, the connector keeps answering, and its refresh token keeps rotating. These pin
 * the two places that have to take the grant with them.
 */

vi.mock('server-only', () => ({}));

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'osws-grant-revoke-'));
  vi.resetModules();
  vi.stubEnv('DATA_DIR', path.join(dir, 'data'));
});

afterEach(async () => {
  const { closeSystemDatabase } = await import('@/lib/auth/system-database');
  closeSystemDatabase();
  vi.unstubAllEnvs();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function seedGrant(userId: string, workspaceId: string) {
  const { registerMcpClient, createAuthorizationCode, redeemAuthorizationCode, issueTokens } =
    await import('@/lib/mcp/store');
  const { createHash } = await import('crypto');

  const client = registerMcpClient('Test client', ['https://claude.ai/api/mcp/auth_callback']);
  const verifier = 'verifier-' + userId + workspaceId;
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const code = createAuthorizationCode({
    clientId: client.client_id,
    userId,
    workspaceId,
    scopes: ['projects:read'],
    codeChallenge: challenge,
    redirectUri: 'https://claude.ai/api/mcp/auth_callback',
  });
  const redeemed = redeemAuthorizationCode({
    code,
    clientId: client.client_id,
    codeVerifier: verifier,
    redirectUri: 'https://claude.ai/api/mcp/auth_callback',
  });
  if (!redeemed.ok) throw new Error('fixture failed to redeem: ' + redeemed.description);
  const tokens = issueTokens(redeemed.grantId);
  return { grantId: redeemed.grantId, tokens, clientId: client.client_id };
}

describe('revoking workspace access takes the MCP grant with it', () => {
  it('kills the access token and the grant for that workspace', async () => {
    const { createUser, createWorkspace, grantWorkspaceAccess, revokeWorkspaceAccess } =
      await import('@/lib/auth/system-database');
    const { subjectForAccessToken, getGrant } = await import('@/lib/mcp/store');

    const owner = createUser('o@a.test', 'x');
    const member = createUser('m@a.test', 'x');
    const workspace = createWorkspace('W', owner);
    grantWorkspaceAccess(member, workspace, 'editor');

    const { grantId, tokens } = await seedGrant(member, workspace);
    expect(subjectForAccessToken(tokens.accessToken)).toBeDefined();

    revokeWorkspaceAccess(member, workspace);

    expect(getGrant(grantId)?.revoked).toBe(1);
    expect(subjectForAccessToken(tokens.accessToken)).toBeUndefined();
  });

  it('stops the refresh token from minting a new pair', async () => {
    const { createUser, createWorkspace, grantWorkspaceAccess, revokeWorkspaceAccess } =
      await import('@/lib/auth/system-database');
    const { rotateRefreshToken } = await import('@/lib/mcp/store');

    const owner = createUser('o2@a.test', 'x');
    const member = createUser('m2@a.test', 'x');
    const workspace = createWorkspace('W', owner);
    grantWorkspaceAccess(member, workspace, 'editor');

    const { tokens, clientId } = await seedGrant(member, workspace);
    revokeWorkspaceAccess(member, workspace);

    const rotated = rotateRefreshToken(tokens.refreshToken, clientId);
    expect(rotated.ok).toBe(false);
  });

  it('leaves a grant for a different workspace alone', async () => {
    const { createUser, createWorkspace, grantWorkspaceAccess, revokeWorkspaceAccess } =
      await import('@/lib/auth/system-database');
    const { subjectForAccessToken } = await import('@/lib/mcp/store');

    const owner = createUser('o3@a.test', 'x');
    const member = createUser('m3@a.test', 'x');
    const left = createWorkspace('Left', owner);
    const kept = createWorkspace('Kept', owner);
    grantWorkspaceAccess(member, left, 'editor');
    grantWorkspaceAccess(member, kept, 'editor');

    const leaving = await seedGrant(member, left);
    const staying = await seedGrant(member, kept);

    revokeWorkspaceAccess(member, left);

    expect(subjectForAccessToken(leaving.tokens.accessToken)).toBeUndefined();
    expect(subjectForAccessToken(staying.tokens.accessToken)).toBeDefined();
  });
});

describe('deactivating an account takes every grant with it', () => {
  it('revokes grants across all of the user\'s workspaces', async () => {
    const { createUser, createWorkspace, grantWorkspaceAccess, deactivateUser } =
      await import('@/lib/auth/system-database');
    const { subjectForAccessToken } = await import('@/lib/mcp/store');

    const owner = createUser('o4@a.test', 'x');
    const member = createUser('m4@a.test', 'x');
    const one = createWorkspace('One', owner);
    const two = createWorkspace('Two', owner);
    grantWorkspaceAccess(member, one, 'editor');
    grantWorkspaceAccess(member, two, 'editor');

    const first = await seedGrant(member, one);
    const second = await seedGrant(member, two);

    deactivateUser(member);

    expect(subjectForAccessToken(first.tokens.accessToken)).toBeUndefined();
    expect(subjectForAccessToken(second.tokens.accessToken)).toBeUndefined();
  });

  it('also revokes when the admin UI deactivates through updateUser', async () => {
    const { createUser, createWorkspace, grantWorkspaceAccess, updateUser } =
      await import('@/lib/auth/system-database');
    const { subjectForAccessToken } = await import('@/lib/mcp/store');

    const owner = createUser('o5@a.test', 'x');
    const member = createUser('m5@a.test', 'x');
    const workspace = createWorkspace('W', owner);
    grantWorkspaceAccess(member, workspace, 'editor');

    const { tokens } = await seedGrant(member, workspace);

    updateUser(member, { active: 0 });

    expect(subjectForAccessToken(tokens.accessToken)).toBeUndefined();
  });

  it('leaves another account\'s grant alone', async () => {
    const { createUser, createWorkspace, grantWorkspaceAccess, deactivateUser } =
      await import('@/lib/auth/system-database');
    const { subjectForAccessToken } = await import('@/lib/mcp/store');

    const owner = createUser('o6@a.test', 'x');
    const leaving = createUser('m6@a.test', 'x');
    const staying = createUser('m7@a.test', 'x');
    const workspace = createWorkspace('W', owner);
    grantWorkspaceAccess(leaving, workspace, 'editor');
    grantWorkspaceAccess(staying, workspace, 'editor');

    const goes = await seedGrant(leaving, workspace);
    const stays = await seedGrant(staying, workspace);

    deactivateUser(leaving);

    expect(subjectForAccessToken(goes.tokens.accessToken)).toBeUndefined();
    expect(subjectForAccessToken(stays.tokens.accessToken)).toBeDefined();
  });
});

describe('instances that never enabled the connector', () => {
  it('revokes access without touching the absent MCP tables', async () => {
    const { createUser, createWorkspace, grantWorkspaceAccess, revokeWorkspaceAccess, deactivateUser } =
      await import('@/lib/auth/system-database');

    const owner = createUser('o7@a.test', 'x');
    const member = createUser('m8@a.test', 'x');
    const workspace = createWorkspace('W', owner);
    grantWorkspaceAccess(member, workspace, 'editor');

    // initMcpSchema has never run, so mcp_grants does not exist.
    expect(() => revokeWorkspaceAccess(member, workspace)).not.toThrow();
    expect(() => deactivateUser(member)).not.toThrow();
  });
});
