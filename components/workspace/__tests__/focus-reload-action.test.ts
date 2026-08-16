import { describe, it, expect } from 'vitest';
import { focusReloadAction } from '../index';
import type { FocusContextPayload } from '@/lib/preview/types';

/**
 * What happens to the focus context when the preview frame announces a fresh document.
 *
 * This is the whole decision, not a helper the caller then reasons on top of: `handleFrameReady`
 * dispatches on the three answers and adds nothing. It is separated out because the callback itself
 * reaches the Zustand store and is only reachable through React — testing it in place would mean
 * either React Testing Library or a mocked store, and the second asserts on the mock.
 *
 * The navigation case is the one with teeth. `onFrameReady` fires on **every** load, in-preview
 * navigation included, and `domPath` carries no page identity, so without the comparison a
 * selection made on one page rebinds to whatever element the same path hits on the next — and that
 * element's `outerHTML` is what the agent is handed with the following message.
 */

function payload(over: Partial<FocusContextPayload> = {}): FocusContextPayload {
  return {
    domPath: 'html > body > main > p',
    tagName: 'p',
    nodeId: '3',
    attributes: {},
    outerHTML: '<p>a</p>',
    ...over,
  };
}

describe('focusReloadAction', () => {
  it('re-resolves when the frame reloaded the page the selection was made on', () => {
    expect(focusReloadAction(payload(), '/about', '/about'))
      .toEqual({ kind: 'resolve', domPath: 'html > body > main > p' });
  });

  it('clears when the preview has navigated somewhere else', () => {
    // Not "resolve anyway": the same path resolves perfectly well on the new page, to the wrong
    // element, and nothing downstream would ever notice.
    expect(focusReloadAction(payload(), '/', '/about')).toEqual({ kind: 'clear' });
  });

  it('treats the root path like any other, not as a wildcard', () => {
    expect(focusReloadAction(payload(), '/about', '/')).toEqual({ kind: 'clear' });
  });

  it('does nothing when there is no selection to re-resolve', () => {
    // Distinct from 'clear'. Clearing on every recompile with nothing selected would still push a
    // store write, and the focus chip re-renders off that state.
    expect(focusReloadAction(null, '/', '/')).toEqual({ kind: 'none' });
    expect(focusReloadAction(null, '/', '/about')).toEqual({ kind: 'none' });
  });

  it('does nothing for a selection with no path to resolve by', () => {
    expect(focusReloadAction(payload({ domPath: '' }), '/', '/')).toEqual({ kind: 'none' });
  });

  it('re-resolves when the selection predates path recording', () => {
    // An unrecorded path is an unknown, not evidence of a navigation — and the re-resolve is still
    // safe, because a path that matches nothing comes back null and clears anyway.
    expect(focusReloadAction(payload(), null, '/about'))
      .toEqual({ kind: 'resolve', domPath: 'html > body > main > p' });
  });
});
