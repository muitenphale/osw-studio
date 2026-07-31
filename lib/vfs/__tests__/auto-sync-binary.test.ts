import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * autoSyncProject used to POST vfs.listFiles() output straight through JSON.stringify. An
 * ArrayBuffer stringifies to {}, and the push route rebuilds the server's file set from the
 * payload it receives — so every debounced auto-save quietly replaced the project's images and
 * fonts on the server with empty objects.
 */

const mocks = vi.hoisted(() => ({
  getProject: vi.fn(),
  listFiles: vi.fn(),
  updateProject: vi.fn(),
  updateFile: vi.fn(),
  createFile: vi.fn(),
  deleteFile: vi.fn(),
  apiFetch: vi.fn(),
}));

vi.mock('@/lib/vfs', () => ({
  vfs: {
    getProject: mocks.getProject,
    listFiles: mocks.listFiles,
    updateProject: mocks.updateProject,
    updateFile: mocks.updateFile,
    createFile: mocks.createFile,
    deleteFile: mocks.deleteFile,
  },
}));
vi.mock('@/lib/vfs/save-manager', () => ({
  saveManager: {
    isDirty: vi.fn(() => false),
    runWithSuppressedDirty: (_id: string, fn: () => Promise<void>) => fn(),
  },
}));
vi.mock('@/lib/api/backend-status', () => ({ apiFetch: mocks.apiFetch }));
vi.mock('@/lib/vfs/sync-events', () => ({
  notifyServerProjectsChanged: vi.fn(),
  SERVER_PROJECTS_CHANGED: 'serverProjectsChanged',
}));
vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), warning: vi.fn(), success: vi.fn() } }));
vi.mock('@/lib/utils', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { autoSyncProject, pullServerUpdates } from '../auto-sync';

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const FILE_UPDATED = new Date('2026-07-30T10:00:00.000Z');

function pushResponse() {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      project: {
        lastSyncedAt: '2026-07-30T10:00:05.000Z',
        serverUpdatedAt: '2026-07-30T10:00:00.000Z',
      },
    }),
  };
}

/** Body of the POST the sync made (the manifest GET comes first). */
function pushBody() {
  const post = mocks.apiFetch.mock.calls.find((call) => call[1]?.method === 'POST');
  return JSON.parse(post![1].body);
}

describe('autoSyncProject file payload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_SERVER_MODE', 'true');
    mocks.getProject.mockResolvedValue({ id: 'p1', name: 'Test', settings: {} });
    mocks.updateProject.mockResolvedValue(undefined);
    mocks.listFiles.mockResolvedValue([
      { path: '/index.html', content: '<h1>hi</h1>', updatedAt: FILE_UPDATED, size: 11 },
      { path: '/logo.png', content: PNG_BYTES.buffer, updatedAt: FILE_UPDATED, size: 8 },
    ]);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('base64-encodes binary content instead of sending an empty object', async () => {
    // No manifest available → full push of every file.
    mocks.apiFetch.mockImplementation(async (_url: string, init?: { method?: string }) =>
      init?.method === 'POST' ? pushResponse() : { ok: false, status: 404, json: async () => ({}) }
    );

    await autoSyncProject('p1');

    const body = pushBody();
    const png = body.files.find((f: { path: string }) => f.path === '/logo.png');
    expect(png._isBinaryBase64).toBe(true);
    expect(typeof png.content).toBe('string');
    expect(Buffer.from(png.content, 'base64')).toEqual(Buffer.from(PNG_BYTES));

    // Text content is untouched.
    const html = body.files.find((f: { path: string }) => f.path === '/index.html');
    expect(html.content).toBe('<h1>hi</h1>');
    expect(html._isBinaryBase64).toBeUndefined();
  });

  it('sends only changed files when the server reports a manifest', async () => {
    mocks.apiFetch.mockImplementation(async (url: string, init?: { method?: string }) => {
      if (init?.method === 'POST') return pushResponse();
      return {
        ok: true,
        status: 200,
        json: async () => ({
          files: [
            // Unchanged — must not be re-uploaded.
            { path: '/logo.png', updatedAt: FILE_UPDATED.toISOString(), size: 8 },
            // Gone locally — must be deleted server-side.
            { path: '/old.html', updatedAt: FILE_UPDATED.toISOString(), size: 3 },
          ],
        }),
      };
    });

    await autoSyncProject('p1');

    const body = pushBody();
    expect(body.partial).toBe(true);
    expect(body.files.map((f: { path: string }) => f.path)).toEqual(['/index.html']);
    expect(body.deletedPaths).toEqual(['/old.html']);
  });

  it('falls back to a full push when the manifest cannot be read', async () => {
    mocks.apiFetch.mockImplementation(async (_url: string, init?: { method?: string }) => {
      if (init?.method === 'POST') return pushResponse();
      throw new Error('network');
    });

    await autoSyncProject('p1');

    const body = pushBody();
    expect(body.partial).toBe(false);
    expect(body.files).toHaveLength(2);
    expect(body.deletedPaths).toEqual([]);
  });
});

describe('pullServerUpdates file payload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_SERVER_MODE', 'true');
    mocks.getProject.mockResolvedValue({ id: 'p1', name: 'Test', settings: {} });
    mocks.updateProject.mockResolvedValue(undefined);
    mocks.listFiles.mockResolvedValue([]);
  });
  afterEach(() => vi.unstubAllEnvs());

  // The mirror of the push bug: the server base64-encodes binary content for JSON transport, so
  // writing the response through unchanged stored every image and font as a base64 text file.
  it('decodes base64 binary content back to an ArrayBuffer', async () => {
    mocks.apiFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        project: { id: 'p1', name: 'Test', updatedAt: '2026-07-30T10:00:00.000Z' },
        files: [
          { path: '/index.html', content: '<h1>hi</h1>' },
          {
            path: '/logo.png',
            content: Buffer.from(PNG_BYTES).toString('base64'),
            _isBinaryBase64: true,
          },
        ],
      }),
    });

    await pullServerUpdates('p1', false);

    const png = mocks.createFile.mock.calls.find((call) => call[1] === '/logo.png');
    expect(png).toBeDefined();
    expect(png![2]).toBeInstanceOf(ArrayBuffer);
    expect(Buffer.from(new Uint8Array(png![2]))).toEqual(Buffer.from(PNG_BYTES));

    const html = mocks.createFile.mock.calls.find((call) => call[1] === '/index.html');
    expect(html![2]).toBe('<h1>hi</h1>');
  });
});

