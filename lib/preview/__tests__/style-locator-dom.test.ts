// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { STYLE_PREVIEW_JS, STYLE_LOCATOR_JS, TRANSIENT_STYLE_ATTR } from '../style-preview';
import type { OverrideRuleLocation } from '../style-preview';

/**
 * The two lookups, run out of the *emitted* text against a live document.
 *
 * They are two, and they answer different questions. `__oswLocateOverrideRule` finds **our** rule so
 * the probe can lift it out; `__oswIdentifyWinner` finds the **competing** declaration that beat us
 * so the message can name it. Neither is a step of the other.
 *
 * ## What jsdom can and cannot stand in for — measured, not assumed
 *
 * - **jsdom never loads `<link>`.** `document.styleSheets` is empty with one present, so the
 *   "some other stylesheet" branch below is staged as a second `<style>`. That makes it a **proxy**
 *   for the real thing: what it proves is that the scan reaches past the transient element and
 *   hands back the right element and rule, not that a blob `<link>` behaves the same way. The
 *   `<link>` case is Chrome-only and belongs to the e2e spec.
 * - **`sheet.ownerNode` and `sheet.href` are `undefined` in jsdom**, correct in Chrome. The first is
 *   why the locator is element-first at all — a `document.styleSheets` walk could not hand back
 *   anything removable here. The second is why the sheet-to-origin *wiring* is not tested in this
 *   file: no jsdom sheet can carry a blob href, and faking one would be a test of the fake. The
 *   pure mapping is tested directly instead, and the wiring is covered only in e2e.
 * - **Every page stylesheet in this environment resolves to the same origin string** (`a
 *   stylesheet`, since none has an href), so which of two competing *sheets* won is not observable
 *   here. The ranking is exercised through the cases whose origins do differ — inline against a
 *   normal rule, and inline against an `!important` one — and through the comparator directly.
 */
const frame = new Function(
  `${STYLE_PREVIEW_JS}${STYLE_LOCATOR_JS}\nreturn {
     apply: __oswApplyStylePreview,
     locate: __oswLocateOverrideRule,
     winner: __oswIdentifyWinner,
     resolveOrigin: __oswResolveSheetOrigin,
     specificity: __oswSpecificity,
     beats: __oswBeats
   };`,
)() as {
  apply: (markerId: string, css: string | null) => Element | null;
  /** Typed against the declared contract, so a locator that stopped returning an element is a
   *  type error here as well as a failing assertion. */
  locate: (markerId: string) => OverrideRuleLocation | null;
  winner: (el: Element | null, property: string) => string | null;
  resolveOrigin: (href: unknown, blobMap: unknown) => string | null;
  specificity: (selector: string) => number;
  beats: (candidate: unknown, best: unknown) => boolean;
};

const SELECTOR = '[data-osw-id="m1"][data-osw-id]';

function marked(): Element {
  return document.querySelector('[data-osw-id="m1"]')!;
}

/** A page stylesheet, staged as a `<style>` for the reason given at the top of this file. */
function pageSheet(css: string): HTMLStyleElement {
  const el = document.createElement('style');
  el.textContent = css;
  document.head.appendChild(el);
  return el;
}

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '<div class="card" id="hero" data-osw-id="m1">marked</div>';
});

