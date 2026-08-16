// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { STYLE_PREVIEW_JS, TRANSIENT_STYLE_ATTR } from '../style-preview';
import { MARKER_SELECTOR_TEMPLATE, upsertDeclaration } from '@/lib/direct-edit/overrides-css';

/**
 * The transient `<style>`, run out of the *emitted* text against a live document.
 *
 * `STYLE_PREVIEW_JS` only ever executes inside the preview iframe, interpolated into a template
 * literal in `components/preview/multipage-preview.tsx`. Reading the source proves nothing about
 * what the frame parses, so the functions are extracted from the constant and called — the same
 * arrangement `style-preview.test.ts` uses for the expander.
 *
 * jsdom really does cascade `<style>` elements it has in the document, so the assertions below are
 * about a rule that is in force, not about text that happens to be present.
 */
const frame = new Function(
  `${STYLE_PREVIEW_JS}\nreturn { apply: __oswApplyStylePreview, selectorFor: __oswSelectorFor };`,
)() as {
  apply: (markerId: string, css: string | null) => Element | null;
  selectorFor: (markerId: string) => string | null;
};

const SELECTOR = '[data-osw-id="m1"][data-osw-id]';

function transient(): HTMLStyleElement | null {
  return document.querySelector(`style[${TRANSIENT_STYLE_ATTR}]`);
}

function rulesOf(el: HTMLStyleElement | null): CSSStyleRule[] {
  return [...((el?.sheet?.cssRules ?? []) as unknown as CSSStyleRule[])];
}

beforeEach(() => {
  document.head.innerHTML = '<title>t</title><link rel="stylesheet" href="/overrides.css">';
  document.body.innerHTML = '<p data-osw-id="m1">marked</p><p data-osw-id="m2">other</p>';
});

describe('the selector has one authored source', () => {
  it('is built frame-side from the same pattern the CSS writer uses', () => {
    // The pattern crosses the boundary, not the function: the frame script is a string and the
    // marker id arrives at runtime, so `selectorFor` cannot be called here. What can be checked is
    // that both sides land on the same bytes — the (0,2,0) doubling is what the override's whole
    // cascade position depends on.
    expect(frame.selectorFor('m1')).toBe(MARKER_SELECTOR_TEMPLATE.replace('{id}', 'm1'));
    expect(upsertDeclaration('', 'm1', { property: 'color', value: 'red' }))
      .toContain(frame.selectorFor('m1')!);
  });

  it('refuses a marker id that could close the attribute selector', () => {
    // The id arrives over postMessage, so the frame is not the only writer. A quote in it would end
    // the attribute value and let the rest be read as CSS of its own.
    expect(frame.selectorFor('a" ] { color: red } body {')).toBeNull();
    expect(frame.selectorFor('')).toBeNull();
    expect(frame.selectorFor(42 as unknown as string)).toBeNull();
  });
});

describe('injecting a transient style', () => {
  it('creates one style element carrying the doubled marker selector', () => {
    frame.apply('m1', 'color: rgb(1, 2, 3);');

    const el = transient();
    expect(el).not.toBeNull();
    expect(document.querySelectorAll(`style[${TRANSIENT_STYLE_ATTR}]`)).toHaveLength(1);
    expect(rulesOf(el)).toHaveLength(1);
    expect(rulesOf(el)[0].selectorText).toBe(SELECTOR);
    expect(window.getComputedStyle(document.querySelector('[data-osw-id="m1"]')!).color)
      .toBe('rgb(1, 2, 3)');
  });

  it('REPLACES the block on a second injection rather than stacking a second rule', () => {
    frame.apply('m1', 'color: rgb(1, 2, 3);');
    frame.apply('m1', 'color: rgb(9, 9, 9);');

    const el = transient();
    // The count of elements is the weak assertion here and passes against the likelier bug:
    // reusing the element and APPENDING to its text. One rule, and it is the new one.
    expect(document.querySelectorAll(`style[${TRANSIENT_STYLE_ATTR}]`)).toHaveLength(1);
    expect(rulesOf(el)).toHaveLength(1);
    expect(el!.textContent).toBe(`${SELECTOR} { color: rgb(9, 9, 9); }`);
    expect(el!.textContent).not.toContain('rgb(1, 2, 3)');
    expect(window.getComputedStyle(document.querySelector('[data-osw-id="m1"]')!).color)
      .toBe('rgb(9, 9, 9)');
  });

  it('applies every declaration in the block, not just the first', () => {
    // The host sends the element's whole accumulated block. An implementation that took one
    // declaration would make each edit visually revert the last, and 4b's controls — which render
    // from computed style — would snap back with it.
    frame.apply('m1', 'color: rgb(4, 5, 6); font-weight: 700;');

    const computed = window.getComputedStyle(document.querySelector('[data-osw-id="m1"]')!);
    expect(computed.color).toBe('rgb(4, 5, 6)');
    expect(computed.fontWeight).toBe('700');
  });

  it('targets only the marked element', () => {
    frame.apply('m1', 'color: rgb(4, 5, 6);');

    expect(window.getComputedStyle(document.querySelector('[data-osw-id="m2"]')!).color)
      .not.toBe('rgb(4, 5, 6)');
  });

  it('removes the element on css: null', () => {
    frame.apply('m1', 'color: rgb(1, 2, 3);');
    frame.apply('m1', null);

    expect(transient()).toBeNull();
    expect(window.getComputedStyle(document.querySelector('[data-osw-id="m1"]')!).color)
      .not.toBe('rgb(1, 2, 3)');
  });

  it('clears rather than half-applies when the input is unusable', () => {
    frame.apply('m1', 'color: rgb(1, 2, 3);');

    frame.apply('m1', '   ');
    expect(transient()).toBeNull();

    frame.apply('m1', 'color: red;');
    frame.apply('not a safe id"', 'color: blue;');
    expect(transient()).toBeNull();
  });
});

describe('where the element goes', () => {
  it('is appended at the END of head, which is what wins the cascade', () => {
    // Not decoration: <link> order does not beat a later <style>, so sitting last is the only
    // reason the transient overrides the /overrides.css rule for the same marker.
    // `insertBefore(head.firstChild)` would lose silently — the page would look unchanged.
    frame.apply('m1', 'color: rgb(1, 2, 3);');

    expect(document.head.lastElementChild).toBe(transient());
  });

  it('moves back to the end when something was appended after it', () => {
    // The shape a recompile leaves behind: a fresh stylesheet lands in <head> after ours, and the
    // next edit has to end up last again or it silently stops winning.
    frame.apply('m1', 'color: rgb(1, 2, 3);');
    document.head.appendChild(document.createElement('link'));

    frame.apply('m1', 'color: rgb(9, 9, 9);');

    expect(document.head.lastElementChild).toBe(transient());
    expect(document.querySelectorAll(`style[${TRANSIENT_STYLE_ATTR}]`)).toHaveLength(1);
  });
});

describe('the emitted source stays inside the escaping rules', () => {
  it('authors no backtick, which would terminate the literal it is emitted into', () => {
    expect(STYLE_PREVIEW_JS).not.toContain('`');
    // No regex literal either: one authored inside the emitting template literal loses a level of
    // escaping before it is ever parsed. The two backslashes this constant does carry are the ones
    // JSON.stringify put around the selector pattern's quotes, which is exactly correct.
    expect(STYLE_PREVIEW_JS).toContain(JSON.stringify(MARKER_SELECTOR_TEMPLATE));
  });
});
