import { describe, it, expect } from 'vitest';
import { matchesPathPattern, selectPromptSuggestions } from '@/lib/vfs/suggestion-paths';
import type { PromptSuggestion } from '@/lib/vfs/types';

const s = (id: string, paths?: string[]): PromptSuggestion => ({
  id, label: id, prompt: id, ...(paths ? { paths } : {}),
});

describe('matchesPathPattern', () => {
  it('matches a literal path', () => {
    expect(matchesPathPattern('/index.html', '/index.html')).toBe(true);
    expect(matchesPathPattern('/index.html', '/about.html')).toBe(false);
  });

  it('does not let * cross a slash, but ** does', () => {
    expect(matchesPathPattern('/articles/*.html', '/articles/spring.html')).toBe(true);
    expect(matchesPathPattern('/articles/*.html', '/articles/2026/spring.html')).toBe(false);
    expect(matchesPathPattern('/articles/**.html', '/articles/2026/spring.html')).toBe(true);
  });

  it('treats regex metacharacters as literal', () => {
    // Escaped before the wildcards are substituted, or `+` would quantify and `.` match anything.
    expect(matchesPathPattern('/a+b.html', '/aab.html')).toBe(false);
    expect(matchesPathPattern('/a+b.html', '/a+b.html')).toBe(true);
    expect(matchesPathPattern('/a.html', '/axhtml')).toBe(false);
  });

  it('normalises a missing leading slash', () => {
    expect(matchesPathPattern('articles/*.html', '/articles/spring.html')).toBe(true);
  });

  it('is case-sensitive, as VFS paths are', () => {
    expect(matchesPathPattern('/Index.html', '/index.html')).toBe(false);
  });

  it('never matches on an empty pattern', () => {
    expect(matchesPathPattern('', '/index.html')).toBe(false);
    expect(matchesPathPattern('   ', '/index.html')).toBe(false);
  });
});

describe('selectPromptSuggestions', () => {
  const suggestions = [
    s('hero', ['/index.html']),
    s('colours'),
    s('article', ['/articles/*.html']),
    s('footer'),
  ];

  it('puts matching scoped suggestions first, then unscoped, each in author order', () => {
    expect(selectPromptSuggestions(suggestions, '/articles/spring.html').map((x) => x.id))
      .toEqual(['article', 'colours', 'footer']);
  });

  it('keeps unscoped suggestions on a page nothing is scoped to', () => {
    expect(selectPromptSuggestions(suggestions, '/contact.html').map((x) => x.id))
      .toEqual(['colours', 'footer']);
  });

  it('returns everything unchanged when the preview has reported no path', () => {
    expect(selectPromptSuggestions(suggestions, null)).toEqual(suggestions);
  });

  it('treats an empty paths array as unscoped rather than as matching nothing', () => {
    expect(selectPromptSuggestions([s('empty', [])], '/anywhere.html').map((x) => x.id))
      .toEqual(['empty']);
  });
});

describe('a project whose every suggestion is scoped away', () => {
  /**
   * The chat panel suppresses the generic starters as soon as a project defines suggestions of its
   * own, so a project with one scoped suggestion offered nothing at all on a page it did not match:
   * an empty row under a "Try one of these:" heading. The panel now renders nothing when the
   * selection is empty.
   */
  it('selects nothing, which the caller has to treat as "render no row"', () => {
    const only = [s('article', ['/articles/*.html'])];
    expect(selectPromptSuggestions(only, '/index.html')).toEqual([]);
    expect(selectPromptSuggestions(only, '/articles/spring.html')).toHaveLength(1);
  });
});
