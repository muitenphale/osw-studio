import { describe, it, expect } from 'vitest';
import {
  pageDirectories,
  patternToRule,
  ruleToPattern,
  type PathRule,
} from '@/lib/vfs/suggestion-path-rules';

const PAGES = ['/index.html', '/about.html', '/articles/one.html', '/articles/deep/two.html'];

describe('pageDirectories', () => {
  it('offers each directory holding a page and its ancestors', () => {
    expect(pageDirectories(PAGES)).toEqual(['/articles/', '/articles/deep/']);
  });

  it('offers an ancestor that holds no page itself', () => {
    // /blog/ has nothing directly in it, but it is the level someone usually means.
    expect(pageDirectories(['/blog/2026/post.html'])).toEqual(['/blog/', '/blog/2026/']);
  });

  it('offers nothing for pages at the root', () => {
    expect(pageDirectories(['/index.html', '/about.html'])).toEqual([]);
  });

  it('does not repeat a directory holding several pages', () => {
    expect(pageDirectories(['/a/one.html', '/a/two.html'])).toEqual(['/a/']);
  });
});

describe('ruleToPattern', () => {
  it('stores a page as its own path', () => {
    expect(ruleToPattern({ kind: 'page', value: '/articles/one.html' })).toBe('/articles/one.html');
  });

  it('compiles a directory to a recursive glob', () => {
    expect(ruleToPattern({ kind: 'directory', value: '/articles/' })).toBe('/articles/**');
  });

  it('accepts a directory written without its trailing slash', () => {
    expect(ruleToPattern({ kind: 'directory', value: '/articles' })).toBe('/articles/**');
  });

  it('passes a typed pattern through', () => {
    expect(ruleToPattern({ kind: 'pattern', value: '/shop/*.html' })).toBe('/shop/*.html');
  });

  it('returns empty for a blank value of any kind', () => {
    for (const kind of ['page', 'directory', 'pattern'] as const) {
      expect(ruleToPattern({ kind, value: '  ' })).toBe('');
    }
  });
});

describe('patternToRule', () => {
  it('reads a stored page path as a page', () => {
    expect(patternToRule('/articles/one.html', PAGES)).toEqual({ kind: 'page', value: '/articles/one.html' });
  });

  it('reads a path that is not a page in this project as a pattern', () => {
    // A renamed or deleted page. Shown as typed rather than as a picked page it no longer equals.
    expect(patternToRule('/articles/gone.html', PAGES)).toEqual({ kind: 'pattern', value: '/articles/gone.html' });
  });

  it('reads a recursive glob as a directory', () => {
    expect(patternToRule('/articles/**', PAGES)).toEqual({ kind: 'directory', value: '/articles/' });
  });

  it('reads a glob with a star elsewhere as a pattern', () => {
    expect(patternToRule('/shop/*/item/**', PAGES)).toEqual({ kind: 'pattern', value: '/shop/*/item/**' });
    expect(patternToRule('/articles/*.html', PAGES)).toEqual({ kind: 'pattern', value: '/articles/*.html' });
  });

  it('reads a bare /** as a pattern, since it names no directory', () => {
    expect(patternToRule('/**', PAGES)).toEqual({ kind: 'pattern', value: '/**' });
  });

  it('round-trips every kind it produces', () => {
    for (const stored of ['/articles/one.html', '/articles/**', '/shop/*.html']) {
      expect(ruleToPattern(patternToRule(stored, PAGES))).toBe(stored);
    }
  });

  it('round-trips a directory built by the picker', () => {
    const rule: PathRule = { kind: 'directory', value: '/articles/' };
    expect(patternToRule(ruleToPattern(rule), PAGES)).toEqual(rule);
  });
});
