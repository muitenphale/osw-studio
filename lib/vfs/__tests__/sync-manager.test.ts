import { afterEach, describe, expect, it, vi } from 'vitest';
import { SyncManager } from '../sync-manager';

const project = {
  id: 'project-1',
  name: 'Project',
  updatedAt: new Date('2026-07-18T10:00:00.000Z'),
  lastSyncedAt: new Date('2026-07-18T10:00:00.000Z'),
};

const unchangedFile = {
  id: 'file-1', projectId: project.id, path: '/index.html', name: 'index.html', type: 'html' as const,
  content: '<h1>Hi</h1>', mimeType: 'text/html', size: 11, createdAt: new Date('2026-07-18T09:00:00.000Z'),
  updatedAt: new Date('2026-07-18T10:00:00.000Z'), metadata: {},
};

afterEach(() => vi.unstubAllGlobals());

describe('SyncManager.pushProjectDelta', () => {
  it('does not upload a project whose manifest is unchanged', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        project,
        files: [{ path: '/index.html', updatedAt: unchangedFile.updatedAt, size: unchangedFile.size }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await new SyncManager().pushProjectDelta(project.id, project as any, [unchangedFile]);

    expect(result).toEqual({ success: true, project });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('?manifest=1');
  });

  it('uploads only changed files and explicit deletions', async () => {
    const changedFile = { ...unchangedFile, path: '/app.js', name: 'app.js', type: 'js' as const, content: 'console.log(1)', size: 14 };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          project,
          files: [
            { path: '/index.html', updatedAt: unchangedFile.updatedAt, size: unchangedFile.size },
            { path: '/removed.css', updatedAt: unchangedFile.updatedAt, size: 1 },
          ],
        }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ project }) });
    vi.stubGlobal('fetch', fetchMock);

    await new SyncManager().pushProjectDelta(project.id, project as any, [unchangedFile, changedFile]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const body = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(body.partial).toBe(true);
    expect(body.files).toHaveLength(1);
    expect(body.files[0].path).toBe('/app.js');
    expect(body.deletedPaths).toEqual(['/removed.css']);
  });

  it('sends every file, and deletes nothing, when the project is not on the server yet', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ status: 404, ok: false })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ project }) });
    vi.stubGlobal('fetch', fetchMock);

    await new SyncManager().pushProjectDelta(project.id, project as any, [unchangedFile]);

    // Two calls, not three: the 404 manifest is handed to the full push rather than re-fetched.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const body = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(body.files.map((f: { path: string }) => f.path)).toEqual(['/index.html']);
    expect(body.deletedPaths).toEqual([]);
  });
});
