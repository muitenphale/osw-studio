import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

vi.mock('server-only', () => ({}));

/**
 * `MCP_DEV_TOKEN` is a bearer that skips consent entirely: no grant row, so it appears in no
 * Settings list and cannot be revoked from the app. That is a reasonable local shortcut and a
 * permanent unseen key on a real instance, so it has to refuse to work in production, and the
 * scopes it hands out have to be real ones rather than whatever the variable happens to say.
 */

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'osws-devtoken-'));
  vi.stubEnv('DATA_DIR', dir);
});
afterEach(async () => {
  const { closeSystemDatabase } = await import('@/lib/auth/system-database');
  closeSystemDatabase();
  vi.unstubAllEnvs();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function verify(token: string) {
  vi.resetModules();
  const { mcpTokenVerifier } = await import('../auth');
  return mcpTokenVerifier().verifyAccessToken(token);
}

describe('the development token', () => {
  it('is refused in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('MCP_DEV_TOKEN', 'shortcut');
    vi.stubEnv('MCP_DEV_USER_ID', 'u1');
    vi.stubEnv('MCP_DEV_WORKSPACE_ID', 'w1');

    await expect(verify('shortcut')).rejects.toThrow();
  });

  it('works outside production', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('MCP_DEV_TOKEN', 'shortcut');
    vi.stubEnv('MCP_DEV_USER_ID', 'u1');
    vi.stubEnv('MCP_DEV_WORKSPACE_ID', 'w1');

    const auth = await verify('shortcut');
    expect(auth.extra).toMatchObject({ userId: 'u1', workspaceId: 'w1' });
  });

  it('ignores a scope that is not a real one', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('MCP_DEV_TOKEN', 'shortcut');
    vi.stubEnv('MCP_DEV_USER_ID', 'u1');
    vi.stubEnv('MCP_DEV_WORKSPACE_ID', 'w1');
    vi.stubEnv('MCP_DEV_SCOPES', 'projects:read, not-a-scope ,workspace:admin');

    const auth = await verify('shortcut');
    expect(auth.scopes).toEqual(['projects:read']);
  });

  it('still refuses a wrong token', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('MCP_DEV_TOKEN', 'shortcut');
    vi.stubEnv('MCP_DEV_USER_ID', 'u1');
    vi.stubEnv('MCP_DEV_WORKSPACE_ID', 'w1');

    await expect(verify('wrong-one')).rejects.toThrow();
  });
});
