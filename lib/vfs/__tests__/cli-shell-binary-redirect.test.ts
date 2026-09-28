import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * A redirect writes text, so one aimed at an image, font, audio or video file stored characters
 * that came out as a broken file, and said nothing. The shell now refuses those, and only those:
 * SVG is text, and a name with no extension is usually text too.
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

describe('redirects into byte formats', () => {
  for (const cmd of [
    'echo hello > /assets/logo.png',
    'echo more >> /assets/logo.png',
    'echo x > /fonts/body.woff2',
    'echo x > /media/clip.mp4',
    'echo x > /media/ping.mp3',
  ]) {
    it(`refuses: ${cmd}`, async () => {
      const r = await run(cmd);

      expect(r.success).toBe(false);
      // The remedy, not the wording: `curl -o` is what the message has to keep pointing at.
      expect(r.stderr).toContain('curl -o');
      expect(store.size).toBe(0);
    });
  }
});

it('refuses a heredoc into a byte format', async () => {
  const r = await run('cat > /assets/photo.jpg', 'not a photo');

  expect(r.success).toBe(false);
  expect(r.stderr).toContain('curl -o');
  expect(store.size).toBe(0);
});

describe('redirects that stay allowed', () => {
  for (const [cmd, path] of [
    ['echo "<svg/>" > /assets/logo.svg', '/assets/logo.svg'],
    ['echo notes > /NOTES', '/NOTES'],
    ['echo hi > /index.html', '/index.html'],
  ] as const) {
    it(`writes: ${cmd}`, async () => {
      const r = await run(cmd);

      expect(r.success).toBe(true);
      expect(store.has(path)).toBe(true);
    });
  }
});
