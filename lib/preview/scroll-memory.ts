/**
 * Remembers the preview frame's scroll position across `srcdoc` reassignments.
 * Read once from the outgoing document (same-origin, no scroll listener), keyed on `activePath`
 * so a genuine page navigation opens at the top.
 */

export interface FrameScroll {
  x: number;
  y: number;
}

/**
 * Read the live scroll position out of a preview iframe.
 *
 * Returns null rather than a zeroed pair for every failure, so "the frame was at the top" and "the
 * frame could not be read" stay distinguishable — a zero would be remembered as a position and
 * restored over one the caller already had.
 *
 * The `try` is for the escape case: the frame may have navigated to an external site, and reading
 * `contentWindow` then throws a cross-origin `SecurityError`. That is a document nobody wants a scroll
 * position for anyway.
 */
export function readFrameScroll(frame: HTMLIFrameElement | null): FrameScroll | null {
  if (!frame) return null;
  try {
    const win = frame.contentWindow;
    if (!win) return null;
    const x = typeof win.scrollX === 'number' ? win.scrollX : 0;
    const y = typeof win.scrollY === 'number' ? win.scrollY : 0;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
  } catch {
    return null;
  }
}

/** Single slot, not a map: only the outgoing page's position is meaningful. */
export class FrameScrollMemory {
  private held: { path: string; x: number; y: number } | null = null;

  /**
   * Record where the outgoing document was scrolled to, on the way to replacing it.
   *
   * A missing path or an unreadable frame clears the slot instead of leaving the previous record in
   * it: a record that survives the load it was taken for would be restored onto the *next* one.
   *
   * Zero is not recorded; a fresh document is already at the top.
   */
  remember(path: string | null | undefined, scroll: FrameScroll | null): void {
    if (!path || !scroll) {
      this.held = null;
      return;
    }
    const x = Math.max(0, Math.round(scroll.x));
    const y = Math.max(0, Math.round(scroll.y));
    if (x === 0 && y === 0) {
      this.held = null;
      return;
    }
    this.held = { path, x, y };
  }

  /** The position to restore, or null. One-shot: consumed whether or not the path matched. */
  take(path: string | null | undefined): FrameScroll | null {
    const held = this.held;
    this.held = null;
    if (!held || !path || held.path !== path) return null;
    return { x: held.x, y: held.y };
  }
}