describe('locating our own rule', () => {
  it('finds it in the transient style when one is present', () => {
    frame.apply('m1', 'color: rgb(1, 2, 3);');

    const found = frame.locate('m1')!;

    expect(found).not.toBeNull();
    expect(found.element).toBe(document.querySelector(`style[${TRANSIENT_STYLE_ATTR}]`));
    expect(found.rule.selectorText).toBe(SELECTOR);
    expect(found.rule.style.getPropertyValue('color')).toBe('rgb(1, 2, 3)');
    expect(found.origin).toBe('transient style');
  });

  it('finds it in another stylesheet when the transient is absent', () => {
    const sheetEl = pageSheet(`.other { color: red; }\n${SELECTOR} { color: rgb(7, 7, 7); }`);

    const found = frame.locate('m1')!;

    expect(found).not.toBeNull();
    expect(found.element).toBe(sheetEl);
    expect(found.rule.style.getPropertyValue('color')).toBe('rgb(7, 7, 7)');
    // No href on a <style>, and a blob id would name nothing anyway — see the file header.
    expect(found.origin).toBe('a stylesheet');
  });

  it('hands back the owning ELEMENT, not just the sheet', () => {
    // The probe removes what it is given and puts it back. `sheet.ownerNode` is undefined in jsdom,
    // so a locator that returned only a sheet would have nothing removable here — and the caller
    // could not tell, because the sheet handle itself looks fine.
    pageSheet(`${SELECTOR} { color: rgb(7, 7, 7); }`);
    const found = frame.locate('m1')!;
    expect(window.getComputedStyle(marked()).color).toBe('rgb(7, 7, 7)');

    found.element.remove();

    expect(window.getComputedStyle(marked()).color).not.toBe('rgb(7, 7, 7)');
  });

  it('prefers the transient when both carry the marker selector', () => {
    pageSheet(`${SELECTOR} { color: rgb(7, 7, 7); }`);
    frame.apply('m1', 'color: rgb(1, 2, 3);');

    const found = frame.locate('m1')!;

    // The transient is last in <head> and therefore the rule actually in force. Removing the
    // /overrides.css copy instead would change nothing on screen and report a false "not lost".
    expect(found.origin).toBe('transient style');
    expect(found.rule.style.getPropertyValue('color')).toBe('rgb(1, 2, 3)');
  });

  it('takes the last of several blocks for one marker, as the CSS writer does', () => {
    // Duplicates have equal specificity, so the later one is what the user is looking at and the
    // only one whose removal changes anything. Both spellings of "later" are checked: a second
    // block inside one sheet, and a second sheet — an implementation can get one right and the
    // other wrong, and each is reachable by hand-editing /overrides.css.
    const sheetEl = pageSheet(
      `${SELECTOR} { color: rgb(7, 7, 7); }\n${SELECTOR} { color: rgb(8, 8, 8); }`,
    );

    expect(frame.locate('m1')!.rule.style.getPropertyValue('color')).toBe('rgb(8, 8, 8)');
    expect(window.getComputedStyle(marked()).color).toBe('rgb(8, 8, 8)');

    const later = pageSheet(`${SELECTOR} { color: rgb(9, 9, 9); }`);

    const found = frame.locate('m1')!;
    expect(found.element).toBe(later);
    expect(found.element).not.toBe(sheetEl);
    expect(window.getComputedStyle(marked()).color).toBe('rgb(9, 9, 9)');
  });

  it('returns null when nothing carries it', () => {
    pageSheet('.card { color: red; }');

    expect(frame.locate('m1')).toBeNull();
    expect(frame.locate('m2')).toBeNull();
    // An id that could not have been written into the file cannot own a block either.
    expect(frame.locate('m1" ] {')).toBeNull();
  });

  it('is not fooled by a descendant selector that differs only in a space', () => {
    // `[…="m1"] [data-osw-id]` selects something else entirely. Collapsing whitespace instead of
    // stripping it is what keeps the two apart — and removing a hand-written rule that is not ours
    // would be a silent edit to the user's page.
    pageSheet('[data-osw-id="m1"] [data-osw-id] { color: rgb(7, 7, 7); }');

    expect(frame.locate('m1')).toBeNull();
  });
});

describe('resolving a sheet to something a person recognises', () => {
  // Tested as a pure function, with the map passed in. Every preview stylesheet is rewritten to a
  // blob URL, and `window.__oswVfsBlobUrls` — injected in `components/preview/multipage-preview.tsx`
  // beside the per-load marker — is the only thing that maps one back to a path. No jsdom sheet can
  // carry a blob href, so the alternative would be a test of a stubbed `document.styleSheets`,
  // which asserts on the stub. The sheet-to-origin wiring is covered in e2e.
  const blobMap = {
    '/styles.css': 'blob:http://localhost:3000/8c39ad3e-1111-2222-3333-444455556666',
    '/overrides.css': 'blob:http://localhost:3000/aaaaaaaa-1111-2222-3333-444455556666',
  };

  it('inverts the blob map to a VFS path', () => {
    expect(frame.resolveOrigin(blobMap['/overrides.css'], blobMap)).toBe('/overrides.css');
    expect(frame.resolveOrigin(blobMap['/styles.css'], blobMap)).toBe('/styles.css');
  });

  it('never hands back a blob id', () => {
    // 'blob:http://localhost:3000/8c39ad3e-…' in a message is the generic text people learn to
    // ignore. Unknown is better said as nothing.
    expect(frame.resolveOrigin('blob:http://localhost:3000/unmapped-0000', blobMap)).toBeNull();
    expect(frame.resolveOrigin('blob:http://localhost:3000/unmapped-0000', null)).toBeNull();
  });

  it('keeps a real URL, which does name something', () => {
    expect(frame.resolveOrigin('https://cdn.example.com/reset.css', blobMap))
      .toBe('https://cdn.example.com/reset.css');
  });

  it('answers null for a sheet with no href at all', () => {
    expect(frame.resolveOrigin(null, blobMap)).toBeNull();
    expect(frame.resolveOrigin(undefined, blobMap)).toBeNull();
    expect(frame.resolveOrigin('', blobMap)).toBeNull();
  });
});

