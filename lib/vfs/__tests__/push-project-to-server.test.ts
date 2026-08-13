import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Isolate the push helper from the real VFS / sync manager / UI.
const mocks = vi.hoisted(() => ({
  getProject: vi.fn(),
  listFiles: vi.fn(),
  updateProject: vi.fn(),
  pushSingleProject: vi.fn(),
  pushProjectDelta: vi.fn(),
  getSyncManager: vi.fn(),
  toastError: vi.fn(),
  toastLoading: vi.fn((_text: string) => 'toast-id'),
  toastSuccess: vi.fn(),
  toastDismiss: vi.fn(),
}));

vi.mock('@/lib/vfs', () => ({
  vfs: {
    getProject: mocks.getProject,
    listFiles: mocks.listFiles,
    updateProject: mocks.updateProject,
  },
}));
vi.mock('@/lib/vfs/sync-manager', () => ({
  getSyncManager: mocks.getSyncManager.mockReturnValue({
    pushSingleProject: mocks.pushSingleProject,
    pushProjectDelta: mocks.pushProjectDelta,
  }),
}));
vi.mock('sonner', () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
    loading: mocks.toastLoading,
    dismiss: mocks.toastDismiss,
  },
}));
vi.mock('@/lib/utils', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { pushProjectToServer } from '../push-project-to-server';

describe('pushProjectToServer (issue #13)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSyncManager.mockReturnValue({
      pushSingleProject: mocks.pushSingleProject,
      pushProjectDelta: mocks.pushProjectDelta,
    });
    vi.stubEnv('NEXT_PUBLIC_SERVER_MODE', 'true');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('pushes the project and records sync metadata in server mode', async () => {
    mocks.getProject.mockResolvedValue({ id: 'p1', settings: {} });
    mocks.listFiles.mockResolvedValue([{ path: '/index.html' }]);
    mocks.pushSingleProject.mockResolvedValue({
      success: true,
      project: { updatedAt: '2026-07-01T00:00:00.000Z' },
    });

    await pushProjectToServer('p1', 'w1');

    expect(mocks.getSyncManager).toHaveBeenCalledWith('w1');
    expect(mocks.pushSingleProject).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({ id: 'p1' }),
      [{ path: '/index.html' }],
      expect.objectContaining({ onProgress: expect.any(Function) })
    );
    // Sync metadata written back to the local project.
    const updated = mocks.updateProject.mock.calls[0]?.[0];
    expect(updated.lastSyncedAt).toBeInstanceOf(Date);
    expect(updated.serverUpdatedAt).toBeInstanceOf(Date);
  });

  it('is a no-op in browser mode (never touches the server)', async () => {
    vi.stubEnv('NEXT_PUBLIC_SERVER_MODE', 'false');

    await pushProjectToServer('p1', 'w1');

    expect(mocks.getProject).not.toHaveBeenCalled();
    expect(mocks.pushSingleProject).not.toHaveBeenCalled();
  });

  it('shows an error toast and does not update metadata when the push fails', async () => {
    mocks.getProject.mockResolvedValue({ id: 'p1', settings: {} });
    mocks.listFiles.mockResolvedValue([]);
    mocks.pushSingleProject.mockResolvedValue({ success: false, error: 'server down' });

    await pushProjectToServer('p1');

    expect(mocks.toastError).toHaveBeenCalled();
    expect(mocks.updateProject).not.toHaveBeenCalled();
  });

  it('returns quietly when the project is not found', async () => {
    mocks.getProject.mockResolvedValue(null);

    await pushProjectToServer('missing');

    expect(mocks.pushSingleProject).not.toHaveBeenCalled();
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it('swallows errors so import/duplicate is not aborted', async () => {
    mocks.getProject.mockRejectedValue(new Error('boom'));

    await expect(pushProjectToServer('p1')).resolves.toBeUndefined();
    expect(mocks.updateProject).not.toHaveBeenCalled();
  });

  // The reconcile pushes routinely; a full push sends every file, so it has to take the delta
  // path instead.
  it('uses the delta push when asked, not the full one', async () => {
    mocks.getProject.mockResolvedValue({ id: 'p1', settings: {} });
    mocks.listFiles.mockResolvedValue([{ path: '/index.html' }]);
    mocks.pushProjectDelta.mockResolvedValue({
      success: true,
      project: { updatedAt: '2026-07-01T00:00:00.000Z' },
    });

    await pushProjectToServer('p1', 'w1', { delta: true });

    expect(mocks.pushProjectDelta).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({ id: 'p1' }),
      [{ path: '/index.html' }],
      expect.objectContaining({ onProgress: expect.any(Function) })
    );
    expect(mocks.pushSingleProject).not.toHaveBeenCalled();
    expect(mocks.updateProject).toHaveBeenCalled();
  });

  it('stays silent on failure when the caller asks it to', async () => {
    mocks.getProject.mockResolvedValue({ id: 'p1', settings: {} });
    mocks.listFiles.mockResolvedValue([]);
    mocks.pushProjectDelta.mockResolvedValue({ success: false, error: 'conflict' });

    await pushProjectToServer('p1', 'w1', { delta: true, silent: true });

    // A background reconcile must not interrupt with a toast; a conflict is resolved in Server Sync.
    expect(mocks.toastError).not.toHaveBeenCalled();
    expect(mocks.updateProject).not.toHaveBeenCalled();
  });

  // Duplicate and import announce their own result right after this returns, so a push that
  // finishes in one request has nothing to add and should stay out of the way.
  it('raises no toast for a push that fits in one request', async () => {
    mocks.getProject.mockResolvedValue({ id: 'p1', name: 'Small', settings: {} });
    mocks.listFiles.mockResolvedValue([{ path: '/index.html' }]);
    mocks.pushSingleProject.mockImplementation(async (_id, _p, _f, options) => {
      options?.onProgress?.({ batch: 1, batches: 1 });
      return { success: true, project: { updatedAt: '2026-07-01T00:00:00.000Z' } };
    });

    await pushProjectToServer('p1', 'w1');

    expect(mocks.toastLoading).not.toHaveBeenCalled();
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it('reports progress for a chunked push, then clears it', async () => {
    mocks.getProject.mockResolvedValue({ id: 'p1', name: 'Big', settings: {} });
    mocks.listFiles.mockResolvedValue([{ path: '/index.html' }]);
    mocks.pushSingleProject.mockImplementation(async (_id, _p, _f, options) => {
      options?.onProgress?.({ batch: 1, batches: 3 });
      options?.onProgress?.({ batch: 2, batches: 3 });
      options?.onProgress?.({ batch: 3, batches: 3 });
      return { success: true, project: { updatedAt: '2026-07-01T00:00:00.000Z' } };
    });

    await pushProjectToServer('p1', 'w1');

    expect(mocks.toastLoading).toHaveBeenCalledTimes(3);
    expect(mocks.toastLoading.mock.calls[2][0]).toContain('3/3');
    // Cleared rather than resolved to a success message: the caller announces the outcome.
    expect(mocks.toastDismiss).toHaveBeenCalledWith('toast-id');
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });

  it('still toasts on failure by default', async () => {
    mocks.getProject.mockResolvedValue({ id: 'p1', settings: {} });
    mocks.listFiles.mockResolvedValue([]);
    mocks.pushSingleProject.mockResolvedValue({ success: false, error: 'server down' });

    await pushProjectToServer('p1', 'w1');

    expect(mocks.toastError).toHaveBeenCalled();
  });
});
