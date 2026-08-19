/**
 * Gates compilation until the preview's mount is visible. The workspace mounts the preview
 * twice (desktop + mobile); the hidden one is 0x0 and should not compile. Fail-open: only a
 * measured 0x0 box hides the gate; no measurement means the gate stays open.
 */

/** The two options every compile request carries: keep the current page, and show the spinner. */
export interface CompileRequest {
  preserve: boolean;
  showLoading: boolean;
}

/** Fold a new request into one already waiting. OR per field, matching the existing coalescing layers. */
export function mergeCompileRequests(
  pending: CompileRequest | null | undefined,
  next: CompileRequest
): CompileRequest {
  return {
    preserve: (pending?.preserve ?? false) || next.preserve,
    showLoading: (pending?.showLoading ?? false) || next.showLoading,
  };
}

/** A measured box. `ResizeObserver`'s `contentRect` and `getBoundingClientRect()` both satisfy it. */
export interface MeasuredBox {
  width: number;
  height: number;
}

/** Single parked slot; requests merge rather than queue. */
export class PreviewCompileGate {
  /** Assume visible. Only {@link measure} can ever change this, and only on a real measurement. */
  private hidden = false;
  private parked: CompileRequest | null = null;

  /** Visible for tests and assertions; the component reads the return of {@link request} instead. */
  isHidden(): boolean {
    return this.hidden;
  }

  /**
   * The request to compile now, or null when it has been parked because the preview is hidden.
   *
   * The caller must return on null rather than fall through to its own pending-compile queue: that
   * queue drains when the in-flight compile finishes and would run the request anyway.
   */
  request(next: CompileRequest): CompileRequest | null {
    if (!this.hidden) return next;
    this.parked = mergeCompileRequests(this.parked, next);
    return null;
  }

  /** Only a 0x0 box hides the gate; all other inputs (missing, non-finite) leave it unchanged. */
  measure(box: MeasuredBox | null | undefined): CompileRequest | null {
    if (!box) return null;
    if (!Number.isFinite(box.width) || !Number.isFinite(box.height)) return null;

    if (box.width === 0 && box.height === 0) {
      this.hidden = true;
      return null;
    }

    const wasHidden = this.hidden;
    this.hidden = false;
    if (!wasHidden) return null;

    const parked = this.parked;
    this.parked = null;
    return parked;
  }
}

/**
 * Watch a preview's root element and keep `gate` told whether it has a box.
 * Returns null (fail-open) when there is no element or no `ResizeObserver`.
 *
 * Synchronous probe on connect: `ResizeObserver` skips its initial notification for 0x0 elements.
 */
export function observePreviewRoot(
  node: Element | null | undefined,
  gate: PreviewCompileGate,
  runParked: (request: CompileRequest) => void
): ResizeObserver | null {
  if (!node) return null;
  if (typeof ResizeObserver === 'undefined') return null;

  const feed = (box: MeasuredBox | null | undefined): void => {
    const parked = gate.measure(box);
    if (parked) runParked(parked);
  };

  const observer = new ResizeObserver(entries => {
    // Only the last entry matters: they are all measurements of the same element, oldest first.
    const entry = entries[entries.length - 1];
    if (entry) feed(entry.contentRect);
  });
  observer.observe(node);

  feed(typeof node.getBoundingClientRect === 'function' ? node.getBoundingClientRect() : null);

  return observer;
}
