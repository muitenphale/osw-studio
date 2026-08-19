import { describe, it, expect, vi } from 'vitest';

import { focusInclusionAfterWrite, focusInclusionRelease, focusMessageContext, type SelectionSurface } from '../index';

/**
 * The split between *selecting* an element in the preview and *including* it in the next message.
 *
 * Nothing tested the old behaviour, where the two were the same act, so a wrong implementation of
 * the split stays green unless the decision is pulled out of the React callbacks that dispatch it.
 * Both functions here are exported for that reason alone, the way `focusReloadAction` and
 * `applyToolbarAction` already are.
 *
 * The desktop/mobile difference is in the helpers rather than in the two mounts' wiring for the same
 * reason. The mounts still say which surface they are — that part cannot be inferred, since both
 * blocks are always in the React tree — but what the surfaces *mean* is decided here, where it can
 * be mutated and caught.
 *
 * What these tests cannot reach: whether `handleGenerate` actually calls `focusMessageContext`, and
 * whether the deselect handlers actually call `clearFocusSelection`. Those are call sites inside a
 * 2500-line component that only React can drive — measured, not assumed: deleting the flag-clear
 * from a deselect handler leaves the whole suite green. The four deselects were collapsed into one
 * function for that reason, so the untestable surface is one call rather than four; a rewiring of it
 * is still a manual check.
 */

type Payload = { domPath: string; outerHTML: string };

const card: Payload = { domPath: 'main > section > div.card', outerHTML: '<div class="card">a</div>' };

describe('focusInclusionAfterWrite, on desktop', () => {
  it('carries the flag through a re-resolve of the same element', () => {
    // The recompile case, and the reason this compares `domPath` rather than `focusSignature`: the
    // signature folds in `outerHTML.length`, which moves the moment a style edit stamps
    // `data-osw-id`. Signature-based, this reads `false` and the user's include is silently lost
    // between pressing the button and the frame coming back.
    const resolved: Payload = { domPath: card.domPath, outerHTML: '<div class="card" data-osw-id="k3">a</div>' };

    expect(resolved.outerHTML.length).not.toBe(card.outerHTML.length);
    expect(focusInclusionAfterWrite(card, resolved, true, 'desktop')).toBe(true);
  });

  it('drops the flag when a different element is selected', () => {
    // Otherwise element B is attached to the message because A was, with no press on B's toolbar.
    const other: Payload = { domPath: 'main > footer > p', outerHTML: '<p>b</p>' };

    expect(focusInclusionAfterWrite(card, other, true, 'desktop')).toBe(false);
  });

  it('does not raise a flag that was not raised', () => {
    // Selection is not inclusion — the desktop half of the whole plan. Re-selecting, re-resolving
    // and deselecting all leave a lowered flag lowered; only the toolbar's include button raises it.
    expect(focusInclusionAfterWrite(card, card, false, 'desktop')).toBe(false);
    expect(focusInclusionAfterWrite(null, card, false, 'desktop')).toBe(false);
  });

  it('drops the flag when there was no previous selection to carry it from', () => {
    expect(focusInclusionAfterWrite(null, card, true, 'desktop')).toBe(false);
  });

  it('drops the flag when either side has no path to compare', () => {
    // An unpathed payload cannot be shown to be the same element, and "cannot be shown" has to fail
    // towards dropping: a wrong drop costs one button press, a wrong carry puts an element the user
    // never chose into the prompt and into /api/server-generate.
    const unpathed: Payload = { domPath: '', outerHTML: '<div></div>' };

    expect(focusInclusionAfterWrite(card, unpathed, true, 'desktop')).toBe(false);
    expect(focusInclusionAfterWrite(unpathed, card, true, 'desktop')).toBe(false);
    expect(focusInclusionAfterWrite(unpathed, unpathed, true, 'desktop')).toBe(false);
  });
});

describe('focusInclusionAfterWrite, on mobile', () => {
  it('raises the flag on any selection, because there is no toolbar to raise it', () => {
    // The whole reason the surface is a parameter. `onToolbarAction` is wired only to the desktop
    // mount, so applying the desktop rule to mobile does not scope the toolbar to desktop — it
    // deletes mobile's ability to put an element in a message at all, silently, since nothing
    // renders the mobile tree in tests either. Mobile keeps select-implies-attach.
    expect(focusInclusionAfterWrite(null, card, false, 'mobile')).toBe(true);
  });

  it('raises the flag for a different element too', () => {
    // On desktop this drops, because element B inheriting A's inclusion is a leak. On mobile it is
    // not an inheritance: selecting B *is* the user asking for B.
    const other: Payload = { domPath: 'main > footer > p', outerHTML: '<p>b</p>' };

    expect(focusInclusionAfterWrite(card, other, false, 'mobile')).toBe(true);
  });

  it('still drops the flag on a deselect', () => {
    // The deselect check is deliberately read before the surface check. Read after it, the mobile
    // branch would raise the flag on the way *out* of a selection and leave it stranded high.
    expect(focusInclusionAfterWrite(card, null, true, 'mobile')).toBe(false);
    expect(focusInclusionAfterWrite(card, null, false, 'mobile')).toBe(false);
  });
});

