import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * The layout under /w/[workspaceId] calls verifyWorkspaceAccess, which the middleware cannot: it runs
 * on the Edge runtime and these tables are in SQLite. This pins the decision the layout depends on.
 */

vi.mock('server-only', () => ({}));

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'osws-ws-guard-'));
  vi.resetModules();
  vi.stubEnv('DATA_DIR', path.join(dir, 'data'));
});

afterEach(async () => {
  const { closeSystemDatabase } = await import('@/lib/auth/system-database');
  closeSystemDatabase();
  vi.unstubAllEnvs();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('verifyWorkspaceAccess', () => {
  it('refuses a workspace the user is not a member of', async () => {
    const { createUser, createWorkspace, verifyWorkspaceAccess } =
      await import('@/lib/auth/system-database');

    const owner = createUser('owner@a.test', 'x');
    const outsider = createUser('outsider@b.test', 'x');
    const workspace = createWorkspace('Theirs', owner);

    expect(() => verifyWorkspaceAccess(owner, workspace, 'viewer')).not.toThrow();
    expect(() => verifyWorkspaceAccess(outsider, workspace, 'viewer')).toThrow(/access denied/i);
  });

  it('lets an instance admin through, which is how support reaches a tenant workspace', async () => {
    const { createUser, createWorkspace, verifyWorkspaceAccess, updateUser } =
      await import('@/lib/auth/system-database');

    const owner = createUser('owner2@a.test', 'x');
    const admin = createUser('admin@a.test', 'x');
    updateUser(admin, { is_admin: 1 });
    const workspace = createWorkspace('Theirs', owner);

    expect(() => verifyWorkspaceAccess(admin, workspace, 'viewer')).not.toThrow();
  });
});

describe('verifyWorkspaceAccess and deactivated accounts', () => {
  it('refuses a member whose account has been deactivated', async () => {
    const { createUser, createWorkspace, grantWorkspaceAccess, verifyWorkspaceAccess, deactivateUser } =
      await import('@/lib/auth/system-database');

    const owner = createUser('owner3@a.test', 'x');
    const member = createUser('member@a.test', 'x');
    const workspace = createWorkspace('Ours', owner);
    grantWorkspaceAccess(member, workspace, 'editor');

    expect(() => verifyWorkspaceAccess(member, workspace, 'editor')).not.toThrow();

    // The access row survives deactivation, so a check that reads only that row still passes.
    deactivateUser(member);
    expect(() => verifyWorkspaceAccess(member, workspace, 'editor')).toThrow(/access denied/i);
  });

  it('refuses a deactivated instance admin who still holds an access row', async () => {
    const { createUser, createWorkspace, grantWorkspaceAccess, verifyWorkspaceAccess, updateUser } =
      await import('@/lib/auth/system-database');

    const owner = createUser('owner4@a.test', 'x');
    const admin = createUser('admin4@a.test', 'x');
    updateUser(admin, { is_admin: 1 });
    const workspace = createWorkspace('Theirs', owner);
    // The access row matters: without one a deactivated admin is refused for the wrong reason,
    // by failing the membership check rather than the account check.
    grantWorkspaceAccess(admin, workspace, 'owner');

    expect(() => verifyWorkspaceAccess(admin, workspace, 'viewer')).not.toThrow();
    updateUser(admin, { active: 0 });
    expect(() => verifyWorkspaceAccess(admin, workspace, 'viewer')).toThrow(/access denied/i);
  });

  it('still lets the legacy principals through, which have no users row', async () => {
    const { createUser, createWorkspace, verifyWorkspaceAccess } =
      await import('@/lib/auth/system-database');

    const owner = createUser('owner5@a.test', 'x');
    const workspace = createWorkspace('Theirs', owner);

    for (const principal of ['admin', 'desktop', 'instance-api']) {
      expect(() => verifyWorkspaceAccess(principal, workspace, 'owner')).not.toThrow();
    }
  });
});
