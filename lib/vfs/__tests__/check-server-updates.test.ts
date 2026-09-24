import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  getProject: vi.fn(),
  apiFetch: vi.fn(),
}));

vi.mock('@/lib/utils', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

vi.mock('@/lib/api/backend-status', () => ({ apiFetch: mocks.apiFetch }));

vi.mock('../index', () => ({
  vfs: { getProject: mocks.getProject, init: vi.fn(), listProjects: vi.fn(), listFiles: vi.fn() },
}));

vi.mock('../save-manager', () => ({
  saveManager: { runWithSuppressedDirty: async (_id: string, fn: () => Promise<unknown>) => fn() },
}));

import { checkServerUpdates } from '../auto-sync';

const T1 = new Date('2026-09-20T10:00:00.000Z');
const T2 = new Date('2026-09-20T10:00:05.000Z');
const T3 = new Date('2026-09-20T10:00:09.000Z');

describe('checkServerUpdates', () => {
  const previous = process.env.NEXT_PUBLIC_SERVER_MODE;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SERVER_MODE = 'true';
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_SERVER_MODE = previous;
  });

  it('is true only when the server is newer and the local copy has not also moved', async () => {
    mocks.getProject.mockResolvedValue({
      id: 'p1',
      updatedAt: T1,
      lastSyncedAt: T2,
    });
    mocks.apiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ projects: [{ id: 'p1', updatedAt: T3.toISOString() }] }),
    });

    expect(await checkServerUpdates('p1')).toBe(true);
  });

  it('is false for a conflict, so opening does not pull over a local draft', async () => {
    mocks.getProject.mockResolvedValue({
      id: 'p1',
      updatedAt: T3,
      lastSyncedAt: T2,
    });
    mocks.apiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ projects: [{ id: 'p1', updatedAt: T3.toISOString() }] }),
    });

    expect(await checkServerUpdates('p1')).toBe(false);
  });
});
