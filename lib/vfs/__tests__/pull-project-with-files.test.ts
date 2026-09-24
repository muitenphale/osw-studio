import { afterEach, describe, expect, it, vi } from 'vitest';
import { SyncManager } from '../sync-manager';

/**
 * Pulling one project used to fetch every project first and pick it out of the list.
 *
 * That list is the whole `projects` table, which is mostly base64 thumbnails: measured at 2.69MB
 * over the wire for 237 projects, 74% of it screenshots, to obtain one row. The path runs whenever
 * an MCP client changes a project and the open tab pulls it, so the cost landed on every such
 * change. A per-project endpoint already returns the project and its files together.
 */

const project = { id: 'project-1', name: 'Project', updatedAt: new Date('2026-07-18T10:00:00.000Z') };
const file = {
  path: '/index.html', name: 'index.html', type: 'html', content: '<h1>Hi</h1>',
  mimeType: 'text/html', size: 11, updatedAt: '2026-07-18T10:00:00.000Z',
};

afterEach(() => vi.unstubAllGlobals());

describe('SyncManager.pullProjectWithFiles', () => {
  it('asks for the one project, not the whole list', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, project, files: [file] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await new SyncManager().pullProjectWithFiles(project.id);

    expect(result.success).toBe(true);
    expect(result.project).toMatchObject({ id: project.id, name: 'Project' });
    expect(result.files?.map(f => f.path)).toEqual(['/index.html']);
    // One request, and it names the project.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain(`/sync/projects/${project.id}`);
    expect(url).not.toMatch(/\/sync\/projects$/);
  });

  it('reports a project the server does not have', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: 'Project not found' }),
    }));

    const result = await new SyncManager().pullProjectWithFiles('missing');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found/i);
  });

  it('decodes binary file content the way the list path did', async () => {
    // The route base64-encodes binary content; a caller that skipped decoding would hand the VFS
    // a string where bytes belong.
    const bytes = [137, 80, 78, 71];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        project,
        // Exactly what `serializeFilesForResponse` puts on the wire for binary content.
        files: [{ ...file, path: '/logo.png', name: 'logo.png', type: 'image',
                  mimeType: 'image/png', _isBinaryBase64: true, content: Buffer.from(bytes).toString('base64') }],
      }),
    }));

    const result = await new SyncManager().pullProjectWithFiles(project.id);

    const pulled = result.files?.[0];
    expect(Object.prototype.toString.call(pulled?.content)).toBe('[object ArrayBuffer]');
    expect(Array.from(new Uint8Array(pulled!.content as ArrayBuffer))).toEqual(bytes);
  });
});