describe('identifying what beat us', () => {
  it('names the inline style attribute', () => {
    pageSheet('.card { color: rgb(7, 7, 7); }');
    (marked() as HTMLElement).style.color = 'rgb(3, 3, 3)';

    // The one loss jsdom gets right — and it outranks every normal rule whatever its specificity.
    expect(frame.winner(marked(), 'color')).toBe('inline style');
  });

  it('lets an !important rule outrank an inline declaration', () => {
    pageSheet('.card { color: rgb(7, 7, 7) !important; }');
    (marked() as HTMLElement).style.color = 'rgb(3, 3, 3)';

    expect(frame.winner(marked(), 'color')).toBe('a stylesheet');
  });

  it('names a plain rule when there is no inline declaration', () => {
    pageSheet('.card { color: rgb(7, 7, 7); }');

    expect(frame.winner(marked(), 'color')).toBe('a stylesheet');
  });

  it('never names our own transient style', () => {
    // Ours is the rule that lost. Reporting it as the winner would say "your change was beaten by
    // your change" on every genuine loss.
    frame.apply('m1', 'color: rgb(1, 2, 3);');

    expect(frame.winner(marked(), 'color')).toBeNull();
  });

  it('ignores a rule that does not match, and one that does not set the property', () => {
    pageSheet('.elsewhere { color: rgb(7, 7, 7); }');
    pageSheet('.card { font-weight: 700; }');

    expect(frame.winner(marked(), 'color')).toBeNull();
  });

  it('answers null rather than throwing for a missing element or property', () => {
    expect(frame.winner(null, 'color')).toBeNull();
    expect(frame.winner(marked(), '')).toBeNull();
  });

  it('survives a selector the engine refuses', () => {
    // `el.matches` throws on an unsupported selector rather than returning false, and one bad rule
    // in a user's stylesheet must not take the whole scan down.
    pageSheet(':has(> .nope) { color: rgb(7, 7, 7); }');
    pageSheet('.card { color: rgb(5, 5, 5); }');

    expect(frame.winner(marked(), 'color')).toBe('a stylesheet');
  });
});

describe('the ranking the winner scan uses', () => {
  // Two page stylesheets resolve to the same origin string here, so which of them won is not
  // observable through `__oswIdentifyWinner` in jsdom. The comparator it ranks with is, and it is
  // the part that can be got wrong.
  const at = (important: boolean, specificity: number, order: number) =>
    ({ important, specificity, order, origin: 'x' });

  it('puts importance above specificity, and specificity above order', () => {
    expect(frame.beats(at(true, 100, 0), at(false, 10000, 9))).toBe(true);
    expect(frame.beats(at(false, 10000, 0), at(false, 100, 9))).toBe(true);
    expect(frame.beats(at(false, 100, 9), at(false, 100, 0))).toBe(true);
    expect(frame.beats(at(false, 100, 0), at(false, 100, 9))).toBe(false);
    expect(frame.beats(at(false, 100, 0), null)).toBe(true);
  });

  it('counts a selector the way the cascade does', () => {
    expect(frame.specificity(SELECTOR)).toBe(200);          // the doubled marker: two attributes
    expect(frame.specificity('#hero')).toBe(10000);
    expect(frame.specificity('div.card')).toBe(101);
    expect(frame.specificity('a:hover')).toBe(101);
    expect(frame.specificity('p::before')).toBe(2);
    expect(frame.specificity('*')).toBe(0);
    expect(frame.specificity('main > div.card span')).toBe(103);
    // A bracket inside a quoted attribute value does not end the attribute selector.
    expect(frame.specificity('[title="]"]')).toBe(100);
  });
});
