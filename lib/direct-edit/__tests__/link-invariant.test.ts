import { describe, it, expect } from 'vitest';
import { ensureOverridesLink, OVERRIDES_LINK } from '../link-invariant';

describe('ensureOverridesLink', () => {
  it('inserts before </head> when absent', () => {
    const out = ensureOverridesLink('<html><head><title>t</title></head><body></body></html>');
    expect(out.changed).toBe(true);
    expect(out.content.indexOf(OVERRIDES_LINK)).toBeLessThan(out.content.indexOf('</head>'));
  });

  it('emits a link the preview rewriters actually match', () => {
    // Both copies match href="..." with DOUBLE quotes only:
    //   components/preview/multipage-preview.tsx  /href="([^"]+)"/g
    //   lib/utils/project-thumbnail.ts            /href="([^"]+\.css)"/g
    // A single-quoted link publishes fine and silently fails in the preview and in thumbnails.
    for (const re of [/href="([^"]+)"/, /href="([^"]+\.css)"/]) {
      const m = OVERRIDES_LINK.match(re);
      expect(m, `not matched by ${re}`).toBeTruthy();
      expect(m![1]).toBe('/overrides.css');
    }
  });

  it('is idempotent', () => {
    const once = ensureOverridesLink('<html><head></head><body></body></html>').content;
    const twice = ensureOverridesLink(once);
    expect(twice.changed).toBe(false);
    expect(twice.content).toBe(once);
  });

  it('moves the link to last when another stylesheet was added after it', () => {
    // The (0,2,0) tie-break depends on source order, and the agent will add stylesheets.
    const drifted = '<html><head>' + OVERRIDES_LINK +
      '<link rel="stylesheet" href="/late.css"></head><body></body></html>';
    const out = ensureOverridesLink(drifted);
    expect(out.changed).toBe(true);
    expect(out.content.indexOf('/overrides.css')).toBeGreaterThan(out.content.indexOf('/late.css'));
    expect(out.content.match(/overrides\.css/g)).toHaveLength(1);   // no stale copy left behind
  });

  it('reports rather than inventing a head when there is none', () => {
    const out = ensureOverridesLink('<div>fragment</div>');
    expect(out.changed).toBe(false);
    expect(out.skipped).toBe('no-head');
  });

  it('handles an attributed or uppercased head tag', () => {
    for (const html of ['<html><head lang="en"></head><body></body></html>',
                        '<html><HEAD></HEAD><body></body></html>']) {
      expect(ensureOverridesLink(html).changed).toBe(true);
    }
  });

  // --- beyond the plan's block, pinning behaviour the implementation commits to ---

  it('normalises a single-quoted hand-written link the rewriters would miss', () => {
    const out = ensureOverridesLink(
      `<html><head><link rel='stylesheet' href='/overrides.css'></head><body></body></html>`);
    expect(out.changed).toBe(true);
    expect(out.content).toContain(OVERRIDES_LINK);
    expect(out.content.match(/overrides\.css/g)).toHaveLength(1);
  });

  it('collapses duplicate links to one', () => {
    const dupes = '<html><head>' + OVERRIDES_LINK + OVERRIDES_LINK + '</head><body></body></html>';
    const out = ensureOverridesLink(dupes);
    expect(out.changed).toBe(true);
    expect(out.content.match(/overrides\.css/g)).toHaveLength(1);
  });

  it('leaves trailing whitespace before </head> alone rather than churning every page', () => {
    const tidy = '<html><head>\n  ' + OVERRIDES_LINK + '\n</head><body></body></html>';
    const out = ensureOverridesLink(tidy);
    expect(out.changed).toBe(false);
    expect(out.content).toBe(tidy);
  });
});
