import { describe, it, expect } from 'vitest';
import path from 'path';
import { isSafeVirtualPath, resolveWithin } from '../path-safety';

/**
 * File paths arrive from whoever pushed the project and end up joined onto a directory on disk.
 * These are the shapes that must not survive that journey.
 */

describe('isSafeVirtualPath', () => {
  it('accepts the paths a project actually contains', () => {
    for (const p of ['/index.html', '/assets/img/hero.png', '/src/App.tsx', '/.PROMPT.md', '/.server/db.json']) {
      expect(isSafeVirtualPath(p)).toBe(true);
    }
  });

  it('rejects a traversal segment wherever it appears', () => {
    // The middle case is the one that matters: a leading `..` was already excluded from publishing
    // by the dot-prefix rule, so a benign first segment was the way past it.
    for (const p of ['/../etc/passwd', '/assets/../../../etc/passwd', '/a/b/..', '/..']) {
      expect(isSafeVirtualPath(p)).toBe(false);
    }
  });

  it('rejects a backslash, which is a separator on Windows', () => {
    expect(isSafeVirtualPath('/assets\\..\\..\\evil.txt')).toBe(false);
  });

  it('rejects a single-dot segment, a NUL, a relative path, and a non-string', () => {
    expect(isSafeVirtualPath('/a/./b')).toBe(false);
    expect(isSafeVirtualPath('/a\0b')).toBe(false);
    expect(isSafeVirtualPath('relative.html')).toBe(false);
    expect(isSafeVirtualPath(undefined)).toBe(false);
    expect(isSafeVirtualPath(42)).toBe(false);
  });
});

describe('resolveWithin', () => {
  const base = path.resolve('/srv/app/public/deployments/d1');

  it('resolves an ordinary path inside the directory', () => {
    expect(resolveWithin(base, '/assets/logo.png')).toBe(path.join(base, 'assets', 'logo.png'));
  });

  it('returns null for a path that climbs out', () => {
    expect(resolveWithin(base, '/assets/../../../../etc/passwd')).toBeNull();
  });

  it('does not accept a sibling directory that shares a name prefix', () => {
    // Without the separator in the comparison, `/srv/app/public/deployments/d1-old` starts with
    // the base string and would pass as inside it.
    expect(resolveWithin(path.resolve('/srv/deployments/d1'), '/../d1-old/x')).toBeNull();
  });
});
