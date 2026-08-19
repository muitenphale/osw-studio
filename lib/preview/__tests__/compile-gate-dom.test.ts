// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PreviewCompileGate, observePreviewRoot, type CompileRequest } from '../compile-gate';

/**
 * Wiring the compile gate to an element's box.
 *
 * **jsdom has no `ResizeObserver` and no layout.** Both facts are load-bearing here, in opposite
 * directions, so the stub is what decides whether anything below proves anything:
 *
 * - Where the stub is *absent*, `observePreviewRoot` must do nothing at all. That is the fail-open
 *   path and it is the environment every other test in this repo runs in.
 * - Where the stub is *present*, it stands in for a real browser, and jsdom's own zero-size elements
 *   then stand in for a `display: none` subtree. The stub records the callback it was constructed with
 *   and the element it was asked to observe; a test drives that callback by hand with the box it wants
 *   reported, because nothing in jsdom will ever produce a resize on its own.
 *
 * The stub is installed per test rather than in `beforeAll`, since half of these tests are about what
 * happens when it does not exist.
 */

/** The callbacks and targets the stubbed observer was handed, newest last. */
let observers: Array<{ callback: ResizeObserverCallback; observed: Element[]; disconnected: boolean }> = [];

function installResizeObserver(): void {
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    writable: true,
    value: class {
      private record: { callback: ResizeObserverCallback; observed: Element[]; disconnected: boolean };
      constructor(callback: ResizeObserverCallback) {
        this.record = { callback, observed: [], disconnected: false };
        observers.push(this.record);
      }
      observe(target: Element): void { this.record.observed.push(target); }
      unobserve(): void {}
      disconnect(): void { this.record.disconnected = true; }
    },
  });
}

function removeResizeObserver(): void {
  Reflect.deleteProperty(globalThis, 'ResizeObserver');
}

/** Report a box through the stubbed observer, the way a real one reports a resize. */
function reportBox(box: { width: number; height: number }): void {
  const observer = observers[observers.length - 1];
  observer.callback(
    [{ contentRect: box as DOMRectReadOnly, target: observer.observed[0] } as ResizeObserverEntry],
    {} as ResizeObserver
  );
}

/** An element whose box is whatever the test says it is — jsdom's own is always zero. */
function rootSized(box: { width: number; height: number } | null): HTMLDivElement {
  const node = document.createElement('div');
  document.body.appendChild(node);
  if (box) {
    node.getBoundingClientRect = () => ({ ...box, top: 0, left: 0, right: box.width, bottom: box.height, x: 0, y: 0, toJSON: () => ({}) });
  }
  return node;
}

let ran: CompileRequest[] = [];

beforeEach(() => {
  observers = [];
  ran = [];
  document.body.innerHTML = '';
});

afterEach(() => {
  removeResizeObserver();
});

describe('observePreviewRoot, where there is no ResizeObserver', () => {
  it('observes nothing and never measures the gate', () => {
    // The fail-open guarantee, stated as a test: in this environment — which is every test in this
    // repo, and any browser without a ResizeObserver — the gate is never touched, so it stays open and
    // the preview compiles exactly as it did before the gate existed. Note the element measures 0x0
    // here: jsdom has no layout, so *every* element does. That is precisely why the measurement is
    // only ever taken behind this check.
    const gate = new PreviewCompileGate();
    const node = rootSized(null);
    expect(node.getBoundingClientRect().width).toBe(0);

    expect(observePreviewRoot(node, gate, r => ran.push(r))).toBeNull();
    expect(gate.isHidden()).toBe(false);
    expect(gate.request({ preserve: false, showLoading: true })).not.toBeNull();
  });
});

describe('observePreviewRoot, in a browser', () => {
  beforeEach(() => {
    installResizeObserver();
  });

  it('watches the element it was given', () => {
    const node = rootSized({ width: 496, height: 652 });
    const observer = observePreviewRoot(node, new PreviewCompileGate(), r => ran.push(r));

    expect(observer).not.toBeNull();
    expect(observers).toHaveLength(1);
    expect(observers[0].observed).toEqual([node]);
  });

  it('closes the gate from the synchronous probe alone', () => {
    // ResizeObserver skips its initial notification for an element that is not rendered, so the hidden
    // mobile preview — display: none from its first paint, never resized after — is reported by
    // nothing but this probe. Without it the gate would never close and the fix would do nothing.
    const gate = new PreviewCompileGate();
    observePreviewRoot(rootSized({ width: 0, height: 0 }), gate, r => ran.push(r));

    expect(gate.isHidden()).toBe(true);
    expect(ran).toEqual([]);
  });

  it('leaves the gate open when the probe finds a box', () => {
    const gate = new PreviewCompileGate();
    observePreviewRoot(rootSized({ width: 496, height: 652 }), gate, r => ran.push(r));

    expect(gate.isHidden()).toBe(false);
    expect(ran).toEqual([]);
  });

  it('runs the parked compile when the element gains a box', () => {
    // The user narrows the window past the md breakpoint: the preview that has been skipping compiles
    // has nothing compiled to show, and this is the only thing that fills it.
    const gate = new PreviewCompileGate();
    observePreviewRoot(rootSized({ width: 0, height: 0 }), gate, r => ran.push(r));
    gate.request({ preserve: true, showLoading: false });

    reportBox({ width: 496, height: 652 });

    expect(ran).toEqual([{ preserve: true, showLoading: false }]);
    expect(gate.isHidden()).toBe(false);
  });

  it('runs nothing when the observer reports another zero box', () => {
    const gate = new PreviewCompileGate();
    observePreviewRoot(rootSized({ width: 496, height: 652 }), gate, r => ran.push(r));
    gate.request({ preserve: true, showLoading: false });

    reportBox({ width: 0, height: 0 });

    expect(ran).toEqual([]);
    expect(gate.isHidden()).toBe(true);
  });

  it('reads the last entry of a batched observation', () => {
    const gate = new PreviewCompileGate();
    observePreviewRoot(rootSized({ width: 0, height: 0 }), gate, r => ran.push(r));
    gate.request({ preserve: false, showLoading: true });

    observers[0].callback(
      [
        { contentRect: { width: 0, height: 0 } as DOMRectReadOnly } as ResizeObserverEntry,
        { contentRect: { width: 496, height: 652 } as DOMRectReadOnly } as ResizeObserverEntry,
      ],
      {} as ResizeObserver
    );

    expect(ran).toEqual([{ preserve: false, showLoading: true }]);
  });

  it('survives an empty observation batch', () => {
    const gate = new PreviewCompileGate();
    observePreviewRoot(rootSized({ width: 496, height: 652 }), gate, r => ran.push(r));

    expect(() => observers[0].callback([], {} as ResizeObserver)).not.toThrow();
    expect(gate.isHidden()).toBe(false);
  });

  it('observes nothing for a detached root', () => {
    // The component's callback ref is called with null when its root is swapped between the loading,
    // error and preview branches, and on unmount.
    const gate = new PreviewCompileGate();
    expect(observePreviewRoot(null, gate, r => ran.push(r))).toBeNull();
    expect(observers).toHaveLength(0);
    expect(gate.isHidden()).toBe(false);
  });

  it('hands back an observer the caller can disconnect', () => {
    const observer = observePreviewRoot(rootSized({ width: 496, height: 652 }), new PreviewCompileGate(), r => ran.push(r));
    observer!.disconnect();
    expect(observers[0].disconnected).toBe(true);
  });
});
