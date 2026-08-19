const mockLocalStorage: Record<string, string> = {};

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.stubGlobal('localStorage', {
  getItem: (key: string) => mockLocalStorage[key] ?? null,
  setItem: (key: string, value: string) => { mockLocalStorage[key] = value; },
  removeItem: (key: string) => { delete mockLocalStorage[key]; },
});

import { createStore } from 'zustand/vanilla';
import { createLayoutSlice, type LayoutSlice } from '@/lib/stores/slices/layout';
import { applyToolbarAction, STYLE_DISMISSES_TOOLBAR } from '../index';

/**
 * What the host does with a press on the preview toolbar.
 *
 * Driven against a **real layout store**, not a spy. The bug this function exists to prevent is
 * calling `togglePanel('elements')` unconditionally, and `togglePanel` closes a panel that is
 * already open — so `Style` pressed with the Inspector up would dismiss it. A test asserting that
 * `togglePanel` *was called* is green against exactly that bug; only the resulting `showElements`
 * tells the two apart, and only the real slice produces it.
 *
 * Separated out of the React callback for the same reason `focusReloadAction` was: the callback
 * reaches the Zustand store and is only reachable through React, so testing it in place would mean
 * either React Testing Library or a mocked store — and the second asserts on the mock.
 */

function layoutStore(elementsOpen: boolean) {
  const store = createStore<LayoutSlice>()((...a) => ({ ...createLayoutSlice(...a) }));
  if (store.getState().showElements !== elementsOpen) store.getState().togglePanel('elements');
  expect(store.getState().showElements).toBe(elementsOpen);
  return store;
}

beforeEach(() => {
  for (const key of Object.keys(mockLocalStorage)) delete mockLocalStorage[key];
});

describe('Style', () => {
  it('opens the Inspector when it is closed, on the Styles tab', () => {
    const store = layoutStore(false);

    const effect = applyToolbarAction('style', store.getState());

    expect(store.getState().showElements).toBe(true);
    expect(effect.tab).toBe('styles');
  });

  it('leaves an already-open Inspector open', () => {
    const store = layoutStore(true);

    const effect = applyToolbarAction('style', store.getState());

    // The whole reason the guard exists. Unguarded, this reads `false` — the second Style press
    // dismisses the panel the first one opened, and the user sees the Inspector flicker shut.
    expect(store.getState().showElements).toBe(true);
    // Still asked for, because "already open" says nothing about which tab is showing: the user may
    // have opened the Inspector by hand and left it on the tree.
    expect(effect.tab).toBe('styles');
  });

  it('does not clear the selection it just handed to the Inspector', () => {
    // Opening the Inspector flips `provenance`, which forces a recompile and tears the toolbar down
    // regardless — so clearing here would additionally drop the `focusContext` that is the only way
    // it ever comes back, and would empty the Styles tab the press just opened.
    expect(STYLE_DISMISSES_TOOLBAR).toBe(false);
    expect(applyToolbarAction('style', layoutStore(false).getState()).clearSelection).toBe(false);
  });

  it('clears the selection when the dismiss-on-style behaviour is turned on', () => {
    // The other branch of the named constant, kept working rather than kept as dead text.
    expect(applyToolbarAction('style', layoutStore(false).getState(), true).clearSelection).toBe(true);
    expect(applyToolbarAction('style', layoutStore(false).getState(), true).tab).toBe('styles');
  });
});

describe('include', () => {
  it('touches neither the panel nor the selection', () => {
    const store = layoutStore(false);

    const effect = applyToolbarAction('include', store.getState());

    expect(effect).toEqual({ tab: null, clearSelection: false, include: true, replaceImage: false, editText: false });
    // Including the element in the next message is not selecting it again, and the toolbar has to
    // survive the send — so nothing about the selection or the panels moves here.
    expect(store.getState().showElements).toBe(false);
  });

  it('does not open the Inspector', () => {
    const store = layoutStore(false);
    applyToolbarAction('include', store.getState());
    expect(store.getState().showElements).toBe(false);
  });
});

describe('the kind-specific slot', () => {
  it('leaves the panels and the selection alone, for either action', () => {
    // Named here rather than left to fall through to the `style` branch below them, which would open
    // the Inspector on a press that has nothing to do with it and would look, from the outside, like
    // Text and Replace being aliases for Style.
    for (const action of ['text', 'replace'] as const) {
      const store = layoutStore(false);

      applyToolbarAction(action, store.getState());

      expect(store.getState().showElements, action).toBe(false);
    }
  });

  it('opens the image picker on Replace, and keeps the selection it is about', () => {
    const store = layoutStore(false);

    const effect = applyToolbarAction('replace', store.getState());

    // The selection must survive: the write the picker performs resolves through *this* element's
    // provenance, and the recompile that follows is what brings the toolbar back to it.
    expect(effect).toEqual({ tab: null, clearSelection: false, include: false, replaceImage: true, editText: false });
  });

  it('opens the text popover on Text, and keeps the selection it is about', () => {
    const effect = applyToolbarAction('text', layoutStore(false).getState());

    // The selection must survive: the popover reads *and* writes through this element's provenance,
    // and the recompile that follows the write is what brings the toolbar back to it. And it must
    // not borrow the image picker, which would offer to swap an `<img>` src on an element with none.
    expect(effect).toEqual({ tab: null, clearSelection: false, include: false, replaceImage: false, editText: true });
  });
});

describe('dismiss', () => {
  it('clears the selection and leaves the panels alone', () => {
    const store = layoutStore(true);

    const effect = applyToolbarAction('dismiss', store.getState());

    expect(effect).toEqual({ tab: null, clearSelection: true, include: false, replaceImage: false, editText: false });
    // Dismissing the toolbar is not closing the Inspector: the panel is the user's, and they did not
    // press its close button.
    expect(store.getState().showElements).toBe(true);
  });
});
