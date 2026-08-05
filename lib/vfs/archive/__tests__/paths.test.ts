import { describe, it, expect } from 'vitest';
import { validateArchivePath, keepBothPath } from '../paths';

describe('validateArchivePath', () => {
  it('accepts an ordinary path and gives it a leading slash', () => {
    expect(validateArchivePath('assets/logo.svg')).toEqual({ ok: true, path: '/assets/logo.svg' });
  });

  it('accepts a path that already has a leading slash', () => {
    expect(validateArchivePath('/index.html')).toEqual({ ok: true, path: '/index.html' });
  });

  it('collapses duplicate slashes', () => {
    expect(validateArchivePath('a//b.css')).toEqual({ ok: true, path: '/a/b.css' });
  });

  it.each([
    ['../escape.txt', 'parent segment', 'path-rejected'],
    ['a/../../b.txt', 'parent segment after a real one', 'path-rejected'],
    ['./same.txt', 'current-dir segment', 'path-rejected'],
    ['a\\b.txt', 'backslash', 'path-rejected'],
    ['C:/win.txt', 'drive letter', 'path-rejected'],
    ['bad\0.txt', 'null byte', 'path-rejected'],
    ['/', 'nothing but separators', 'path-rejected'],
    ['a.txt ', 'trailing space storage would strip', 'path-rejected'],
    ['a. ', 'trailing space after a dot', 'path-rejected'],
    [' a.txt', 'leading space', 'path-rejected'],
    ['a.txt\r', 'trailing carriage return', 'path-rejected'],
    ['a@@b.txt', '@@, which updateFile refuses', 'path-rejected'],
    ['a\nb.txt', 'interior newline, which updateFile refuses', 'path-rejected'],
    ['a\\nb.txt', 'a literal backslash-n sequence, which updateFile refuses', 'path-rejected'],
    ['a\u202Egnp.txt', 'right-to-left override that disguises the extension', 'path-rejected'],
    ['a\u200Eb.txt', 'left-to-right mark', 'path-rejected'],
    ['a\u0007b.txt', 'C0 control character', 'path-rejected'],
    ['a\u009Bb.txt', 'C1 control character', 'path-rejected'],
  ])('rejects %s (%s)', (input, _label, code) => {
    const result = validateArchivePath(input);
    expect(result).toMatchObject({ ok: false, code });
  });

  it('names the cause and the fix when a path uses Windows-style separators', () => {
    // An archive from an older Windows tool fails every single entry. A message about "a
    // backslash" reads as corruption; the user has to be told it is their zip tool.
    const result = validateArchivePath('sub\\win.txt');
    expect(result).toMatchObject({ ok: false, code: 'path-rejected' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(/windows/i);
    expect(result.message).toMatch(/forward slash/i);
  });

  it('accepts a space inside a segment, which storage never rewrites', () => {
    expect(validateArchivePath('a /b.txt')).toEqual({ ok: true, path: '/a /b.txt' });
  });

  it('accepts a path of exactly 200 characters', () => {
    const exact = '/' + 'a'.repeat(195) + '.txt';
    expect(exact).toHaveLength(200);
    expect(validateArchivePath(exact)).toEqual({ ok: true, path: exact });
  });

  it('rejects a path of 201 characters', () => {
    const long = '/' + 'a'.repeat(196) + '.txt';
    expect(long).toHaveLength(201);
    expect(validateArchivePath(long)).toMatchObject({ ok: false, code: 'path-too-long' });
  });

  it('rejects an empty path', () => {
    expect(validateArchivePath('').ok).toBe(false);
  });

  it('rejects when the raw zip name contained a parent segment', () => {
    // JSZip resolves '..' away in `name`, keeping the raw form on unsafeOriginalName.
    // That raw form is the only evidence the archive attempted a traversal.
    const result = validateArchivePath('evil.txt', '../../evil.txt');
    expect(result).toMatchObject({ ok: false, code: 'path-rejected' });
  });

  it.each([
    ['a.txt', './a.txt'],
    ['dir/x.js', 'dir/./x.js'],
    ['a/b.css', 'a//b.css'],
  ])('accepts %s despite JSZip normalizing it from %s', (name, raw) => {
    // loadAsync runs utils.resolve() on every name, so a mismatch is normal for
    // archives written by zip, Python zipfile, and most Java tools. Only '..' is a signal.
    expect(validateArchivePath(name, raw).ok).toBe(true);
  });

  it('rejects a parent segment in the name even when the raw name is clean', () => {
    expect(validateArchivePath('../x.txt', 'x.txt')).toMatchObject({
      ok: false,
      code: 'path-rejected',
    });
  });
});

describe('keepBothPath', () => {
  it('inserts a counter before the extension', () => {
    expect(keepBothPath('/assets/logo.svg', new Set(['/assets/logo.svg'])))
      .toBe('/assets/logo (2).svg');
  });

  it('skips numbers already taken', () => {
    const taken = new Set(['/a.txt', '/a (2).txt', '/a (3).txt']);
    expect(keepBothPath('/a.txt', taken)).toBe('/a (4).txt');
  });

  it('handles a file with no extension', () => {
    expect(keepBothPath('/LICENSE', new Set(['/LICENSE']))).toBe('/LICENSE (2)');
  });

  it('handles a dotfile', () => {
    expect(keepBothPath('/.PROMPT.md', new Set(['/.PROMPT.md']))).toBe('/.PROMPT (2).md');
  });

  it('splits at the first dot so compound extensions survive', () => {
    expect(keepBothPath('/archive.tar.gz', new Set(['/archive.tar.gz'])))
      .toBe('/archive (2).tar.gz');
  });

  it('handles a name that is nothing but dots', () => {
    expect(keepBothPath('/...', new Set(['/...']))).toBe('/... (2)');
  });

  it('reserves what it returns, so two callers never collide', () => {
    const taken = new Set(['/a.txt']);
    const first = keepBothPath('/a.txt', taken);
    const second = keepBothPath('/a.txt', taken);
    expect(first).toBe('/a (2).txt');
    expect(second).toBe('/a (3).txt');
    expect(second).not.toBe(first);
  });

  it('keeps the result within the 200-character limit by trimming the stem', () => {
    const original = '/' + 'a'.repeat(195) + '.txt';
    expect(original).toHaveLength(200);
    const result = keepBothPath(original, new Set([original]));
    expect(result.length).toBeLessThanOrEqual(200);
    expect(result.endsWith(' (2).txt')).toBe(true);
  });

  it('stays within the limit while skipping taken numbers', () => {
    const original = '/' + 'a'.repeat(195) + '.txt';
    const taken = new Set([original]);
    for (let i = 0; i < 5; i += 1) {
      const result = keepBothPath(original, taken);
      expect(result.length).toBeLessThanOrEqual(200);
      expect(taken.has(result)).toBe(true);
    }
    expect(taken.size).toBe(6);
  });
});
