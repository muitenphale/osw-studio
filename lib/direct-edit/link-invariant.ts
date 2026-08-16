/**
 * Keeping `/overrides.css` linked from every page, and linked *last*.
 *
 * Pure string work on one page's HTML. The orchestrator runs this over every page on every apply,
 * which is what makes the link an invariant rather than a one-time write: a page the agent adds
 * later picks it up on the next edit instead of silently losing every override.
 */

/**
 * The exact tag written into every page.
 *
 * **Double quotes are load-bearing.** Two independent rewriters match `href` with double quotes
 * only — `components/preview/multipage-preview.tsx` (`/href="([^"]+)"/g`) and
 * `lib/utils/project-thumbnail.ts` (`/href="([^"]+\.css)"/g`). A single-quoted link is valid HTML
 * and publishes correctly, then fails to resolve in the preview and in thumbnail capture, which is
 * the worst possible failure shape: the user sees their override not applying in the only place
 * they are looking. A test asserts both regexes match this constant.
 */
export const OVERRIDES_LINK = '<link rel="stylesheet" href="/overrides.css">';

/**
 * Any existing link to `/overrides.css`, whatever the attribute order or quote style, so a
 * hand-written or older-format copy is normalised rather than duplicated.
 *
 * `[^>]*` cannot cope with a `>` inside an attribute value. In a `<link>` in a `<head>` that does
 * not occur in practice, and the failure mode is benign — the link is not recognised, so a second
 * one is added rather than any content being destroyed.
 */
const EXISTING_LINK_RE = /<link\b[^>]*\bhref\s*=\s*["']\/overrides\.css["'][^>]*>/gi;

export interface EnsureLinkResult {
  changed: boolean;
  content: string;
  /** Set when the page has no `</head>` and was left untouched. */
  skipped?: 'no-head';
}

/**
 * Ensure the page links `/overrides.css`, as the last stylesheet in `<head>`.
 *
 * "Last" is not cosmetic. The override selector is doubled to (0,2,0) so it *ties* an ordinary
 * compound selector and wins on source order; a stylesheet the agent appends afterwards would take
 * the tie back, and every override on the page would stop applying with nothing in the CSS looking
 * wrong. So an existing link that has drifted is moved rather than left.
 *
 * Reports `no-head` instead of inventing a `<head>`. A fragment or partial that is included into a
 * real page must not grow one — it would end up nested inside the including page's body.
 */
export function ensureOverridesLink(html: string): EnsureLinkResult {
  const closeIdx = html.toLowerCase().indexOf('</head');
  if (closeIdx === -1) return { changed: false, content: html, skipped: 'no-head' };

  const head = html.slice(0, closeIdx);
  const matches = Array.from(head.matchAll(EXISTING_LINK_RE));

  if (matches.length === 1) {
    const m = matches[0];
    const end = (m.index ?? 0) + m[0].length;
    // Already exactly right: one link, in our canonical form, with nothing but whitespace between
    // it and </head>. Returning unchanged here is what keeps the orchestrator's per-apply sweep
    // from rewriting — and forcing a recompile of — every page in the project on every edit.
    if (m[0] === OVERRIDES_LINK && head.slice(end).trim() === '') {
      return { changed: false, content: html };
    }
  }

  const content = head.replace(EXISTING_LINK_RE, '') + OVERRIDES_LINK + html.slice(closeIdx);
  return { changed: content !== html, content };
}
