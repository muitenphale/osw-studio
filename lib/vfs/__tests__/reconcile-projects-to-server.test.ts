import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Isolate the reconcile helper from the real VFS / push helper / UI. auto-sync imports several
// sibling modules at load time; mock them so importing the module under test is side-effect free.
const mocks = vi.hoisted(() => ({
  init: vi.fn(),
  listProjects: vi.fn(),
  getProject: vi.fn(),
  pushProjectToServer: vi.fn(),
  isDirty: vi.fn(),
  apiFetch: vi.fn(),
  notifyServerProjectsChanged: vi.fn(),
}));

vi.mock('@/lib/vfs', () => ({
  vfs: {
    init: mocks.init,
    listProjects: mocks.listProjects,
    getProject: mocks.getProject,
  },
}));
vi.mock('@/lib/vfs/push-project-to-server', () => ({
  pushProjectToServer: mocks.pushProjectToServer,
}));
vi.mock('@/lib/vfs/save-manager', () => ({ saveManager: { isDirty: mocks.isDirty } }));
vi.mock('@/lib/api/backend-status', () => ({ apiFetch: mocks.apiFetch }));
vi.mock('@/lib/vfs/sync-events', () => ({
  notifyServerProjectsChanged: mocks.notifyServerProjectsChanged,
  SERVER_PROJECTS_CHANGED: 'serverProjectsChanged',
}));
vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), warning: vi.fn(), success: vi.fn() } }));
vi.mock('@/lib/utils', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const T_OLD = new Date('2026-07-30T10:00:00.000Z');
const T_SYNC = new Date('2026-07-30T10:00:05.000Z');
const T_NEW = new Date('2026-07-30T10:00:09.000Z');

/** auto-sync caches /sync/status for 5s in module state; reload it so each case starts clean. */
async function loadReconcile() {
  vi.resetModules();
  const mod = await import('../auto-sync');
  return mod.reconcileProjectsToServer;
}

function serverHas(projects: Array<{ id: string; updatedAt: Date }>) {
  mocks.apiFetch.mockResolvedValue({
    ok: true,
    json: async () => ({
      projects: projects.map((p) => ({ id: p.id, name: p.id, updatedAt: p.updatedAt.toISOString() })),
    }),
  });
}

/** Stand in for a push that lands: the project comes back stamped and in sync. */
function pushLands() {
  const stamped = new Map<string, Date>();
  mocks.pushProjectToServer.mockImplementation(async (id: string) => {
    stamped.set(id, T_SYNC);
  });
  mocks.getProject.mockImplementation(async (id: string) => {
    const project = (await mocks.listProjects()).find((p: { id: string }) => p.id === id);
    if (!stamped.has(id)) return project;
    return { ...project, serverUpdatedAt: project.updatedAt, lastSyncedAt: T_NEW };
  });
  return stamped;
}

describe('reconcileProjectsToServer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.init.mockResolvedValue(undefined);
    mocks.isDirty.mockReturnValue(false);
    mocks.listProjects.mockResolvedValue([]);
    serverHas([]);
    vi.stubEnv('NEXT_PUBLIC_SERVER_MODE', 'true');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('is a no-op in browser mode (never lists or pushes)', async () => {
    vi.stubEnv('NEXT_PUBLIC_SERVER_MODE', 'false');
    const reconcile = await loadReconcile();

    const result = await reconcile('w1');

    expect(result).toEqual({ pushed: 0, skipped: 0, errors: 0 });
    expect(mocks.listProjects).not.toHaveBeenCalled();
    expect(mocks.pushProjectToServer).not.toHaveBeenCalled();
  });

  it('pushes a project the server has never seen, in full', async () => {
    mocks.listProjects.mockResolvedValue([{ id: 'local1', updatedAt: T_OLD }]);
    serverHas([]);
    pushLands();
    const reconcile = await loadReconcile();

    const result = await reconcile('w1');

    expect(mocks.pushProjectToServer).toHaveBeenCalledWith('local1', 'w1', { delta: false, silent: true });
    expect(result.pushed).toBe(1);
  });

  // The case the earlier local-only-projects reconcile could never fix: already on the server,
  // then changed locally by a write that does not sync itself.
  it('pushes a project whose local copy drifted ahead after an earlier sync', async () => {
    mocks.listProjects.mockResolvedValue([
      { id: 'drifted', updatedAt: T_NEW, serverUpdatedAt: T_OLD, lastSyncedAt: T_SYNC },
    ]);
    serverHas([{ id: 'drifted', updatedAt: T_OLD }]);
    pushLands();
    const reconcile = await loadReconcile();

    const result = await reconcile('w1');

    expect(mocks.pushProjectToServer).toHaveBeenCalledWith('drifted', 'w1', { delta: true, silent: true });
    expect(result.pushed).toBe(1);
  });

  it('leaves projects that are already in sync alone', async () => {
    mocks.listProjects.mockResolvedValue([
      { id: 'synced', updatedAt: T_OLD, serverUpdatedAt: T_OLD, lastSyncedAt: T_SYNC },
    ]);
    serverHas([{ id: 'synced', updatedAt: T_OLD }]);
    const reconcile = await loadReconcile();

    const result = await reconcile('w1');

    expect(mocks.pushProjectToServer).not.toHaveBeenCalled();
    expect(result).toEqual({ pushed: 0, skipped: 0, errors: 0 });
  });

  it('does not push a project the server is ahead on', async () => {
    mocks.listProjects.mockResolvedValue([
      { id: 'behind', updatedAt: T_OLD, serverUpdatedAt: T_OLD, lastSyncedAt: T_SYNC },
    ]);
    serverHas([{ id: 'behind', updatedAt: T_NEW }]);
    const reconcile = await loadReconcile();

    await reconcile('w1');

    expect(mocks.pushProjectToServer).not.toHaveBeenCalled();
  });

  it('does not push a conflict — only the user can resolve that', async () => {
    mocks.listProjects.mockResolvedValue([
      { id: 'both', updatedAt: T_NEW, serverUpdatedAt: T_OLD, lastSyncedAt: T_SYNC },
    ]);
    serverHas([{ id: 'both', updatedAt: T_NEW }]);
    const reconcile = await loadReconcile();

    await reconcile('w1');

    expect(mocks.pushProjectToServer).not.toHaveBeenCalled();
  });

  it('skips a project with unsaved local edits', async () => {
    mocks.listProjects.mockResolvedValue([
      { id: 'dirty', updatedAt: T_NEW, serverUpdatedAt: T_OLD, lastSyncedAt: T_SYNC },
    ]);
    serverHas([{ id: 'dirty', updatedAt: T_OLD }]);
    mocks.isDirty.mockReturnValue(true);
    const reconcile = await loadReconcile();

    const result = await reconcile('w1');

    expect(mocks.pushProjectToServer).not.toHaveBeenCalled();
    expect(result).toEqual({ pushed: 0, skipped: 1, errors: 0 });
  });

  it('counts an error when a push does not land', async () => {
    mocks.listProjects.mockResolvedValue([{ id: 'local1', updatedAt: T_OLD }]);
    serverHas([]);
    mocks.pushProjectToServer.mockResolvedValue(undefined);
    mocks.getProject.mockResolvedValue({ id: 'local1', updatedAt: T_OLD });
    const reconcile = await loadReconcile();

    const result = await reconcile('w1');

    expect(result.pushed).toBe(0);
    expect(result.errors).toBe(1);
  });

  it('keeps going when one push throws, counting it as an error', async () => {
    mocks.listProjects.mockResolvedValue([
      { id: 'local1', updatedAt: T_OLD },
      { id: 'local2', updatedAt: T_OLD },
    ]);
    serverHas([]);
    mocks.pushProjectToServer.mockImplementation(async (id: string) => {
      if (id === 'local1') throw new Error('boom');
    });
    mocks.getProject.mockImplementation(async (id: string) =>
      id === 'local2'
        ? { id, updatedAt: T_OLD, serverUpdatedAt: T_OLD, lastSyncedAt: T_NEW }
        : { id, updatedAt: T_OLD }
    );
    const reconcile = await loadReconcile();

    const result = await reconcile();

    expect(mocks.pushProjectToServer).toHaveBeenCalledTimes(2);
    expect(result.pushed).toBe(1);
    expect(result.errors).toBe(1);
  });

  it('announces the change so server-backed lists re-read', async () => {
    mocks.listProjects.mockResolvedValue([{ id: 'local1', updatedAt: T_OLD }]);
    serverHas([]);
    pushLands();
    const reconcile = await loadReconcile();

    await reconcile('w1');

    expect(mocks.notifyServerProjectsChanged).toHaveBeenCalled();
  });

  // fetchSyncStatus returns null for ANY failure. Reading that as "the server has no projects"
  // marked every project local-only and re-uploaded all of them, deleting and recreating every
  // server file — silently, because the reconcile suppresses its toasts.
  it('does nothing when the server status cannot be read', async () => {
    mocks.listProjects.mockResolvedValue([
      { id: 'p1', updatedAt: T_OLD, serverUpdatedAt: T_OLD, lastSyncedAt: T_SYNC },
      { id: 'p2', updatedAt: T_OLD, serverUpdatedAt: T_OLD, lastSyncedAt: T_SYNC },
    ]);
    mocks.apiFetch.mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
    const reconcile = await loadReconcile();

    const result = await reconcile('w1');

    expect(mocks.pushProjectToServer).not.toHaveBeenCalled();
    expect(result).toEqual({ pushed: 0, skipped: 0, errors: 0 });
  });

  it('does nothing when the status request throws', async () => {
    mocks.listProjects.mockResolvedValue([{ id: 'p1', updatedAt: T_OLD }]);
    mocks.apiFetch.mockRejectedValue(new Error('offline'));
    const reconcile = await loadReconcile();

    await reconcile('w1');

    expect(mocks.pushProjectToServer).not.toHaveBeenCalled();
  });

  // Contradictory evidence: the local record says it was pushed, the server list says it is not
  // there. Re-uploading would copy it into whichever workspace the list belongs to.
  it('skips a project that claims to be pushed but is absent from the server list', async () => {
    mocks.listProjects.mockResolvedValue([
      { id: 'elsewhere', updatedAt: T_NEW, serverUpdatedAt: T_OLD, lastSyncedAt: T_SYNC },
    ]);
    serverHas([{ id: 'a-different-project', updatedAt: T_OLD }]);
    const reconcile = await loadReconcile();

    const result = await reconcile('w1');

    expect(mocks.pushProjectToServer).not.toHaveBeenCalled();
    expect(result.skipped).toBe(1);
  });

  // syncStatus 'error' means the last PUSH failed — the local copy is complete and correct, the
  // server was simply unreachable. Retrying it is the whole point of this function. (An
  // interrupted PULL is handled by leaving its record untouched, not by a flag; see
  // pull-failure-recovery.test.ts.)
  it('retries a project whose last push failed', async () => {
    mocks.listProjects.mockResolvedValue([
      { id: 'pushFailed', updatedAt: T_NEW, serverUpdatedAt: T_OLD, lastSyncedAt: T_SYNC, syncStatus: 'error' },
    ]);
    serverHas([{ id: 'pushFailed', updatedAt: T_OLD }]);
    pushLands();
    const reconcile = await loadReconcile();

    const result = await reconcile('w1');

    expect(mocks.pushProjectToServer).toHaveBeenCalledWith('pushFailed', 'w1', { delta: true, silent: true });
    expect(result.pushed).toBe(1);
  });

  it('drops the cached server status after a push so the next read is real', async () => {
    mocks.listProjects.mockResolvedValue([{ id: 'local1', updatedAt: T_OLD }]);
    serverHas([]);
    pushLands();
    vi.resetModules();
    const mod = await import('../auto-sync');

    await mod.reconcileProjectsToServer('w1');
    mocks.apiFetch.mockClear();
    await mod.fetchSyncStatus();

    // Without invalidation this would be served from the 5s cache and make no request.
    expect(mocks.apiFetch).toHaveBeenCalled();
  });
});

