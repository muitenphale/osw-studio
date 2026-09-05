import type { PromptSuggestion } from './types';

/**
 * Which suggestions belong on which preview page.
 *
 * Pure and dependency-free. Regex metacharacters are escaped before the wildcards are substituted,
 * so a pattern like `/a+b.html` matches only itself rather than acting as a quantifier.
 */

/** Leading slash, so `articles/*.html` and `/articles/*.html` behave the same. */
export function normalizePathPattern(pattern: string): string {
  const trimmed = pattern.trim();
  if (trimmed === '') return '';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

/**
 * True when `path` matches `pattern`.
 *
 * `*` matches a run of characters within one segment; `**` matches across `/`. Case-sensitive, as
 * VFS paths are. Paths are VFS-absolute, e.g. `/articles/spring.html`.
 */
export function matchesPathPattern(pattern: string, path: string): boolean {
  const normalized = normalizePathPattern(pattern);
  if (normalized === '') return false;

  // Split on `**` first so the single-star pass cannot consume it one star at a time.
  const source = normalized
    .split('**')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '[^/]*'))
    .join('.*');

  return new RegExp(`^${source}$`).test(path);
}

/** Whether a suggestion is limited to particular pages. An empty list reads as unscoped. */
function isScoped(suggestion: PromptSuggestion): boolean {
  return !!suggestion.paths && suggestion.paths.length > 0;
}

/**
 * The suggestions to offer for a page: matching scoped ones first in author order, then unscoped
 * ones in author order.
 *
 * Unscoped suggestions are never dropped, so a general action stays reachable everywhere; the
 * ordering is what gives a page-specific action the first inline slot.
 *
 * `currentPath === null` means the preview has not reported a page, or the runtime has no page
 * concept. Everything is returned unchanged, which is how this behaved before scoping existed.
 */
export function selectPromptSuggestions(
  suggestions: PromptSuggestion[],
  currentPath: string | null
): PromptSuggestion[] {
  if (currentPath === null) return suggestions;

  const matching: PromptSuggestion[] = [];
  const unscoped: PromptSuggestion[] = [];

  for (const suggestion of suggestions) {
    if (!isScoped(suggestion)) {
      unscoped.push(suggestion);
    } else if (suggestion.paths!.some((p) => matchesPathPattern(p, currentPath))) {
      matching.push(suggestion);
    }
  }

  return [...matching, ...unscoped];
}
