import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Storage was metered in one route out of thirty-nine, which happened to be the one the publish flow
 * sent files through. Everything else wrote unmetered: the main push path, the agent shell, and the
 * MCP connector. The gate now sits with the write in `SQLiteAdapter`, which all of them reach.
 */

vi.mock('server-only', () => ({}));

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'osws-quota-'));
  vi.resetModules();
  vi.stubEnv('DATA_DIR', path.join(dir, 'data'));
  vi.stubEnv('DEPLOYMENTS_STATIC_DIR', path.join(dir, 'static'));
});

afterEach(async () => {
  const { closeSystemDatabase } = await import('@/lib/auth/system-database');
  closeSystemDatabase();
  vi.unstubAllEnvs();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function workspaceWithLimit(limitMb: number) {
  const { createUser, createWorkspace, updateWorkspace } = await import('@/lib/auth/system-database');
  const owner = createUser('o@a.test', 'x');
  const ws = createWorkspace('W', owner);
  updateWorkspace(ws, { max_storage_mb: limitMb });
  return ws;
}

const NO_DEPLOYMENTS = () => [];

describe('admitting a write against the limit', () => {
  it('measures the incoming bytes against the headroom, not just the current usage', async () => {
    const { admitWorkspaceWrite, StorageQuotaError } = await import('@/lib/api/storage-quota');
    const ws = await workspaceWithLimit(1);

    // Well under the limit on its own, over it together: the old check compared only what was
    // already stored, so a workspace just under its limit could commit a write of any size.
    expect(() => admitWorkspaceWrite(ws, 600 * 1024, NO_DEPLOYMENTS)).not.toThrow();
    expect(() => admitWorkspaceWrite(ws, 600 * 1024, NO_DEPLOYMENTS)).toThrow(StorageQuotaError);
  });

  it('counts a burst inside one cache window', async () => {
    const { admitWorkspaceWrite } = await import('@/lib/api/storage-quota');
    const ws = await workspaceWithLimit(1);

    let admitted = 0;
    for (let i = 0; i < 50; i++) {
      try { admitWorkspaceWrite(ws, 100 * 1024, NO_DEPLOYMENTS); admitted++; } catch { break; }
    }
    // 1MB of headroom in 100KB writes: ten get through, not all fifty against one stale measurement.
    expect(admitted).toBe(10);
  });

  it('admits a write that fits', async () => {
    const { admitWorkspaceWrite } = await import('@/lib/api/storage-quota');
    const ws = await workspaceWithLimit(10);
    expect(() => admitWorkspaceWrite(ws, 1024, NO_DEPLOYMENTS)).not.toThrow();
  });

  it('stands aside for a database with no workspace row', async () => {
    const { admitWorkspaceWrite } = await import('@/lib/api/storage-quota');
    // The shared database behind the legacy `admin` / `desktop` / `instance-api` ids, and a desktop
    // install, have no workspace record and therefore no limit.
    expect(() => admitWorkspaceWrite('desktop', 500 * 1024 * 1024, NO_DEPLOYMENTS)).not.toThrow();
  });

  it('counts the published output, so the figure enforced matches the one shown', async () => {
    const { admitWorkspaceWrite, workspaceStorageMb, StorageQuotaError } = await import('@/lib/api/storage-quota');
    const ws = await workspaceWithLimit(1);

    // A published deployment's files live outside the workspace directory. The old gate measured
    // only the workspace directory while Server Sync displayed both.
    const staticDir = path.join(dir, 'static', 'dep-1');
    fs.mkdirSync(staticDir, { recursive: true });
    fs.writeFileSync(path.join(staticDir, 'bundle.js'), Buffer.alloc(900 * 1024));

    const deployments = () => ['dep-1'];
    expect(workspaceStorageMb(ws, deployments)).toBeGreaterThan(0.8);
    expect(() => admitWorkspaceWrite(ws, 200 * 1024, deployments)).toThrow(StorageQuotaError);
  });

  it('names the limit in the message, so a route can report it', async () => {
    const { admitWorkspaceWrite, STORAGE_QUOTA_MESSAGE } = await import('@/lib/api/storage-quota');
    const ws = await workspaceWithLimit(1);
    try {
      admitWorkspaceWrite(ws, 2 * 1024 * 1024, NO_DEPLOYMENTS);
      throw new Error('expected a refusal');
    } catch (error) {
      expect((error as Error).message).toContain(STORAGE_QUOTA_MESSAGE);
      expect((error as Error).message).toContain('1 MB');
    }
  });
});
