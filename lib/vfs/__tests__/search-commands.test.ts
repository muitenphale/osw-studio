import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * `grep` and `rg` against the same tree.
 *
 * The two duplicated their match loop, their context-window expansion and their file filtering, so
 * the shared parts were extracted. Nothing about what either command prints was meant to change,
 * and almost none of it was covered: before this file, the suite exercised `grep -o` and `-P` and
 * nothing else, with no test of `rg` at all. These assert the output shape of both commands across
 * the paths that were shared, so a later change to one cannot silently move the other.
 */

const FILES = [
  {
    type: 'file' as const,
    path: '/a.txt',
    content: ['alpha', 'beta MATCH one', 'gamma', 'delta', 'epsilon MATCH two', 'zeta'].join('\n'),
  },
  {
    type: 'file' as const,
    path: '/sub/b.txt',
    content: ['one', 'MATCH in sub', 'three'].join('\n'),
  },
  { type: 'file' as const, path: '/none.txt', content: 'nothing here' },
  // Carries string content on purpose: with `content: undefined` the type check below is masked by
  // the content check, and a search that stopped skipping directories would go unnoticed.
  { type: 'directory' as const, path: '/sub', content: 'MATCH inside a directory entry' },
  { type: 'file' as const, path: '/bin.png', content: new ArrayBuffer(4) },
];

const mockVfs = {
  init: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  createFile: vi.fn(),
  updateFile: vi.fn(),
  listFiles: vi.fn().mockResolvedValue([]),
  listDirectories: vi.fn().mockResolvedValue([]),
  getFileTree: vi.fn().mockResolvedValue([]),
  getAllFilesAndDirectories: vi.fn().mockResolvedValue(FILES),
};

