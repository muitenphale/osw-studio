import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Where the compile gate sits inside `MultipagePreview`, asserted on the component's source.
 *
 * The rule itself is tested as an object in `lib/preview/__tests__/compile-gate*.test.ts`. Two facts
 * about its *placement* are not reachable from there and not reachable by rendering either — nothing
 * in this repo renders `MultipagePreview`, which needs a VFS and a real compile — yet both are the
 * kind of thing a later edit silently undoes:
 *
 *  1. The gate is consulted **before** the in-flight check. A parked request must not fall through
 *     into `pendingCompileOptionsRef`, because that queue drains into a compile as soon as the
 *     current one finishes, which would run exactly the compile the gate declined.
 *  2. Every root the component can render carries the callback ref. It returns from three places
 *     (loading, error, preview) and the observer only ever watches the one that is mounted, so a
 *     fourth branch added without the ref is a preview whose box is never measured.
 *
 * Source assertions, following the precedent in `lib/direct-edit/__tests__/apply-style.test.ts`:
 * lifted out of the file rather than imported, with guards that fail if the anchors stop existing.
 */

const SOURCE = readFileSync(resolve(process.cwd(), 'components/preview/multipage-preview.tsx'), 'utf8');

/** The text of an arrow function assigned to `name`, brace-matched from its body. */
function bodyOf(name: string): string {
  const start = SOURCE.indexOf(`const ${name} = useCallback(`);
  expect(start, `no ${name} in multipage-preview.tsx`).toBeGreaterThan(-1);
  const bodyStart = SOURCE.indexOf('{', start);
  let depth = 0;
  for (let i = bodyStart; i < SOURCE.length; i++) {
    if (SOURCE[i] === '{') depth++;
    else if (SOURCE[i] === '}' && --depth === 0) return SOURCE.slice(bodyStart, i + 1);
  }
  throw new Error(`unbalanced braces around ${name}`);
}

function count(needle: string): number {
  let n = 0;
  for (let i = SOURCE.indexOf(needle); i !== -1; i = SOURCE.indexOf(needle, i + 1)) n++;
  return n;
}

describe('the gate is consulted before the in-flight queue', () => {
  it('asks the gate, and returns, ahead of the compilingRef check', () => {
    const body = bodyOf('compileAndLoad');

    const gate = body.indexOf('gate.request(');
    const parked = body.indexOf('if (!requested) return;');
    const inFlight = body.indexOf('if (compilingRef.current) {');

    expect(body, 'the gate is no longer taken from compileGateRef').toContain('compileGateRef.current!');
    expect(gate, 'compileAndLoad no longer consults the gate').toBeGreaterThan(-1);
    expect(parked, 'compileAndLoad no longer returns on a parked request').toBeGreaterThan(-1);
    expect(inFlight, 'compileAndLoad no longer has an in-flight check').toBeGreaterThan(-1);

    expect(gate).toBeLessThan(inFlight);
    expect(parked).toBeLessThan(inFlight);
  });

  it('re-measures before parking a request again', () => {
    // The safety net for the one reveal the observer can miss. A ResizeObserver's callbacks ride the
    // rendering steps, so a tab that is not rendering receives none; and a CSS-only reveal (crossing
    // the `md` breakpoint) re-renders no React, so nothing re-attaches the callback ref either. Left
    // to the observer alone, a preview revealed in that state sits on "Compiling project..." with
    // nothing on the way to replace it.
    const body = bodyOf('compileAndLoad');

    const probe = body.indexOf('gate.measure(');
    const request = body.indexOf('gate.request(');

    expect(body, 'the re-probe no longer guards on the gate being closed').toContain('gate.isHidden()');
    expect(probe, 'compileAndLoad no longer re-measures the root').toBeGreaterThan(-1);
    // Before the request, or it parks first and the measurement is a turn too late.
    expect(probe).toBeLessThan(request);
    expect(body, 'the re-probe no longer reads the root element').toContain('rootElementRef.current');
  });
});

describe('every root the component renders is measured', () => {
  it('carries the callback ref on each of its root elements', () => {
    // The roots are identified by the class list all three share. Guard first that there are still
    // three of them, so the equality below cannot be satisfied by there being none.
    const roots = count('className="h-full flex flex-col"');
    expect(roots).toBe(3);
    expect(count('ref={attachRoot} className="h-full flex flex-col"')).toBe(roots);
  });
});
