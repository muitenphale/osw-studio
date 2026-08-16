import type { PreviewSelection, SourceResolution } from './types';

/**
 * Turn a preview selection into a source location.
 *
 * Pure. Never guesses: an element built by JS carries no `data-osw-src`, and a guessed location
 * gets a marker stamped into the wrong file with nothing downstream able to notice.
 *
 * **Splits on the LAST colon.** A project may legitimately contain a file named `/index.html:67`,
 * so `split(':')` and `indexOf(':')` both produce a wrong path and a wrong index on real input.
 * The index must then be all digits — parsing `'abc'` with `parseInt` yields `NaN`, which flows on
 * as a silently wrong offset rather than an error.
 */
export function resolveSelection(selection: PreviewSelection): SourceResolution {
  const srcAttr = selection.srcAttr;

  // No attribute at all is the ordinary case for a JS-generated element, not a failure.
  if (srcAttr === undefined || srcAttr === null) {
    return { kind: 'unresolvable', reason: 'generated' };
  }

  const colon = srcAttr.lastIndexOf(':');
  // `colon === 0` is `':5'` — an empty path, which is as unusable as no colon at all.
  if (colon <= 0) return { kind: 'unresolvable', reason: 'malformed' };

  const file = srcAttr.slice(0, colon);
  const rawIndex = srcAttr.slice(colon + 1);
  if (!/^\d+$/.test(rawIndex)) return { kind: 'unresolvable', reason: 'malformed' };

  const tagStart = Number(rawIndex);
  if (!Number.isSafeInteger(tagStart)) return { kind: 'unresolvable', reason: 'malformed' };

  const instances = selection.instanceCount ?? 1;
  if (instances > 1) return { kind: 'one-to-many', file, tagStart, instances };

  return { kind: 'resolved', file, tagStart };
}
