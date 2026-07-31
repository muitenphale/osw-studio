import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { calculateItemSyncStatus } from '../sync-types';

/**
 * End-to-end regression for the "imported project shows Local newer" bug.
 *
 * The push itself always worked. What broke the status was the write that lands immediately
 * afterwards: opening a project records its starting checkpoint id on the project record, and that
 * write used to bump updatedAt past lastSyncedAt. Nothing pushes a bare vfs.updateProject, so
 * Server Sync reported "Local newer" forever.
 *
 * This runs against the real VirtualFileSystem over a real (fake) IndexedDB — only the network is
 * stubbed. An earlier version of this file simulated updateProject with a local copy of its logic,
 * which meant it would have passed even with the fix reverted.
 */

const mocks = vi.hoisted(() => ({ pushSingleProject: vi.fn(), pushProjectDelta: vi.fn() }));

vi.mock('@/lib/vfs/sync-manager', () => ({
  getSyncManager: () => ({
    pushSingleProject: mocks.pushSingleProject,
    pushProjectDelta: mocks.pushProjectDelta,
  }),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));

import { vfs } from '../index';
import { pushProjectToServer } from '../push-project-to-server';

/** What GET /sync/status reports: the push route stores the client's updatedAt verbatim. */
function serverUpdatedAtFor(updatedAt: Date): Date {
  return new Date(updatedAt);
}

let projectId: string;

const IMPORTED_AT = new Date('2026-07-30T10:00:00.000Z');
const PUSHED_AT = new Date('2026-07-30T10:00:05.000Z');
const LATER = new Date('2026-07-30T10:00:09.000Z');

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SERVER_MODE', 'true');
  // Only Date is faked: fake-indexeddb drives its requests off real timers, and faking those
  // deadlocks it. Real elapsed time between these steps is milliseconds at minimum, so pinning the
  // clock makes the ordering under test deterministic rather than a race with the suite's speed.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(IMPORTED_AT);
  await vfs.init();

  const project = await vfs.createProject('Imported', 'from a .json export');
  projectId = project.id;
  await vfs.createFile(projectId, '/index.html', '<h1>hi</h1>');

  // The push route echoes the project back with updatedAt untouched.
  mocks.pushSingleProject.mockImplementation(async (_id: string, p: { updatedAt: Date }) => ({
    success: true,
    project: { updatedAt: new Date(p.updatedAt).toISOString() },
  }));

  vi.setSystemTime(PUSHED_AT);
  await pushProjectToServer(projectId, 'w1');
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('imported project sync status', () => {
  it('reads as synced immediately after the import push', async () => {
    const project = await vfs.getProject(projectId);

    expect(project.lastSyncedAt).toBeInstanceOf(Date);
    expect(
      calculateItemSyncStatus(
        project.updatedAt,
        serverUpdatedAtFor(project.updatedAt),
        project.lastSyncedAt
      )
    ).toBe('synced');
  });

  // components/workspace/index.tsx records a starting checkpoint on the first open of every
  // project, including one that was just imported and pushed.
  it('stays synced when the "Project opened" checkpoint id is recorded', async () => {
    const before = await vfs.getProject(projectId);
    const serverUpdatedAt = serverUpdatedAtFor(before.updatedAt);

    vi.setSystemTime(LATER);
    before.lastSavedCheckpointId = 'cp-project-opened';
    await vfs.updateProject(before, { preserveUpdatedAt: true });

    const after = await vfs.getProject(projectId);
    expect(after.lastSavedCheckpointId).toBe('cp-project-opened');
    expect(after.updatedAt.getTime()).toBe(serverUpdatedAt.getTime());
    expect(calculateItemSyncStatus(after.updatedAt, serverUpdatedAt, after.lastSyncedAt)).toBe(
      'synced'
    );
  });

  // The other half of the contract: a write that is NOT local-only bookkeeping must still be
  // reported as drift, otherwise real edits would silently never sync.
  it('reports local-newer when a write does not preserve updatedAt', async () => {
    const before = await vfs.getProject(projectId);
    const serverUpdatedAt = serverUpdatedAtFor(before.updatedAt);

    vi.setSystemTime(LATER);
    before.name = 'Renamed';
    await vfs.updateProject(before);

    const after = await vfs.getProject(projectId);
    expect(after.updatedAt.getTime()).toBeGreaterThan(serverUpdatedAt.getTime());
    expect(calculateItemSyncStatus(after.updatedAt, serverUpdatedAt, after.lastSyncedAt)).toBe(
      'local-newer'
    );
  });

  it('persists the sync stamps as Dates across a reload', async () => {
    // Re-reading goes back through the adapter's hydration, which is what turns stored values
    // back into Dates — a string here silently reports 'synced' whatever the timestamps say.
    const reloaded = await vfs.getProject(projectId);

    expect(reloaded.lastSyncedAt).toBeInstanceOf(Date);
    expect(reloaded.serverUpdatedAt).toBeInstanceOf(Date);
  });
});
