// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { STYLE_QUERY_JS, STYLE_PREVIEW_JS, STYLE_LOCATOR_JS, STYLE_PROBE_JS } from '../style-preview';

/**
 * The probe — remove our rule, look, put it back — run out of the *emitted* text.
 *
 * ## What is deliberately NOT in this file, and why
 *
 * **jsdom detects exactly one loss: an inline `style` attribute.** Measured, not reasoned: jsdom
 * ranks specificity above importance, so the override's doubled `(0,2,0)` selector beats an
 * `!important` rule and beats `#id`, and every rule-based loss therefore reports as a *success*
 * here. A test asserting "`!important` wins" in this environment would fail against a correct probe
 * and pass against a faked one, which is why the whole toggle-and-compare matrix lives in
 * `e2e/style-probe.test.ts` and runs in Chrome.
 *
 * What jsdom *can* prove is the mechanism, and the mechanism is where the two real hazards are:
 * the page must be left byte-identical, and the winner must be looked for while our rule is out.
 * Both are environment-independent, and both are checked below.
 */
const frame = new Function(
  `${STYLE_QUERY_JS}${STYLE_PREVIEW_JS}${STYLE_LOCATOR_JS}${STYLE_PROBE_JS}\nreturn {
     apply: __oswApplyStylePreview,
     probe: __oswProbeStyleLoss
   };`,
)() as {
  apply: (markerId: string, css: string | null) => Element | null;
  probe: (el: Element | null, markerId: string, properties: unknown) => { lost: string[]; winner: string | null };
};

const SELECTOR = '[data-osw-id="m1"][data-osw-id]';

function marked(): Element {
  return document.querySelector('[data-osw-id="m1"]')!;
}

/**
 * A stylesheet that is NOT the transient one — the shape our rule has after a recompile, when
 * `/overrides.css` carries it. jsdom never loads `<link>`, so a `<style>` stands in; what it stands
 * in for is "a sheet `__oswIdentifyWinner` does not skip", which is the whole point.
 */
function pageSheet(css: string): HTMLStyleElement {
  const el = document.createElement('style');
  el.textContent = css;
  document.head.appendChild(el);
  return el;
}

function computed(property: string): string {
  return window.getComputedStyle(marked()).getPropertyValue(property);
}

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '<div class="card" id="hero" data-osw-id="m1">marked</div>';
});

describe('answering when there is nothing to answer about', () => {
  it('reports nothing lost for an element that no longer resolves', () => {
    // The host is waiting on a reply. `lost: []` is the answer; silence is indistinguishable from a
    // frame that has not got round to it.
    expect(frame.probe(null, 'm1', ['color'])).toEqual({ lost: [], winner: null });
  });

  it('reports nothing lost when no sheet carries the marker at all', () => {
    // Nothing of ours is in the document, so nothing of ours can have been beaten. The tempting
    // alternative — "our value is not showing, so every property lost" — lights the whole panel up
    // the first time a marker is probed before its block has been written.
    pageSheet('.card { color: rgb(7, 7, 7); }');

    expect(frame.probe(marked(), 'm1', ['color'])).toEqual({ lost: [], winner: null });
  });

  it('reports nothing lost for an empty or malformed property list', () => {
    frame.apply('m1', 'color: rgb(1, 2, 3);');

    expect(frame.probe(marked(), 'm1', [])).toEqual({ lost: [], winner: null });
    // `properties` crosses postMessage, so the frame is not the only writer.
    expect(frame.probe(marked(), 'm1', 'color')).toEqual({ lost: [], winner: null });
    expect(frame.probe(marked(), 'm1', undefined)).toEqual({ lost: [], winner: null });
  });
});