describe('focusInclusionAfterWrite, on both surfaces', () => {
  it('drops the flag on a deselect', () => {
    // All four genuine deselects — the focus tool cleared, the element resolved away, a navigation
    // clearing on frame-ready, and the toolbar's dismiss — write `null` through here. A flag that
    // outlives its selection is the stale-inclusion leak: the *next* element goes into the message
    // without the user pressing anything.
    for (const surface of ['desktop', 'mobile'] as SelectionSurface[]) {
      expect(focusInclusionAfterWrite(card, null, true, surface)).toBe(false);
    }
  });
});

describe('focusInclusionRelease', () => {
  it('keeps the selection on desktop', () => {
    // The chip's ✕ and the send are retargets, not deselects: the toolbar is still anchored to the
    // element and the Styles tab is still showing it.
    expect(focusInclusionRelease('desktop').clearSelection).toBe(false);
  });

  it('clears the selection on mobile', () => {
    // What ✕ does today, and the only coherent answer given the rule above.
    expect(focusInclusionRelease('mobile').clearSelection).toBe(true);
  });

  it('never strands a surface where selecting is the only way to include', () => {
    // The coupling between the two decisions, pinned. On a surface whose selections auto-include,
    // releasing must take the selection down: leave it up and the user sits in "selected but not
    // included" — chip gone, crosshair still lit — with no control that can leave the state.
    for (const surface of ['desktop', 'mobile'] as SelectionSurface[]) {
      const selectionAutoIncludes = focusInclusionAfterWrite(null, card, false, surface);
      if (selectionAutoIncludes) expect(focusInclusionRelease(surface).clearSelection).toBe(true);
    }
  });
});

describe('focusMessageContext', () => {
  it('yields nothing for a selection that was never included', () => {
    // The behaviour of the whole plan, in one assertion: an element the user selected and did not
    // include reaches neither the prompt text nor the generation options.
    const format = vi.fn(() => 'Focus context: …');

    const context = focusMessageContext(card, false, format);

    expect(context).toEqual({ promptBlock: null, generationFocus: null });
    // The prompt block is built *inside* the gate rather than by the caller from the returned
    // target. That is what stops the prompt read being left behind when the gate is removed — and
    // this is the assertion that notices.
    expect(format).not.toHaveBeenCalled();
  });

  it('yields both reads for an included selection', () => {
    const format = vi.fn(() => 'Focus context: …');

    const context = focusMessageContext(card, true, format);

    expect(context.promptBlock).toBe('Focus context: …');
    // The same option reaches `uiMeta.focusContext` (the sent message's context card) and
    // `executeOptions.focusContext` (shipped to /api/server-generate).
    expect(context.generationFocus).toBe(card);
    expect(format).toHaveBeenCalledWith(card);
  });

  it('never yields one read without the other', () => {
    // Gating only some of the send path is the trap: the composer looks empty while the element is
    // still in the prompt and still on the wire. One gate, both outputs, so they cannot disagree.
    for (const [focus, included] of [[card, true], [card, false], [null, true], [null, false]] as const) {
      const context = focusMessageContext(focus, included, () => 'block');
      expect(context.promptBlock === null).toBe(context.generationFocus === null);
    }
  });

  it('yields nothing when there is no selection at all', () => {
    expect(focusMessageContext(null, true, () => 'block')).toEqual({ promptBlock: null, generationFocus: null });
  });
});

/**
 * The rule is about whether a control exists that can include deliberately, not about the viewport.
 *
 * Both cases where none exists behave the same: mobile, which renders no toolbar, and a runtime
 * whose elements carry no provenance, where the toolbar is suppressed because every action on it
 * would refuse. In both, selecting has to *be* including, or a selection could never reach the
 * agent at all.
 */
describe('a runtime with no toolbar', () => {
  const el = { domPath: 'main > h1' };

  it('includes every selection, exactly as mobile does', () => {
    expect(focusInclusionAfterWrite(null, el, false, 'desktop', false)).toBe(true);
    expect(focusInclusionAfterWrite(null, el, false, 'mobile', false)).toBe(true);
  });

  it('still lowers the flag on a deselect', () => {
    // Checked before the no-toolbar rule, or leaving the element would raise it on the way out.
    expect(focusInclusionAfterWrite(el, null, true, 'desktop', false)).toBe(false);
  });

  it('leaves the supported case alone, which is the whole point of the split', () => {
    expect(focusInclusionAfterWrite(null, el, false, 'desktop', true)).toBe(false);
  });

  it('defaults to the supported behaviour when the flag is not supplied', () => {
    // Every pre-existing caller and test omits it; a default of `false` would silently turn the
    // split back off everywhere.
    expect(focusInclusionAfterWrite(null, el, false, 'desktop')).toBe(false);
  });
});