vi.mock('@/lib/vfs', () => ({ getActiveVFS: () => mockVfs, vfs: mockVfs }));
vi.mock('@/lib/utils', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

async function exec(cmd: string[], stdin?: string) {
  const { vfsShell } = await import('../cli-shell');
  return vfsShell.execute('test', cmd, stdin);
}

const STDIN = ['l1', 'l2 MATCH', 'l3', 'l4', 'l5 MATCH', 'l6'].join('\n');

beforeEach(() => vi.clearAllMocks());

describe('rg over files', () => {
  it('prints path, line number and line, and skips directories and binary content', async () => {
    const r = await exec(['rg', 'MATCH', '/']);
    expect(r.stdout).toBe(
      ['/a.txt:2:beta MATCH one', '/a.txt:5:epsilon MATCH two', '', '/sub/b.txt:2:MATCH in sub'].join('\n')
    );
  });

  it('never searches a directory entry, whatever it carries', async () => {
    const r = await exec(['rg', 'MATCH', '/']);

    expect(r.stdout).not.toContain('inside a directory entry');
    const listed = (await exec(['grep', '-l', 'MATCH', '/'])).stdout ?? '';
    expect(listed.split('\n')).not.toContain('/sub');
  });

  it('expands a context window around each match', async () => {
    const r = await exec(['rg', '-C', '1', 'MATCH', '/a.txt']);
    expect(r.stdout).toBe(
      ['/a.txt:1:alpha', '/a.txt:2:beta MATCH one', '/a.txt:3:gamma',
       '/a.txt:4:delta', '/a.txt:5:epsilon MATCH two', '/a.txt:6:zeta'].join('\n')
    );
  });

  it('takes -A and -B separately', async () => {
    expect((await exec(['rg', '-A', '1', 'epsilon', '/a.txt'])).stdout)
      .toBe(['/a.txt:5:epsilon MATCH two', '/a.txt:6:zeta'].join('\n'));
    expect((await exec(['rg', '-B', '1', 'epsilon', '/a.txt'])).stdout)
      .toBe(['/a.txt:4:delta', '/a.txt:5:epsilon MATCH two'].join('\n'));
  });

  it('scopes to a directory prefix', async () => {
    expect((await exec(['rg', 'MATCH', '/sub'])).stdout).toBe('/sub/b.txt:2:MATCH in sub');
  });

  it('is case sensitive unless -i', async () => {
    expect((await exec(['rg', 'match', '/a.txt'])).stdout).toBe('');
    expect((await exec(['rg', '-i', 'match', '/a.txt'])).stdout)
      .toBe(['/a.txt:2:beta MATCH one', '/a.txt:5:epsilon MATCH two'].join('\n'));
  });

  it('searches stdin when no path is given', async () => {
    expect((await exec(['rg', 'MATCH'], STDIN)).stdout).toBe(['2:l2 MATCH', '5:l5 MATCH'].join('\n'));
    expect((await exec(['rg', '-C', '1', 'MATCH'], STDIN)).stdout)
      .toBe(['1:l1', '2:l2 MATCH', '3:l3', '4:l4', '5:l5 MATCH', '6:l6'].join('\n'));
  });

  it('refuses with usage when the pattern is missing', async () => {
    // `vfsShell.execute` does not surface the handler's exit code, so stderr is the discriminator.
    const r = await exec(['rg']);
    expect(r.stderr).toContain('rg: missing pattern');
    expect(r.stdout).toBe('');
  });
});

describe('grep over files', () => {
  it('prints path and line, adding the number only with -n', async () => {
    expect((await exec(['grep', 'MATCH', '/a.txt'])).stdout)
      .toBe(['/a.txt:beta MATCH one', '/a.txt:epsilon MATCH two'].join('\n'));
    expect((await exec(['grep', '-n', 'MATCH', '/a.txt'])).stdout)
      .toBe(['/a.txt:2:beta MATCH one', '/a.txt:5:epsilon MATCH two'].join('\n'));
  });

  it('expands the same context window as rg', async () => {
    expect((await exec(['grep', '-n', '-C', '1', 'epsilon', '/a.txt'])).stdout)
      .toBe(['/a.txt:4:delta', '/a.txt:5:epsilon MATCH two', '/a.txt:6:zeta'].join('\n'));
  });

  it('counts with -c and names files with -l', async () => {
    expect((await exec(['grep', '-c', 'MATCH', '/a.txt'])).stdout).toBe('2');
    expect((await exec(['grep', '-c', 'MATCH', '/'])).stdout)
      .toBe(['/a.txt:2', '/sub/b.txt:1'].join('\n'));
    expect((await exec(['grep', '-l', 'MATCH', '/'])).stdout)
      .toBe(['/a.txt', '/sub/b.txt'].join('\n'));
  });

  it('reports a zero count for a single named file', async () => {
    expect((await exec(['grep', '-c', 'MATCH', '/none.txt'])).stdout).toBe('0');
  });

  it('treats the pattern literally with -F', async () => {
    // The pattern needs a metacharacter or escaping it changes nothing: as a regex `.` matches the
    // space in "MATCH one", so only the escaped form fails to find it.
    expect((await exec(['grep', 'MATCH.one', '/a.txt'])).stdout).toBe('/a.txt:beta MATCH one');
    expect((await exec(['grep', '-F', 'MATCH.one', '/a.txt'])).stdout).toBe('');
    expect((await exec(['grep', '-F', 'MATCH one', '/a.txt'])).stdout).toBe('/a.txt:beta MATCH one');
  });

  it('searches stdin when no path is given', async () => {
    expect((await exec(['grep', 'MATCH'], STDIN)).stdout).toBe(['l2 MATCH', 'l5 MATCH'].join('\n'));
    expect((await exec(['grep', '-n', '-C', '1', 'MATCH'], STDIN)).stdout)
      .toBe(['1:l1', '2:l2 MATCH', '3:l3', '4:l4', '5:l5 MATCH', '6:l6'].join('\n'));
  });

  it('refuses an unsupported flag rather than dropping it', async () => {
    const r = await exec(['grep', '-Z', 'x', '/']);
    expect(r.stderr).toContain('unsupported flag');
    expect(r.stdout).toBe('');
  });
});
