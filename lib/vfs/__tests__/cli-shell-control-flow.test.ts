import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The shell has no loops or conditionals, and a line using one splits on `;` into several unknown
 * commands. `for f in a b; do echo $f; done` therefore came back as three `command not found`
 * blocks carrying three copies of the supported-command list: about 9KB that never says the
 * construct is unsupported. A control-flow word now gets one short answer instead.
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
  createDirectory: vi.fn(),
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

/** `stdin` stands in for a heredoc body, which the bash tool separates out before this point. */
async function run(cmdStr: string, stdin?: string) {
  const { parseBashCommand } = await import('@/lib/llm/tool-registry');
  const { vfsShell } = await import('../cli-shell');
  return vfsShell.execute('p', parseBashCommand(cmdStr), stdin);
}

beforeEach(() => {
  store.clear();
  vi.clearAllMocks();
});


describe('control-flow words', () => {
  for (const cmd of [
    'for f in a b; do echo $f; done',
    'while true; do echo x; done',
    'if [ -f /a ]; then echo x; fi',
    'case $x in a) echo y;; esac',
  ]) {
    it(`answers once: ${cmd}`, async () => {
      const r = await run(cmd);
      const stderr = r.stderr ?? '';

      expect(stderr).toContain('no loops or conditionals');
      // The point of the change: not three copies of the command list.
      expect(stderr).not.toContain('Supported commands:');
      expect(stderr.length).toBeLessThan(600);
    });
  }
});

describe('what the change must not affect', () => {
  it('still gives the command list for an ordinary unknown command', async () => {
    const r = await run('nosuchcmd');

    expect(r.stderr).toContain('command not found');
    expect(r.stderr).toContain('Supported commands:');
  });
});
