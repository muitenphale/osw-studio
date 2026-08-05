import { describe, it, expect } from 'vitest';
import { folderToArchiveEntries } from '../read-folder';
import { MAX_ENTRIES, MAX_TOTAL_BYTES } from '../read-zip';

/**
 * `collectEntryFiles` is deliberately untested here: it drives the webkit FileSystemEntry API,
 * which does not exist under `environment: 'node'`. It was lifted out of the file explorer
 * unchanged, and its only exercise is the real drop handler.
 */

/** A path a browser drop can produce but validateArchivePath refuses. */
const REJECTED_PATH = '/assets\\logo.png';

function collect(map: Record<string, string>): Array<{ file: File; path: string }> {
  return Object.entries(map).map(([path, content]) => ({
    file: new File([content], path.split('/').pop() ?? 'f'),
    path,
  }));
}

function decode(buffer: ArrayBuffer): string {
  return new TextDecoder().decode(buffer);
}

describe('folderToArchiveEntries', () => {
  it('normalizes collected paths to project paths', () => {
    const { entries, issues } = folderToArchiveEntries(
      collect({ '/index.html': 'hi', '/a/b.css': 'x' })
    );

    expect(issues).toEqual([]);
    expect(entries.map((e) => e.path)).toEqual(['/index.html', '/a/b.css']);
  });

  it('adds the leading slash a fallback drop omits', () => {
    const { entries } = folderToArchiveEntries(collect({ 'a.txt': 'x' }));
    expect(entries[0].path).toBe('/a.txt');
  });

  it('reads an entry back as its file bytes', async () => {
    const { entries } = folderToArchiveEntries(collect({ '/index.html': 'hello' }));
    expect(decode(await entries[0].read())).toBe('hello');
  });

  it('re-reading an entry yields the same bytes', async () => {
    const { entries } = folderToArchiveEntries(collect({ '/index.html': 'hello' }));
    expect(decode(await entries[0].read())).toBe('hello');
    expect(decode(await entries[0].read())).toBe('hello');
  });

  it('declares the file size, which the OS supplied and is exact', () => {
    const { entries } = folderToArchiveEntries(collect({ '/a.txt': 'hello' }));
    expect(entries[0].declaredSize).toBe(5);
  });

  it('carries a zero-byte file rather than dropping it', async () => {
    const { entries, issues } = folderToArchiveEntries([
      { file: new File([], 'empty.txt'), path: '/empty.txt' },
    ]);

    expect(issues).toEqual([]);
    expect(entries).toHaveLength(1);
    expect(entries[0].declaredSize).toBe(0);
    expect((await entries[0].read()).byteLength).toBe(0);
  });

  it('reports a rejected path as an issue and keeps the rest of the drop', () => {
    const { entries, issues } = folderToArchiveEntries(
      collect({ '/ok.txt': 'x', [REJECTED_PATH]: 'x', '/also-ok.txt': 'x' })
    );

    expect(entries.map((e) => e.path)).toEqual(['/ok.txt', '/also-ok.txt']);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('path-rejected');
    // The path as collected, so the user recognizes which file was refused.
    expect(issues[0].path).toBe(REJECTED_PATH);
  });

  it('reports an over-long path with its own code', () => {
    const long = '/' + 'a'.repeat(210) + '.txt';
    const { entries, issues } = folderToArchiveEntries(collect({ [long]: 'x' }));

    expect(entries).toEqual([]);
    expect(issues[0].code).toBe('path-too-long');
  });

  it('keeps the first of two paths that normalize to one, and reports the second', async () => {
    const { entries, issues } = folderToArchiveEntries([
      { file: new File(['first'], 'a.txt'), path: '/a.txt' },
      { file: new File(['second'], 'a.txt'), path: 'a.txt' },
    ]);

    expect(entries).toHaveLength(1);
    expect(entries[0].path).toBe('/a.txt');
    expect(decode(await entries[0].read())).toBe('first');
    expect(issues).toHaveLength(1);
    expect(issues[0].path).toBe('/a.txt');
    expect(issues[0].code).toBe('path-rejected');
  });

  it('refuses a drop holding more files than the entry budget', () => {
    const collected = Array.from({ length: 4 }, (_, i) => ({
      file: new File(['x'], `f${i}.txt`),
      path: `/f${i}.txt`,
    }));

    expect(() => folderToArchiveEntries(collected, { maxEntries: 3 })).toThrow(/4 files/);
  });

  it('counts every collected file against the entry budget, refusable ones included', () => {
    const collected = [
      { file: new File(['x'], 'a.txt'), path: '/a.txt' },
      { file: new File(['x'], 'logo.png'), path: REJECTED_PATH },
    ];

    expect(() => folderToArchiveEntries(collected, { maxEntries: 1 })).toThrow();
  });

  it('refuses a drop larger than the byte budget', () => {
    const collected = [
      { file: new File(['aaaa'], 'a.txt'), path: '/a.txt' },
      { file: new File(['bbbb'], 'b.txt'), path: '/b.txt' },
    ];

    expect(() => folderToArchiveEntries(collected, { maxTotalBytes: 7 })).toThrow(/import limit/);
    expect(() => folderToArchiveEntries(collected, { maxTotalBytes: 8 })).not.toThrow();
  });

  it('applies the byte budget to the whole drop, not to one file at a time', () => {
    const collected = Array.from({ length: 5 }, (_, i) => ({
      file: new File(['aaaa'], `f${i}.txt`),
      path: `/f${i}.txt`,
    }));

    // No single file is over 4 bytes; the drop is 20.
    expect(() => folderToArchiveEntries(collected, { maxTotalBytes: 10 })).toThrow();
  });

  it('defaults to the same budgets as the zip reader', () => {
    expect(MAX_ENTRIES).toBe(5000);
    expect(MAX_TOTAL_BYTES).toBe(200 * 1024 * 1024);

    const collected = Array.from({ length: MAX_ENTRIES + 1 }, (_, i) => ({
      file: new File([], `f${i}.txt`),
      path: `/f${i}.txt`,
    }));

    expect(() => folderToArchiveEntries(collected)).toThrow(/5000/);
  });

  it('accepts an empty drop', () => {
    expect(folderToArchiveEntries([])).toEqual({ entries: [], issues: [] });
  });
});
