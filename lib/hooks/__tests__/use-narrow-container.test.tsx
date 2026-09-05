// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { useNarrowContainer } from '@/lib/hooks/use-narrow-container';

/**
 * The listing tables all return a spinner before the table exists, so the measured element is absent
 * on first render and appears later. An effect keyed on a RefObject never re-runs to catch that, so
 * the observer was never attached and the hook reported `false` for ever: the CSS half of the
 * collapse worked and the menu items that replace the hidden buttons never appeared.
 */

let observed: Element[] = [];

/**
 * jsdom performs no layout, so clientWidth is 0 for every element. Without this the wide case reads
 * as narrow and both tests pass whatever the hook does.
 */
function stubWidth(width: number) {
  Object.defineProperty(HTMLDivElement.prototype, 'clientWidth', {
    configurable: true,
    get() { return width; },
  });
}

beforeEach(() => {
  observed = [];
  vi.stubGlobal('ResizeObserver', class {
    observe(el: Element) { observed.push(el); }
    disconnect() {}
  });
});

/** Mirrors the listings: nothing to measure until `ready` flips. */
function Listing({ width, onNarrow }: { width: number; onNarrow: (v: boolean) => void }) {
  const [ready, setReady] = useState(false);
  const [narrow, measureRef] = useNarrowContainer(768);

  onNarrow(narrow);

  if (!ready) {
    return <button onClick={() => setReady(true)}>load</button>;
  }
  return <div ref={measureRef} style={{ width }} />;
}

function render(width: number) {
  stubWidth(width);
  const host = document.createElement('div');
  document.body.appendChild(host);
  const seen: boolean[] = [];
  const root = createRoot(host);
  act(() => { root.render(<Listing width={width} onNarrow={(v) => seen.push(v)} />); });
  return { host, seen };
}

describe('useNarrowContainer', () => {
  it('is 0-width in jsdom unless stubbed, so the stub itself is the control', () => {
    stubWidth(1234);
    expect(document.createElement('div').clientWidth).toBe(1234);
  });

  it('measures an element that only appears after the first render', () => {
    const { host, seen } = render(400);
    expect(observed).toHaveLength(0);

    // The table arrives.
    act(() => { host.querySelector('button')!.click(); });

    expect(observed).toHaveLength(1);
    expect(seen[seen.length - 1]).toBe(true);
  });

  it('reports false for a container wider than the breakpoint', () => {
    const { host, seen } = render(1200);
    act(() => { host.querySelector('button')!.click(); });

    expect(observed).toHaveLength(1);
    expect(seen[seen.length - 1]).toBe(false);
  });
});
