'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Whether a measured element is narrower than `breakpointPx`.
 *
 * For layout a container query cannot reach. Radix portals a dropdown's content to document.body, so
 * `@container` variants on menu items resolve against nothing and never match; anything that has to
 * collapse *into* a menu needs the width as a value rather than as a selector.
 *
 * Returns a callback ref rather than taking a RefObject, and that is the whole point of the shape.
 * Every listing here returns a spinner before its table exists, so a `RefObject` is still null when
 * an effect first runs, and an effect keyed on the ref object never re-runs to catch the element
 * arriving. A callback ref fires on mount, which is the only signal React gives that the node is
 * there. Compose it where the element already carries a ref:
 *
 *   ref={(el) => { existingRef.current = el; measureRef(el); }}
 *
 * Prefer a container query for anything that stays inside the container. This costs a render on
 * resize and reports `false` until the first measurement.
 */
export function useNarrowContainer(breakpointPx: number): [boolean, (node: HTMLElement | null) => void] {
  const [narrow, setNarrow] = useState(false);
  const [node, setNode] = useState<HTMLElement | null>(null);

  const measureRef = useCallback((el: HTMLElement | null) => setNode(el), []);

  useEffect(() => {
    if (!node) return;

    const measure = () => setNarrow(node.clientWidth < breakpointPx);
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [node, breakpointPx]);

  return [narrow, measureRef];
}
