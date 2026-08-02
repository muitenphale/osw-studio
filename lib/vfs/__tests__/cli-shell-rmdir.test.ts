import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * `rmdir` removes a directory only when it is empty.
 *
 * The permission matrix already routed `rmdir` to the `rm` gate and the UI labelled the gate
 * "rm / rmdir (delete)", but the shell never dispatched it — an agent that reached for it got
 * "command not found". `rm -r` stays the destructive form; this is the one that refuses when
 * something is still inside.
 */

type Entry = { path: string; name: string; type: 'directory' } | { path: string; name: string };

let entries: Entry[] = [];
const deleted: string[] = [];

const mockVfs = {
  init: vi.fn(),
  getAllFilesAndDirectories: vi.fn(async () => entries),
  deleteDirectory: vi.fn(async (_p: string, path: string) => {
    deleted.push(path);
  }),
  readFile: vi.fn(),
  listFiles: vi.fn().mockResolvedValue([]),
  listDirectories: vi.fn().mockResolvedValue([]),
  getFileTree: vi.fn().mockResolvedValue([]),
  getProject: vi.fn().mockResolvedValue({ id: 'p', settings: { runtime: 'static' } }),
};

vi.mock('@/lib/vfs', () => ({ getActiveVFS: () => mockVfs, vfs: mockVfs }));
vi.mock('@/lib/utils', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

async function run(cmd: string[]) {
  const { vfsShell } = await import('../cli-shell');
  return vfsShell.execute('p', cmd);
}

beforeEach(() => {
  deleted.length = 0;
  vi.clearAllMocks();
  entries = [
    { path: '/empty', name: 'empty', type: 'directory' },
    { path: '/full', name: 'full', type: 'directory' },
    { path: '/full/index.html', name: 'index.html' },
    { path: '/notes.md', name: 'notes.md' },
  ];
});

describe('rmdir', () => {
  it('removes an empty directory', async () => {
    const r = await run(['rmdir', '/empty']);

    expect(r.success).toBe(true);
    expect(deleted).toEqual(['/empty']);
  });

  it('refuses a directory that still has contents', async () => {
    const r = await run(['rmdir', '/full']);

    expect(r.success).toBe(false);
    expect(r.stderr).toContain('not empty');
    expect(r.stderr).toContain('rm -r');
    expect(deleted).toEqual([]);
  });

  it('reports a directory that does not exist', async () => {
    const r = await run(['rmdir', '/missing']);

    expect(r.success).toBe(false);
    expect(r.stderr).toContain('No such directory');
  });

  it('will not remove a file', async () => {
    const r = await run(['rmdir', '/notes.md']);

    expect(r.success).toBe(false);
    expect(deleted).toEqual([]);
  });

  it('refuses the project root', async () => {
    const r = await run(['rmdir', '/']);

    expect(r.success).toBe(false);
    expect(deleted).toEqual([]);
  });

  it('handles several directories, reporting each failure', async () => {
    const r = await run(['rmdir', '/empty', '/full']);

    expect(r.success).toBe(false);
    expect(deleted).toEqual(['/empty']);
    expect(r.stderr).toContain('/full');
  });

  it('needs an operand', async () => {
    expect((await run(['rmdir'])).stderr).toContain('missing operand');
  });

  it('reports an unsupported option rather than treating it as a path', async () => {
    const r = await run(['rmdir', '-z', '/empty']);

    expect(r.stderr).toContain("unsupported option '-z'");
    expect(deleted).toEqual([]);
  });
});

describe('rmdir -p', () => {
  beforeEach(() => {
    entries = [
      { path: '/a', name: 'a', type: 'directory' },
      { path: '/a/b', name: 'b', type: 'directory' },
      { path: '/a/b/c', name: 'c', type: 'directory' },
      { path: '/keep', name: 'keep', type: 'directory' },
      { path: '/keep/held', name: 'held', type: 'directory' },
      { path: '/keep/notes.md', name: 'notes.md' },
    ];
  });

  it('removes the directory and the ancestors it empties, deepest first', async () => {
    const r = await run(['rmdir', '-p', '/a/b/c']);

    expect(r.success).toBe(true);
    expect(deleted).toEqual(['/a/b/c', '/a/b', '/a']);
  });

  it('stops at an ancestor that still holds something, and says which', async () => {
    const r = await run(['rmdir', '-p', '/keep/held']);

    expect(r.success).toBe(false);
    // The child goes; /keep survives because notes.md is still there.
    expect(deleted).toEqual(['/keep/held']);
    expect(r.stderr).toContain('/keep');
    expect(r.stderr).toContain('not empty');
  });

  it('accepts the long form', async () => {
    await run(['rmdir', '--parents', '/a/b/c']);

    expect(deleted).toEqual(['/a/b/c', '/a/b', '/a']);
  });

  it('never tries to remove the root', async () => {
    await run(['rmdir', '-p', '/a/b/c']);

    expect(deleted).not.toContain('/');
  });

  it('removes only the target without -p', async () => {
    await run(['rmdir', '/a/b/c']);

    expect(deleted).toEqual(['/a/b/c']);
  });
});
