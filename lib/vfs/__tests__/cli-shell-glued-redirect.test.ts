import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Redirects written without spaces (`ls>out.txt`) reach the shell as separate tokens now, so this
 * checks the whole path: tokenizer output actually drives a write, and the forms that must NOT be
 * treated as redirects still aren't.
 */

const store = new Map<string, string>();

const mockVfs = {
  init: vi.fn(),
  readFile: vi.fn(async (_p: string, path: string) => {
    if (!store.has(path)) throw new Error(`File not found: ${path}`);
    return { path, content: store.get(path), updatedAt: new Date() };
  }),
  createFile: vi.fn(async (_p: string, path: string, content: string) => {
    store.set(path, content);
  }),
  updateFile: vi.fn(async (_p: string, path: string, content: string) => {
    store.set(path, content);
  }),
  writeFile: vi.fn(async (_p: string, path: string, content: string) => {
    store.set(path, content);
  }),
  listFiles: vi.fn().mockResolvedValue([]),
  listDirectories: vi.fn().mockResolvedValue([]),
  getFileTree: vi.fn().mockResolvedValue([]),
  getAllFilesAndDirectories: vi.fn().mockResolvedValue([]),
  getProject: vi.fn().mockResolvedValue({ id: 'p', settings: { runtime: 'static' } }),
};

vi.mock('@/lib/vfs', () => ({ getActiveVFS: () => mockVfs, vfs: mockVfs }));
vi.mock('@/lib/utils', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

/** Run the string exactly as the bash tool would: tokenize, then execute. */
async function run(cmdStr: string) {
  // Imported lazily: tool-registry pulls in @/lib/vfs, which must resolve to the mock above.
  const { parseBashCommand } = await import('@/lib/llm/tool-registry');
  const { vfsShell } = await import('../cli-shell');
  return vfsShell.execute('p', parseBashCommand(cmdStr));
}

beforeEach(() => {
  store.clear();
  vi.clearAllMocks();
});

describe('redirects written without spaces', () => {
  it('writes the file', async () => {
    const r = await run('echo hello>/out.txt');

    expect(r.success).toBe(true);
    expect(store.get('/out.txt')).toBe('hello');
  });

  it('appends with >>', async () => {
    store.set('/log.txt', 'first');
    await run('echo second>>/log.txt');

    expect(store.get('/log.txt')).toBe('first\nsecond');
  });

  it('still works with spaces, as before', async () => {
    await run('echo spaced > /spaced.txt');

    expect(store.get('/spaced.txt')).toBe('spaced');
  });
});

describe('things that must not become redirects', () => {
  it('does not write a file for unquoted markup', async () => {
    const r = await run('echo <p>hi</p>');

    expect(r.success).toBe(true);
    expect(r.stdout).toContain('<p>hi</p>');
    expect(store.size).toBe(0);
  });

  it('does not write /dev/null for an fd redirect', async () => {
    await run('echo quiet 2>/dev/null');

    expect(store.has('/dev/null')).toBe(false);
  });

  it('keeps a quoted redirect literal', async () => {
    const r = await run('echo "a>b"');

    expect(r.stdout).toContain('a>b');
    expect(store.size).toBe(0);
  });
});
