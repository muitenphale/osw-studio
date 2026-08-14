import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { NextRequest } from 'next/server';
import { SQLiteAdapter } from '@/lib/vfs/adapters/sqlite-adapter';

/**
 * What the workspace is told it occupies.
 *
 * A published deployment hardlinks the blobs the project already holds, so the same bytes appear
 * under two paths while costing disk once. Reporting them twice would tell someone their 100MB
 * project fills a 200MB allowance the moment they publish it, and the figure that stops the next
 * write would disagree with the one on screen.
 */

const mocks = vi.hoisted(() => ({
  getWorkspaceContext: vi.fn(),
  getWorkspaceById: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/api/workspace-context', () => ({ getWorkspaceContext: mocks.getWorkspaceContext }));
vi.mock('@/lib/auth/system-database', () => ({ getWorkspaceById: mocks.getWorkspaceById }));
vi.mock('@/lib/utils', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

let dir: string;
let adapter: SQLiteAdapter;
let workspaceId: string;
let counter = 0;

const MB = 1024 * 1024;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'osws-quota-'));
  // A fresh id per test: the route caches the measurement per workspace for a minute.
  workspaceId = `w${++counter}-${Date.now()}`;

  vi.stubEnv('DATA_DIR', path.join(dir, 'data'));
  vi.stubEnv('DEPLOYMENTS_STATIC_DIR', path.join(dir, 'static'));

  const wsDir = path.join(dir, 'data', 'workspaces', workspaceId);
  fs.mkdirSync(wsDir, { recursive: true });
  adapter = new SQLiteAdapter(path.join(wsDir, 'osws.sqlite'));
  await adapter.init();

  mocks.getWorkspaceContext.mockResolvedValue({ adapter, workspaceId, session: { userId: 'u1' } });
  mocks.getWorkspaceById.mockReturnValue({ id: workspaceId, max_projects: 10, max_deployments: 10, max_storage_mb: 500 });
});

afterEach(async () => {
  await adapter.close?.();
  vi.unstubAllEnvs();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function reportedStorageMb(): Promise<number> {
  const { GET } = await import('../route');
  const response = await GET(
    new NextRequest(`http://localhost/api/w/${workspaceId}/sync/status`),
    { params: Promise.resolve({ workspaceId }) }
  );
  const body = await response.json();
  return body.quota.storage.usedMb;
}

describe('reported storage', () => {
  it('counts a published deployment\'s shared bytes once', async () => {
    // 8MB of media in the workspace, and a deployment serving it by hardlink.
    const blobs = path.join(dir, 'data', 'workspaces', workspaceId, 'blobs');
    fs.mkdirSync(blobs, { recursive: true });
    const blob = path.join(blobs, 'abc123');
    fs.writeFileSync(blob, Buffer.alloc(8 * MB, 1));

    const served = path.join(dir, 'static', 'd1');
    fs.mkdirSync(served, { recursive: true });
    fs.linkSync(blob, path.join(served, 'photo.jpg'));

    await adapter.createProject({
      id: 'p1', name: 'P', createdAt: new Date(), updatedAt: new Date(), settings: {},
    } as never);
    await adapter.createDeployment?.({
      id: 'd1', projectId: 'p1', name: 'Site', enabled: true,
      createdAt: new Date(), updatedAt: new Date(),
    } as never);

    const usedMb = await reportedStorageMb();

    // Around 8, not around 16. Generous bounds: the database file is in there too.
    expect(usedMb).toBeGreaterThanOrEqual(8);
    expect(usedMb).toBeLessThan(12);
  });

  it('still counts a copy that had to be made', async () => {
    // Where the deployment output is on another filesystem, publishing copies instead of linking
    // and the workspace really does hold both. The figure has to say so.
    const blobs = path.join(dir, 'data', 'workspaces', workspaceId, 'blobs');
    fs.mkdirSync(blobs, { recursive: true });
    fs.writeFileSync(path.join(blobs, 'abc123'), Buffer.alloc(8 * MB, 1));

    const served = path.join(dir, 'static', 'd1');
    fs.mkdirSync(served, { recursive: true });
    fs.writeFileSync(path.join(served, 'photo.jpg'), Buffer.alloc(8 * MB, 1));

    await adapter.createProject({
      id: 'p1', name: 'P', createdAt: new Date(), updatedAt: new Date(), settings: {},
    } as never);
    await adapter.createDeployment?.({
      id: 'd1', projectId: 'p1', name: 'Site', enabled: true,
      createdAt: new Date(), updatedAt: new Date(),
    } as never);

    expect(await reportedStorageMb()).toBeGreaterThanOrEqual(16);
  });
});
