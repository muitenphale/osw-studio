import { describe, it, expect } from 'vitest';
import { PreviewCompileGate, mergeCompileRequests } from '../compile-gate';

/**
 * The rule that stops the hidden duplicate preview from compiling the whole project for a 0x0 frame.
 *
 * The decision lives in its own object for the same reason `FrameScrollMemory` and `focusReloadAction`
 * do: its call sites are inside a React component that needs a VFS and a real compile, and nothing in
 * this repo renders `MultipagePreview`. What is testable is the rule, and the first thing it has to get
 * right is the direction that cannot be allowed to fail — a preview nobody has measured, or one that
 * has been measured and has a box, must compile. Getting that wrong is a permanently blank preview,
 * so it is the first test in the file.
 *
 * **Only reachable by hand:** that the gate is consulted at the top of `compileAndLoad` rather than
 * after its in-flight check, that the callback ref is on all three of the component's root branches,
 * and that a real browser's `ResizeObserver` reports 0x0 for a `display: none` subtree.
 */

const FRESH = { preserve: false, showLoading: false };

describe('mergeCompileRequests', () => {
  it('ORs each flag, so a merged request satisfies both callers', () => {
    expect(mergeCompileRequests({ preserve: true, showLoading: false }, { preserve: false, showLoading: true }))
      .toEqual({ preserve: true, showLoading: true });
    expect(mergeCompileRequests({ preserve: false, showLoading: false }, FRESH)).toEqual(FRESH);
  });

  it('treats an absent pending request as contributing nothing', () => {
    // Not as contributing true: the request that replaces it must not inherit flags from a slot that
    // was empty. This is the semantics the preview's two other coalescing layers already had.
    expect(mergeCompileRequests(null, FRESH)).toEqual(FRESH);
    expect(mergeCompileRequests(undefined, { preserve: true, showLoading: false }))
      .toEqual({ preserve: true, showLoading: false });
  });
});

describe('PreviewCompileGate, before anything has been measured', () => {
  it('lets a compile through — the case that must never break', () => {
    // No measurement has been taken, which is exactly the state of every preview in every test in
    // this repo (jsdom has no ResizeObserver) and of any browser that lacks one. If this returns null
    // the preview never compiles and is blank forever.
    const gate = new PreviewCompileGate();
    expect(gate.isHidden()).toBe(false);
    expect(gate.request({ preserve: true, showLoading: false })).toEqual({ preserve: true, showLoading: false });
  });

  it('keeps letting compiles through, however many arrive', () => {
    const gate = new PreviewCompileGate();
    for (let i = 0; i < 5; i++) {
      expect(gate.request(FRESH)).not.toBeNull();
    }
    expect(gate.isHidden()).toBe(false);
  });
});

describe('PreviewCompileGate, measured', () => {
  it('parks the request once the box has been measured at 0x0', () => {
    const gate = new PreviewCompileGate();
    expect(gate.measure({ width: 0, height: 0 })).toBeNull();
    expect(gate.isHidden()).toBe(true);
    expect(gate.request({ preserve: true, showLoading: true })).toBeNull();
  });

  it('still compiles for a box with either dimension, since only 0x0 is hidden', () => {
    // A zero-width element mid-transition is not a hidden one, and a preview that stopped compiling
    // for one would be a preview that stopped compiling.
    const gate = new PreviewCompileGate();
    expect(gate.measure({ width: 0, height: 652 })).toBeNull();
    expect(gate.isHidden()).toBe(false);
    expect(gate.measure({ width: 496, height: 0 })).toBeNull();
    expect(gate.isHidden()).toBe(false);
    expect(gate.request(FRESH)).not.toBeNull();
  });

  it('hands the parked request back when the box appears', () => {
    const gate = new PreviewCompileGate();
    gate.measure({ width: 0, height: 0 });
    gate.request({ preserve: true, showLoading: false });

    expect(gate.measure({ width: 496, height: 652 })).toEqual({ preserve: true, showLoading: false });
    expect(gate.isHidden()).toBe(false);
  });

  it('merges everything parked into the one compile that runs on the flip', () => {
    // The whole point of parking: a session's worth of skipped recompiles collapses into one compile,
    // not a replay. The flags still OR, so the merged request keeps the page the way a repeated
    // request through the in-flight queue would.
    const gate = new PreviewCompileGate();
    gate.measure({ width: 0, height: 0 });
    gate.request({ preserve: false, showLoading: true });
    gate.request({ preserve: true, showLoading: false });
    gate.request(FRESH);

    expect(gate.measure({ width: 496, height: 652 })).toEqual({ preserve: true, showLoading: true });
  });

  it('consumes the parked request, so it runs once', () => {
    const gate = new PreviewCompileGate();
    gate.measure({ width: 0, height: 0 });
    gate.request({ preserve: true, showLoading: true });
    gate.measure({ width: 496, height: 652 });

    gate.measure({ width: 0, height: 0 });
    expect(gate.measure({ width: 496, height: 652 })).toBeNull();
  });

  it('returns nothing on a flip with nothing parked', () => {
    const gate = new PreviewCompileGate();
    gate.measure({ width: 0, height: 0 });
    expect(gate.measure({ width: 496, height: 652 })).toBeNull();
  });

  it('returns nothing for a resize that was visible all along', () => {
    const gate = new PreviewCompileGate();
    gate.measure({ width: 496, height: 652 });
    expect(gate.measure({ width: 800, height: 652 })).toBeNull();
  });

  it('stays hidden, and silent, across repeated 0x0 observations', () => {
    const gate = new PreviewCompileGate();
    gate.measure({ width: 0, height: 0 });
    gate.request(FRESH);
    expect(gate.measure({ width: 0, height: 0 })).toBeNull();
    expect(gate.isHidden()).toBe(true);
  });
});

describe('PreviewCompileGate, given no information', () => {
  it('leaves a never-measured gate open', () => {
    // A missing or unreadable box is not evidence of hiding. Treating it as such is the mistake that
    // would stop every preview in this repo's test environment from compiling.
    const gate = new PreviewCompileGate();
    gate.measure(null);
    gate.measure(undefined);
    gate.measure({ width: NaN, height: NaN });
    gate.measure({ width: Infinity, height: 0 });
    expect(gate.isHidden()).toBe(false);
    expect(gate.request(FRESH)).not.toBeNull();
  });

  it('leaves a hidden gate hidden, and hands nothing back', () => {
    const gate = new PreviewCompileGate();
    gate.measure({ width: 0, height: 0 });
    gate.request(FRESH);
    expect(gate.measure(null)).toBeNull();
    expect(gate.measure({ width: NaN, height: NaN })).toBeNull();
    expect(gate.isHidden()).toBe(true);
  });
});
