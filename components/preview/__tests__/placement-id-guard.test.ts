import { describe, it, expect } from 'vitest';
import { generatePlacementScript } from '../multipage-preview';

/**
 * The `placement-remove` guard, asserted on the *emitted* script rather than the source.
 *
 * The placement script is a template literal, so a singly-escaped `\d` collapses to a literal `d`
 * before the script is ever emitted. That shipped: the guard read `/^sb-d+-[a-z0-9]+$/`, which
 * rejects every id the script itself mints, so removing a placed semantic block silently did
 * nothing. Source-level assertions cannot catch this — only the emitted text can.
 */

/** Exactly how the placement script mints an id. */
const mintId = () => 'sb-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);

function emittedGuard(): RegExp {
  const literal = generatePlacementScript().match(/\/\^sb-[^/]*\//);
  if (!literal) throw new Error('placement-id guard not found in the emitted script');
  return new RegExp(literal[0].slice(1, -1));
}

describe('the emitted placement-id guard', () => {
  it('keeps its backslash, so it matches a digit and not a literal "d"', () => {
    expect(emittedGuard().source).toBe('^sb-\\d+-[a-z0-9]+$');
  });

  it('accepts an id minted the way the script mints them', () => {
    const guard = emittedGuard();
    for (let i = 0; i < 25; i++) {
      const id = mintId();
      expect(guard.test(id), `rejected a real id: ${id}`).toBe(true);
    }
  });

  it('still rejects anything that could break out of the attribute selector', () => {
    // The guard exists because pid is concatenated into
    // `[data-placement-id="' + pid + '"]`. A crafted value can otherwise produce a *valid*
    // selector matching an unintended element, or an invalid one that throws.
    const guard = emittedGuard();
    for (const hostile of [
      '" ], [data-osw-src="/index.hbs:24',
      'sb-1-a"]',
      'sb-1-a]',
      "sb-1-a'",
      'sb-1-a b',
      '../../etc',
      '',
    ]) {
      expect(guard.test(hostile), `accepted hostile input: ${JSON.stringify(hostile)}`).toBe(false);
    }
  });
});
