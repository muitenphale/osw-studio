import { describe, it, expect, vi } from 'vitest';

/**
 * head/tail argument handling.
 *
 * `-c` (characters) was unsupported and, worse, silently skipped: `head -c 600` left `600` looking
 * like a filename, so the shell reported "600: File not found" and said nothing about the flag.
 */

const FILE = { path: '/f.txt', content: 'l1\nl2\nl3\nl4\nl5', mimeType: 'text/plain' };

const mockVfs = {
  init: vi.fn(),
  readFile: vi.fn().mockResolvedValue(FILE),
  writeFile: vi.fn(),
  createFile: vi.fn(),
  listFiles: vi.fn().mockResolvedValue([]),
  listDirectories: vi.fn().mockResolvedValue([]),
  deleteFile: vi.fn(),
  renameFile: vi.fn(),
  getFileTree: vi.fn().mockResolvedValue([]),
  getProject: vi.fn().mockResolvedValue({ id: 'p', settings: { runtime: 'static' } }),
};

vi.mock('@/lib/vfs', () => ({ getActiveVFS: () => mockVfs, vfs: mockVfs }));
vi.mock('@/lib/utils', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

async function run(cmd: string[], stdin?: string) {
  const { vfsShell } = await import('../cli-shell');
  return vfsShell.execute('p', cmd, stdin);
}

describe('head', () => {
  it('takes characters with -c', async () => {
    const r = await run(['head', '-c', '5', '/f.txt']);

    expect(r.success).toBe(true);
    expect(r.stdout).toBe('l1\nl2');
  });

  it('accepts -c attached to its value', async () => {
    expect((await run(['head', '-c5', '/f.txt'])).stdout).toBe('l1\nl2');
  });

  it('still takes lines with -n and the -N shorthand', async () => {
    expect((await run(['head', '-n', '2', '/f.txt'])).stdout).toBe('l1\nl2');
    expect((await run(['head', '-2', '/f.txt'])).stdout).toBe('l1\nl2');
  });

  it('applies -c to piped input too', async () => {
    expect((await run(['head', '-c', '3'], 'abcdefgh')).stdout).toBe('abc');
  });

  it('reports an unsupported flag instead of treating its value as a file', async () => {
    const r = await run(['head', '-q', '600', '/f.txt']);

    expect(r.success).toBe(false);
    expect(r.stderr).toContain("unsupported option '-q'");
    // The old failure mode: a missing file named after the flag's value.
    expect(r.stderr).not.toContain('600: File not found');
  });
});

describe('tail', () => {
  it('takes characters with -c', async () => {
    expect((await run(['tail', '-c', '2', '/f.txt'])).stdout).toBe('l5');
  });

  it('still takes lines with -n', async () => {
    expect((await run(['tail', '-n', '2', '/f.txt'])).stdout).toBe('l4\nl5');
  });

  it('applies -c to piped input too', async () => {
    expect((await run(['tail', '-c', '3'], 'abcdefgh')).stdout).toBe('fgh');
  });

  it('reports an unsupported flag', async () => {
    const r = await run(['tail', '-z', '5', '/f.txt']);

    expect(r.success).toBe(false);
    expect(r.stderr).toContain("unsupported option '-z'");
  });
});
