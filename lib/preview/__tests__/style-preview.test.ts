import { describe, it, expect } from 'vitest';
import { SHORTHAND_LONGHANDS, STYLE_QUERY_JS } from '../style-preview';

/**
 * The property expander, run out of the *emitted* text.
 *
 * `STYLE_QUERY_JS` is a string that only ever executes inside the preview iframe, interpolated into
 * a template literal in `components/preview/multipage-preview.tsx`. Reading the source proves
 * nothing about what the frame parses, so the function is extracted from the constant and called.
 */
const expand = new Function(`${STYLE_QUERY_JS}\nreturn __oswExpandProperties;`)() as
  (properties: unknown) => string[];

describe('the longhand table is the single source', () => {
  it('is interpolated into the frame source rather than restated in it', () => {
    // Two copies of this list is the failure mode worth spending an assertion on: the host-side
    // table would be the one a reviewer reads and the frame-side one would be what runs.
    expect(STYLE_QUERY_JS).toContain(JSON.stringify(SHORTHAND_LONGHANDS));
  });

  it('carries every shorthand a per-side control needs, not just the box model', () => {
    // `padding` alone is what a `setProperty`-based expander gets right — measured, jsdom expands
    // padding and margin and leaves border-radius, gap and inset alone. Naming the rest here is
    // what makes that shortcut fail if someone reaches for it later.
    expect(Object.keys(SHORTHAND_LONGHANDS).sort()).toEqual([
      'border-color', 'border-radius', 'border-style', 'border-width',
      'gap', 'inset', 'margin', 'padding',
    ]);
  });

  it('maps each shorthand onto longhands, never onto itself', () => {
    for (const [shorthand, longhands] of Object.entries(SHORTHAND_LONGHANDS)) {
      expect(longhands, shorthand).not.toContain(shorthand);
      expect(longhands.length, shorthand).toBeGreaterThan(1);
    }
  });
});

describe('the emitted expander', () => {
  it('replaces a shorthand with its longhands', () => {
    expect(expand(['padding'])).toEqual([
      'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    ]);
    // A second shorthand, because one passes against a hardcoded `padding` branch.
    expect(expand(['border-radius'])).toEqual([
      'border-top-left-radius', 'border-top-right-radius',
      'border-bottom-right-radius', 'border-bottom-left-radius',
    ]);
    expect(expand(['gap'])).toEqual(['row-gap', 'column-gap']);
  });

  it('passes anything not in the table through untouched', () => {
    expect(expand(['color', 'padding-top', 'font-family'])).toEqual([
      'color', 'padding-top', 'font-family',
    ]);
  });

  it('de-duplicates, so a shorthand and one of its own longhands ask once', () => {
    // The shape 4b's property table produces the moment a control edits one side and the panel
    // still reads the box: a repeated key would be harmless, but a repeated *read* is not free and
    // the reply's key order is what the panel renders from.
    expect(expand(['padding', 'padding-left'])).toEqual([
      'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    ]);
    expect(expand(['color', 'color'])).toEqual(['color']);
  });

  it('survives the shapes an untrusted postMessage can carry', () => {
    // `properties` arrives from the host over postMessage, so the frame is not the only writer and
    // a throw here would take down the rest of the message handler.
    expect(expand(undefined)).toEqual([]);
    expect(expand([])).toEqual([]);
    expect(expand('padding')).toEqual([]);
    expect(expand([null, 42, '', 'color'])).toEqual(['color']);
  });

  it('is not fooled by a property named after an Object.prototype key', () => {
    // The seen-set and the table are both plain lookups; a prototype-backed object would report
    // `constructor` as already seen and silently drop it.
    expect(expand(['constructor', 'toString'])).toEqual(['constructor', 'toString']);
  });
});

describe('the emitted source stays inside the escaping rules', () => {
  it('authors no regex literal, which a template literal would strip a backslash from', () => {
    expect(STYLE_QUERY_JS).not.toContain('\\');
    expect(STYLE_QUERY_JS).not.toContain('`');
  });
});
