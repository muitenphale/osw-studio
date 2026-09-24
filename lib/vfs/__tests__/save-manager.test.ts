import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  createCheckpoint: vi.fn(),
  unpinCheckpoint: vi.fn(),
  checkpointExists: vi.fn(),
  restoreCheckpoint: vi.fn(),
  getProject: vi.fn(),
  updateProject: vi.fn(),
  scheduleAutoSync: vi.fn(),
  init: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/utils', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../checkpoint', () => ({
  checkpointManager: {
    createCheckpoint: mocks.createCheckpoint,
    unpinCheckpoint: mocks.unpinCheckpoint,
    checkpointExists: mocks.checkpointExists,
    restoreCheckpoint: mocks.restoreCheckpoint,
  },
}));

vi.mock('../index', () => ({
  getActiveVFS: () => ({
    init: mocks.init,
    getProject: mocks.getProject,
    updateProject: mocks.updateProject,
    scheduleAutoSync: mocks.scheduleAutoSync,
  }),
}));

import { saveManager } from '../save-manager';

const PROJECT = 'proj-1';

describe('saveManager.save', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createCheckpoint.mockResolvedValue({
      id: 'cp_new',
      timestamp: '2026-09-20T12:00:00.000Z',
    });
    mocks.unpinCheckpoint.mockResolvedValue(true);
    mocks.getProject.mockResolvedValue({
      id: PROJECT,
      lastSavedCheckpointId: 'cp_old',
    });
  });

  it('pins the new save at create and unpins the previous save after the pointer moves', async () => {
    await saveManager.save(PROJECT, 'Manual save');

    expect(mocks.createCheckpoint).toHaveBeenCalledWith(
      PROJECT,
      'Manual save',
      expect.objectContaining({ kind: 'manual', pinned: true, baseRevisionId: 'cp_old' }),
    );
    expect(mocks.updateProject).toHaveBeenCalled();
    const written = mocks.updateProject.mock.calls[0][0];
    expect(written.lastSavedCheckpointId).toBe('cp_new');
    expect(mocks.updateProject.mock.calls[1][1]).toEqual({ preserveUpdatedAt: true });
    expect(mocks.unpinCheckpoint).toHaveBeenCalledWith('cp_old');
  });

  it('records lastSavedAt from the stamped updatedAt so a later open can see a draft', async () => {
    mocks.updateProject.mockImplementation(async (project: { updatedAt?: Date; lastSavedAt?: Date }) => {
      if (!project.updatedAt) project.updatedAt = new Date('2026-09-20T12:00:01.000Z');
    });

    await saveManager.save(PROJECT);

    expect(mocks.updateProject.mock.calls[0][0].lastSavedCheckpointId).toBe('cp_new');
    expect(mocks.updateProject.mock.calls[1][0].lastSavedAt).toEqual(new Date('2026-09-20T12:00:01.000Z'));
  });

  it('on discard, sets updatedAt back to lastSavedAt so the restored save is not a new draft', async () => {
    const savedAt = new Date('2026-09-20T12:00:00.000Z');
    mocks.getProject.mockResolvedValue({
      id: PROJECT,
      lastSavedCheckpointId: 'cp_new',
      lastSavedAt: savedAt,
      updatedAt: new Date('2026-09-20T12:05:00.000Z'),
    });
    mocks.checkpointExists.mockResolvedValue(true);
    mocks.restoreCheckpoint.mockResolvedValue(true);

    expect(await saveManager.restoreLastSaved(PROJECT)).toBe(true);
    expect(mocks.updateProject).toHaveBeenCalledWith(
      expect.objectContaining({ updatedAt: savedAt, lastSavedAt: savedAt }),
      { preserveUpdatedAt: true },
    );
  });

  it('does not unpin when this is the first save', async () => {
    mocks.getProject.mockResolvedValue({ id: PROJECT, lastSavedCheckpointId: null });

    await saveManager.save(PROJECT);

    expect(mocks.unpinCheckpoint).not.toHaveBeenCalled();
    expect(mocks.createCheckpoint).toHaveBeenCalledWith(
      PROJECT,
      expect.any(String),
      expect.objectContaining({ pinned: true, baseRevisionId: null }),
    );
  });
});
