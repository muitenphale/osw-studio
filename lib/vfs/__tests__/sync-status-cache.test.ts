import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * The server status is cached for 5s and shared by the sync badges, the sidebar count and the
 * background reconcile. Anything that changes what the server holds has to drop that cache, or the
 * next read is served a snapshot taken before the change.
 */

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn() }));

vi.mock('@/lib/api/backend-status', () => ({ apiFetch: mocks.apiFetch }));
vi.mock('@/lib/vfs', () => ({ vfs: { init: vi.fn(), listProjects: vi.fn(async () => []), getProject: vi.fn() } }));
vi.mock('@/lib/vfs/save-manager', () => ({ saveManager: { isDirty: () => false } }));
vi.mock('@/lib/vfs/sync-events', () => ({
  notifyServerProjectsChanged: vi.fn(),
  SERVER_PROJECTS_CHANGED: 'serverProjectsChanged',
}));
vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), warning: vi.fn(), success: vi.fn() } }));
vi.mock('@/lib/utils', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { fetchSyncStatus, invalidateSyncStatusCache } from '../auto-sync';

/** A response that resolves only when released, so a request can be held in flight. */
function deferredResponse(projects: string[]) {
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  const response = {
    ok: true,
    json: async () => {
      await gate;
      return { projects: projects.map((id) => ({ id, name: id, updatedAt: '2026-07-30T10:00:00.000Z' })) };
    },
  };
  return { response, release };
}

function immediate(projects: string[]) {
  return {
    ok: true,
    json: async () => ({ projects: projects.map((id) => ({ id, name: id, updatedAt: '2026-07-30T10:00:00.000Z' })) }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SERVER_MODE', 'true');
  invalidateSyncStatusCache();
});

afterEach(() => vi.unstubAllEnvs());

describe('sync status cache', () => {
  it('serves a repeat read from the cache', async () => {
    mocks.apiFetch.mockResolvedValue(immediate(['a']));

    await fetchSyncStatus();
    await fetchSyncStatus();

    expect(mocks.apiFetch).toHaveBeenCalledTimes(1);
  });

  it('refetches after the cache is dropped', async () => {
    mocks.apiFetch.mockResolvedValue(immediate(['a']));
    await fetchSyncStatus();

    invalidateSyncStatusCache();
    await fetchSyncStatus();

    expect(mocks.apiFetch).toHaveBeenCalledTimes(2);
  });

  // The gap: a request already in flight when the cache is dropped carries pre-change data. If it
  // is allowed to populate the cache on arrival, the invalidation is undone and the stale snapshot
  // is served for the rest of the TTL — which is exactly the window right after a push.
  it('does not let an in-flight response repopulate a dropped cache', async () => {
    const { response, release } = deferredResponse(['before-push']);
    mocks.apiFetch.mockResolvedValueOnce(response);
    const inFlight = fetchSyncStatus();

    // A push completes while that request is still open.
    invalidateSyncStatusCache();
    release();
    await inFlight;

    mocks.apiFetch.mockResolvedValue(immediate(['after-push']));
    const next = await fetchSyncStatus();

    expect(next.projects.map((p: { id: string }) => p.id)).toEqual(['after-push']);
    expect(mocks.apiFetch).toHaveBeenCalledTimes(2);
  });
});
