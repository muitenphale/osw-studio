import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  loading: vi.fn((_text: string, _options?: { id?: string | number }) => 'toast-id'),
  success: vi.fn((_text: string, _options?: { id?: string | number }) => 'toast-id'),
  error: vi.fn((_text: string, _options?: { id?: string | number }) => 'toast-id'),
  dismiss: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    loading: mocks.loading,
    success: mocks.success,
    error: mocks.error,
    dismiss: mocks.dismiss,
  },
}));

import { createSyncProgressToast, silentProgressToast } from '../sync-progress-toast';

/**
 * The handle exists so a chunked push can report where it is. The part worth pinning is when it
 * says *nothing*: most pushes fit in one request and their callers already announce the result,
 * so a progress toast for those is noise stacked on a message the user was going to read anyway.
 */
describe('createSyncProgressToast', () => {
  beforeEach(() => vi.clearAllMocks());

  it('stays quiet while the work is a single step', () => {
    const progress = createSyncProgressToast('Syncing');

    progress.update(1, 1);

    expect(mocks.loading).not.toHaveBeenCalled();
  });

  it('appears once the work turns out to be a sequence, and updates in place', () => {
    const progress = createSyncProgressToast('Syncing');

    progress.update(1, 3);
    progress.update(2, 3);

    expect(mocks.loading).toHaveBeenCalledTimes(2);
    expect(mocks.loading.mock.calls[0][0]).toBe('Syncing (1/3)');
    // The second call reuses the first toast rather than stacking a new one.
    expect(mocks.loading.mock.calls[1][1]).toEqual({ id: 'toast-id' });
  });

  it('reports an outcome even when no progress toast was ever raised', () => {
    const progress = createSyncProgressToast('Syncing');

    progress.error('Sync failed');

    // An error must reach the user whether or not the work was long enough to show progress.
    expect(mocks.error).toHaveBeenCalledWith('Sync failed');
  });

  it('resolves the progress toast it raised rather than leaving it spinning', () => {
    const progress = createSyncProgressToast('Syncing');

    progress.update(1, 2);
    progress.success('Synced');

    expect(mocks.success).toHaveBeenCalledWith('Synced', { id: 'toast-id' });
  });

  it('clears a raised toast on dismiss, and does nothing when none was raised', () => {
    const raised = createSyncProgressToast('Syncing');
    raised.update(1, 2);
    raised.dismiss();
    expect(mocks.dismiss).toHaveBeenCalledWith('toast-id');

    mocks.dismiss.mockClear();
    createSyncProgressToast('Syncing').dismiss();
    expect(mocks.dismiss).not.toHaveBeenCalled();
  });

  it('has a silent handle that never touches sonner', () => {
    silentProgressToast.update(1, 9);
    silentProgressToast.success('Synced');
    silentProgressToast.error('Failed');
    silentProgressToast.dismiss();

    expect(mocks.loading).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.error).not.toHaveBeenCalled();
    expect(mocks.dismiss).not.toHaveBeenCalled();
  });
});
