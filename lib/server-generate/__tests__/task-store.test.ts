import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { ServerTaskStore } from '../task-store';
import type { ServerTask } from '../types';

/**
 * Exercises the concrete SQLite persistence (schema, row<->task mapping, restart
 * recovery, prune) against a real in-memory better-sqlite3 database. The adapter is
 * mocked to hand the store that in-memory DB so no data/osws.sqlite file is touched.
 */
// task-store.ts is marked 'server-only'; neutralize the guard so it can load under vitest.
vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({ db: null as unknown as Database.Database }));

vi.mock('@/lib/vfs/adapters/server', () => ({
  getSQLiteAdapter: () => ({
    init: async () => {},
    getCoreDB: () => mocks.db,
  }),
}));

const RESTART_FAILURE = 'Server restarted before generation could finish';

function makeTask(overrides: Partial<ServerTask> = {}): ServerTask {
  const now = 1_000_000;
  return {
    taskId: 't1',
    projectId: 'p1',
    sessionId: 's1',
    status: 'running',
    startedAt: now,
    updatedAt: now,
    orchestrator: null,
    buildDeferred: false,
    pendingBuildResolve: null,
    ...overrides,
  };
}

beforeEach(() => {
  mocks.db = new Database(':memory:');
});

afterEach(() => {
  mocks.db.close();
});

describe('ServerTaskStore', () => {
  it('initialize creates the table and returns no rows for a fresh database', async () => {
    const store = new ServerTaskStore();
    const rows = await store.initialize();
    expect(rows).toEqual([]);
  });

  it('save then getById round-trips a task, mapping null columns to undefined', async () => {
    const store = new ServerTaskStore();
    await store.initialize();
    await store.save(makeTask({ status: 'completed', buildDeferred: true }));

    const task = await store.getById('t1');
    expect(task).toMatchObject({
      taskId: 't1',
      projectId: 'p1',
      sessionId: 's1',
      status: 'completed',
      buildDeferred: true,
    });
    // Absent optional columns come back as undefined, not null.
    expect(task?.workspaceId).toBeUndefined();
    expect(task?.prompt).toBeUndefined();
    expect(task?.failureReason).toBeUndefined();
  });

  it('does not persist the orchestrator or api-key-bearing fields', async () => {
    const store = new ServerTaskStore();
    await store.initialize();
    // orchestrator is a live object; it must be stripped before persistence.
    await store.save(makeTask({ orchestrator: {} as ServerTask['orchestrator'] }));

    const task = await store.getById('t1');
    expect(task).not.toHaveProperty('orchestrator');
    expect(task).not.toHaveProperty('pendingBuildResolve');
  });

  it('round-trips pendingApproval through JSON', async () => {
    const store = new ServerTaskStore();
    await store.initialize();
    const pendingApproval = { gateKey: 'search', command: 'search "weather"' };
    await store.save(makeTask({ pendingApproval }));

    const task = await store.getById('t1');
    expect(task?.pendingApproval).toEqual(pendingApproval);
  });

  it('stores a null pending_approval when the task has none', async () => {
    const store = new ServerTaskStore();
    await store.initialize();
    await store.save(makeTask()); // no pendingApproval

    const task = await store.getById('t1');
    expect(task?.pendingApproval).toBeNull();
  });

  it('maps a malformed pending_approval column back to null instead of throwing', async () => {
    const store = new ServerTaskStore();
    await store.initialize();
    await store.save(makeTask());
    // Corrupt the persisted JSON directly; a bad column must not crash the read.
    mocks.db.prepare('UPDATE server_generation_tasks SET pending_approval = ? WHERE task_id = ?')
      .run('{not valid json', 't1');

    const task = await store.getById('t1');
    expect(task?.pendingApproval).toBeNull();
  });

  it('save upserts on taskId, updating status but preserving startedAt', async () => {
    const store = new ServerTaskStore();
    await store.initialize();
    await store.save(makeTask({ status: 'running', startedAt: 1_000, updatedAt: 1_000 }));
    await store.save(makeTask({ status: 'completed', startedAt: 9_999, updatedAt: 2_000 }));

    const task = await store.getById('t1');
    expect(task?.status).toBe('completed');
    expect(task?.updatedAt).toBe(2_000);
    // ON CONFLICT does not touch started_at, so the original creation time survives.
    expect(task?.startedAt).toBe(1_000);
  });

  it('initialize flips interrupted (running/paused/stopping) tasks to failed, leaving terminal ones', async () => {
    // Use recent timestamps: initialize() runs a TTL prune (cutoff = now - 30min), so a
    // terminal seed with an ancient updatedAt would be swept before we could assert on it.
    const now = Date.now();
    const seed = new ServerTaskStore();
    await seed.initialize();
    await seed.save(makeTask({ taskId: 'run', status: 'running', updatedAt: now }));
    await seed.save(makeTask({ taskId: 'pause', status: 'paused', updatedAt: now }));
    await seed.save(makeTask({ taskId: 'stop', status: 'stopping', updatedAt: now }));
    await seed.save(makeTask({ taskId: 'done', status: 'completed', updatedAt: now }));

    // A fresh store on the same DB simulates a process restart.
    const restarted = new ServerTaskStore();
    await restarted.initialize();

    expect((await restarted.getById('run'))?.status).toBe('failed');
    expect((await restarted.getById('run'))?.failureReason).toBe(RESTART_FAILURE);
    expect((await restarted.getById('pause'))?.status).toBe('failed');
    expect((await restarted.getById('stop'))?.status).toBe('failed');
    // Already-terminal tasks are untouched.
    expect((await restarted.getById('done'))?.status).toBe('completed');
  });

  it('getBySession returns only that session\'s tasks, newest first', async () => {
    const store = new ServerTaskStore();
    await store.initialize();
    await store.save(makeTask({ taskId: 'a', sessionId: 's1', updatedAt: 100 }));
    await store.save(makeTask({ taskId: 'b', sessionId: 's1', updatedAt: 300 }));
    await store.save(makeTask({ taskId: 'c', sessionId: 's2', updatedAt: 200 }));

    const tasks = await store.getBySession('s1');
    expect(tasks.map((t) => t.taskId)).toEqual(['b', 'a']);
  });

  it('getBySession and getById return empty before initialize (table may not exist yet)', async () => {
    const store = new ServerTaskStore();
    expect(await store.getBySession('s1')).toEqual([]);
    expect(await store.getById('t1')).toBeNull();
  });

  it('prune deletes terminal tasks older than the cutoff, keeping recent and non-terminal ones', async () => {
    const store = new ServerTaskStore();
    await store.initialize();
    await store.save(makeTask({ taskId: 'old-done', status: 'completed', updatedAt: 100 }));
    await store.save(makeTask({ taskId: 'recent-done', status: 'completed', updatedAt: 500 }));
    await store.save(makeTask({ taskId: 'old-running', status: 'running', updatedAt: 100 }));

    await store.prune(300);

    expect(await store.getById('old-done')).toBeNull();
    expect(await store.getById('recent-done')).not.toBeNull();
    // Non-terminal tasks are never pruned regardless of age.
    expect(await store.getById('old-running')).not.toBeNull();
  });
});