describe('the one loss jsdom gets right', () => {
  it('reports a property beaten by an inline style, and names it', () => {
    frame.apply('m1', 'color: rgb(1, 2, 3);');
    (marked() as HTMLElement).style.color = 'rgb(3, 3, 3)';
    // The precondition, stated: without it this test also passes against a probe that reports
    // everything lost unconditionally.
    expect(computed('color')).toBe('rgb(3, 3, 3)');

    const out = frame.probe(marked(), 'm1', ['color']);

    expect(out.lost).toEqual(['color']);
    expect(out.winner).toBe('inline style');
  });

  it('reports nothing lost when the override is the thing in force', () => {
    // The control. A probe hard-wired to "lost" fails here; one hard-wired to "not lost" fails above.
    frame.apply('m1', 'color: rgb(1, 2, 3);');
    expect(computed('color')).toBe('rgb(1, 2, 3)');

    expect(frame.probe(marked(), 'm1', ['color'])).toEqual({ lost: [], winner: null });
  });
});

describe('who beat us is asked with our own rule out of the document', () => {
  it('does not name our own override as the thing that beat our override', () => {
    // The post-recompile shape: our rule sits in an ordinary sheet (`/overrides.css`), which
    // `__oswIdentifyWinner` skips — it skips the *transient* style and nothing else. So the order of
    // the two operations is the whole test.
    //
    // Our rule here sets the colour the element already had, so removing it changes nothing and the
    // property is genuinely lost — but to *nothing nameable*. Ask before the removal and our own
    // rule is the highest-ranked candidate in the document and gets named.
    pageSheet(`${SELECTOR} { color: rgb(0, 0, 0); }`);
    expect(computed('color')).toBe('rgb(0, 0, 0)');

    const out = frame.probe(marked(), 'm1', ['color']);

    expect(out.lost).toEqual(['color']);
    expect(out.winner).toBeNull();
  });
});

describe('the page is left exactly as it was found', () => {
  it('puts our rule back in its own position, not at the end of head', () => {
    // Reinsertion at the end would newly outrank every sheet after it — a silent edit to the page,
    // made by an operation whose entire job is to read it.
    //
    // Checked on the DOM, not on a computed value, and that is a jsdom limit rather than a
    // preference: measured, jsdom's `document.styleSheets` order is *insertion* order, not document
    // order, so a reinserted sheet moves to the end of the cascade here however carefully the
    // element is put back. The competing sheet below therefore sets a property nobody probes, so
    // that artefact cannot be mistaken for a finding. Cascade order after a probe is Chrome's job,
    // and `e2e/style-probe.test.ts` asserts it.
    const ours = pageSheet(`${SELECTOR} { color: rgb(1, 2, 3); }`);
    const later = pageSheet(`.card { font-weight: 700; }`);
    const orderBefore = Array.from(document.head.children);
    expect(orderBefore).toEqual([ours, later]);

    frame.probe(marked(), 'm1', ['color']);

    // Present at all — a probe that removes and forgets has silently deleted the user's change.
    expect(ours.isConnected).toBe(true);
    expect(Array.from(document.head.children)).toEqual(orderBefore);
    expect(computed('color')).toBe('rgb(1, 2, 3)');
  });

  it('leaves every probed value byte-identical', () => {
    frame.apply('m1', 'color: rgb(1, 2, 3); padding-left: 7px;');
    const before = ['color', 'padding-left', 'display'].map(computed);

    frame.probe(marked(), 'm1', ['color', 'padding-left']);

    expect(['color', 'padding-left', 'display'].map(computed)).toEqual(before);
  });
});

describe('the properties it answers about', () => {
  it('expands a shorthand, so a per-side control is told which side lost', () => {
    // Same expansion `style-query` uses, so `lost` and `values` are keyed alike. The loss is staged
    // as an inline `padding`, this environment's one detectable one.
    (marked() as HTMLElement).setAttribute('style', 'padding: 5px');
    frame.apply('m1', 'padding: 9px;');
    expect(computed('padding-left')).toBe('5px');

    const out = frame.probe(marked(), 'm1', ['padding']);

    expect(out.lost).toEqual([
      'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    ]);
    // Named as longhands, never as the shorthand the host happened to ask with.
    expect(out.lost).not.toContain('padding');
    expect(out.winner).toBe('inline style');
  });
});
