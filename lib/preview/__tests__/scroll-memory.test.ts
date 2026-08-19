import { describe, it, expect } from 'vitest';
import { FrameScrollMemory, readFrameScroll } from '../scroll-memory';

/**
 * Keeping the preview frame's scroll position across the recompile that replaces its document.
 *
 * The whole decision lives here, as a pure object, for the same reason `focusReloadAction` does: the
 * two call sites are inside a React component that owns a live iframe, and neither the `srcdoc` write
 * nor the load event is reachable from jsdom in any way that would prove anything. What is testable is
 * the rule — record on the way out, hand it back only for the same page, once — and that is what this
 * file pins.
 *
 * **Only reachable by hand:** that `loadPage` records before writing `srcdoc` and that `handleLoad`
 * restores before announcing frame-ready. Both are ordering facts about a real browser.
 */

/** An iframe, as far as `readFrameScroll` is concerned. */
function frameAt(scroll: { scrollX?: unknown; scrollY?: unknown } | null): HTMLIFrameElement {
  return { contentWindow: scroll } as unknown as HTMLIFrameElement;
}

describe('readFrameScroll', () => {
  it('reads the position out of the frame', () => {
    expect(readFrameScroll(frameAt({ scrollX: 12, scrollY: 500 }))).toEqual({ x: 12, y: 500 });
  });

  it('answers null, not a zeroed pair, when there is nothing to read', () => {
    // The distinction is load-bearing: `remember` treats null as "clear the slot" and a zeroed pair as
    // "the frame was at the top". Collapsing the two would let an unreadable frame be recorded as a
    // position, and restored over one the caller already had.
    expect(readFrameScroll(null)).toBeNull();
    expect(readFrameScroll(frameAt(null))).toBeNull();
    expect(readFrameScroll(frameAt({ scrollX: 0, scrollY: 0 }))).toEqual({ x: 0, y: 0 });
  });

  it('treats a missing or non-numeric offset as zero on that axis', () => {
    expect(readFrameScroll(frameAt({ scrollY: 300 }))).toEqual({ x: 0, y: 300 });
    expect(readFrameScroll(frameAt({ scrollX: 'left', scrollY: 300 }))).toEqual({ x: 0, y: 300 });
  });

  it('answers null rather than NaN for a non-finite offset', () => {
    expect(readFrameScroll(frameAt({ scrollX: 0, scrollY: NaN }))).toBeNull();
    expect(readFrameScroll(frameAt({ scrollX: 0, scrollY: Infinity }))).toBeNull();
  });

  it('survives a frame that has navigated away', () => {
    // A cross-origin `contentWindow` read throws a SecurityError. This runs immediately before a
    // `srcdoc` write, so a throw here would take the reload with it.
    const escaped = {
      get contentWindow(): Window | null {
        throw new Error('SecurityError: cross-origin');
      },
    } as unknown as HTMLIFrameElement;

    expect(readFrameScroll(escaped)).toBeNull();
  });
});

describe('FrameScrollMemory', () => {
  it('hands a recorded position back for the same page', () => {
    const memory = new FrameScrollMemory();

    memory.remember('/index.html', { x: 0, y: 500 });

    expect(memory.take('/index.html')).toEqual({ x: 0, y: 500 });
  });

  it('refuses a position recorded on a different page', () => {
    const memory = new FrameScrollMemory();

    memory.remember('/index.html', { x: 0, y: 500 });

    // The point of keying it. `loadPage` records the *outgoing* path, so a navigation records where
    // the user was on the page they left — restoring that onto the page they went to would open the
    // new page halfway down for no reason the user could name.
    expect(memory.take('/about.html')).toBeNull();
  });

  it('drops a mismatched record instead of keeping it for later', () => {
    const memory = new FrameScrollMemory();
    memory.remember('/index.html', { x: 0, y: 500 });

    memory.take('/about.html');

    // The record belongs to a page that has now been navigated away from. Keeping it would restore it
    // on some later return to that page, from a session the user has long finished.
    expect(memory.take('/index.html')).toBeNull();
  });

  it('is one-shot even for a matching page', () => {
    const memory = new FrameScrollMemory();
    memory.remember('/index.html', { x: 0, y: 500 });

    expect(memory.take('/index.html')).toEqual({ x: 0, y: 500 });
    // A second load of the same page with no `remember` in between is not evidence the user is still
    // where they were — every real reload records first.
    expect(memory.take('/index.html')).toBeNull();
  });

  it('records nothing for a document that was already at the top', () => {
    const memory = new FrameScrollMemory();

    memory.remember('/index.html', { x: 0, y: 0 });

    // Nothing to put back: a fresh document is already there. Holding it would mean sending a message
    // that cannot change anything.
    expect(memory.take('/index.html')).toBeNull();
  });

  it('clears the slot when there is nothing to record', () => {
    const memory = new FrameScrollMemory();
    memory.remember('/index.html', { x: 0, y: 500 });

    memory.remember('/index.html', null);

    // An unreadable frame must not leave the previous load's record in the slot, or it is restored
    // onto the document *after* the one it was taken from.
    expect(memory.take('/index.html')).toBeNull();
  });

  it('clears the slot when there is no page to key on', () => {
    const memory = new FrameScrollMemory();
    memory.remember('/index.html', { x: 0, y: 500 });

    memory.remember(null, { x: 0, y: 400 });

    expect(memory.take('/index.html')).toBeNull();
  });

  it('overwrites on every record, so only the latest load is held', () => {
    const memory = new FrameScrollMemory();

    memory.remember('/index.html', { x: 0, y: 500 });
    memory.remember('/about.html', { x: 0, y: 120 });

    expect(memory.take('/index.html')).toBeNull();
    expect(memory.take('/about.html')).toBeNull();
  });

  it('rounds and floors what it is given', () => {
    const memory = new FrameScrollMemory();

    memory.remember('/index.html', { x: -4, y: 499.6 });

    // Sub-pixel offsets are real (a zoomed frame reports them) and a negative one is what an
    // overscroll bounce reports on macOS. Neither is a position worth restoring literally.
    expect(memory.take('/index.html')).toEqual({ x: 0, y: 500 });
  });
});
