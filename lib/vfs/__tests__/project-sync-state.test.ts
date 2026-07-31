// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Sync status used to be computed only inside the Server Sync dialog, so drift was invisible
 * everywhere else. This is the shared state the project cards and the sidebar count read from.
 */

const mocks = vi.hoisted(() => ({
  init: vi.fn(),
  listProjects: vi.fn(),
  fetchSyncStatus: vi.fn(),
}));

vi.mock('@/lib/vfs', () => ({ vfs: { init: mocks.init, listProjects: mocks.listProjects } }));
vi.mock('@/lib/vfs/auto-sync', () => ({ fetchSyncStatus: mocks.fetchSyncStatus }));
vi.mock('@/lib/utils', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const T_OLD = new Date('2026-07-30T10:00:00.000Z');
const T_SYNC = new Date('2026-07-30T10:00:05.000Z');
const T_NEW = new Date('2026-07-30T10:00:09.000Z');

async function loadModule() {
  vi.resetModules();
  return import('../project-sync-state');
}

function serverHas(projects: Array<{ id: string; updatedAt: Date }>) {
  mocks.fetchSyncStatus.mockResolvedValue({
    projects: projects.map((p) => ({ id: p.id, name: p.id, updatedAt: p.updatedAt.toISOString() })),
  });
}

describe('project sync state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_SERVER_MODE', 'true');
    mocks.init.mockResolvedValue(undefined);
    serverHas([]);
    mocks.listProjects.mockResolvedValue([]);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('classifies each project and counts the ones needing attention', async () => {
    mocks.listProjects.mockResolvedValue([
      { id: 'synced', updatedAt: T_OLD, serverUpdatedAt: T_OLD, lastSyncedAt: T_SYNC },
      { id: 'drifted', updatedAt: T_NEW, serverUpdatedAt: T_OLD, lastSyncedAt: T_SYNC },
      { id: 'neverPushed', updatedAt: T_OLD },
      { id: 'behind', updatedAt: T_OLD, serverUpdatedAt: T_OLD, lastSyncedAt: T_SYNC },
    ]);
    serverHas([
      { id: 'synced', updatedAt: T_OLD },
      { id: 'drifted', updatedAt: T_OLD },
      { id: 'behind', updatedAt: T_NEW },
    ]);

    const mod = await loadModule();
    await mod.refreshProjectSyncState();
    const state = mod.getProjectSyncState();

    expect(state.statuses.get('synced')).toBe('synced');
    expect(state.statuses.get('drifted')).toBe('local-newer');
    expect(state.statuses.get('neverPushed')).toBe('local-only');
    expect(state.statuses.get('behind')).toBe('server-newer');
    // 'behind' is the server's problem to hand over, not something the user must push.
    expect(state.pendingCount).toBe(2);
    expect(state.loaded).toBe(true);
  });

  it('notifies subscribers when the state changes', async () => {
    mocks.listProjects.mockResolvedValue([{ id: 'p1', updatedAt: T_OLD }]);
    const mod = await loadModule();
    const listener = vi.fn();
    mod.subscribeProjectSyncState(listener);

    await mod.refreshProjectSyncState();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].pendingCount).toBe(1);
  });

  it('shares one request between concurrent callers', async () => {
    mocks.listProjects.mockResolvedValue([{ id: 'p1', updatedAt: T_OLD }]);
    const mod = await loadModule();

    await Promise.all([
      mod.refreshProjectSyncState(),
      mod.refreshProjectSyncState(),
      mod.refreshProjectSyncState(),
    ]);

    expect(mocks.fetchSyncStatus).toHaveBeenCalledTimes(1);
  });

  it('does nothing in browser mode', async () => {
    vi.stubEnv('NEXT_PUBLIC_SERVER_MODE', 'false');
    const mod = await loadModule();

    await mod.refreshProjectSyncState();

    expect(mocks.fetchSyncStatus).not.toHaveBeenCalled();
    expect(mod.getProjectSyncState().loaded).toBe(false);
  });

  // fetchSyncStatus resolves null on failure — it never rejects — so this, not a thrown error, is
  // the real degraded path. Treating null as "the server has no projects" showed every project as
  // "Local only" exactly when the backend was unreachable and the user could not check.
  it('keeps the last known state when the status request fails', async () => {
    mocks.listProjects.mockResolvedValue([
      { id: 'p1', updatedAt: T_OLD, serverUpdatedAt: T_OLD, lastSyncedAt: T_SYNC },
    ]);
    serverHas([{ id: 'p1', updatedAt: T_OLD }]);
    const mod = await loadModule();
    await mod.refreshProjectSyncState();
    const before = mod.getProjectSyncState();
    expect(before.statuses.get('p1')).toBe('synced');
    expect(before.pendingCount).toBe(0);

    mocks.fetchSyncStatus.mockResolvedValue(null);
    await mod.refreshProjectSyncState();

    const after = mod.getProjectSyncState();
    expect(after).toBe(before);
    expect(after.statuses.get('p1')).toBe('synced');
    expect(after.pendingCount).toBe(0);
  });

  it('does not notify subscribers when the status request fails', async () => {
    mocks.listProjects.mockResolvedValue([{ id: 'p1', updatedAt: T_OLD }]);
    const mod = await loadModule();
    mocks.fetchSyncStatus.mockResolvedValue(null);
    const listener = vi.fn();
    mod.subscribeProjectSyncState(listener);

    await mod.refreshProjectSyncState();

    expect(listener).not.toHaveBeenCalled();
    expect(mod.getProjectSyncState().loaded).toBe(false);
  });

  it('still surfaces a thrown error without wiping state', async () => {
    mocks.listProjects.mockResolvedValue([{ id: 'p1', updatedAt: T_OLD }]);
    const mod = await loadModule();
    mocks.fetchSyncStatus.mockRejectedValue(new Error('offline'));

    await expect(mod.refreshProjectSyncState()).resolves.toBeUndefined();
    expect(mod.getProjectSyncState().loaded).toBe(false);
  });
});
