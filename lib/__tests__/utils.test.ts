import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { formatDistanceToNow } from 'date-fns';
import { formatCompactAge } from '../utils';

/**
 * formatCompactAge exists to strip the vague qualifier date-fns prepends ("about", "over",
 * "almost", "less than") so table cells read "2 hours" not "about 2 hours". Fake timers pin
 * "now" so the distances are deterministic; each case includes a positive control proving
 * date-fns actually emits the qualifier being stripped.
 */
describe('formatCompactAge', () => {
  const NOW = new Date('2026-06-15T12:00:00Z');
  const MIN = 60_000;
  const H = 60 * MIN;
  const D = 24 * H;
  const ago = (ms: number) => new Date(NOW.getTime() - ms);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('strips the "about" qualifier from an hours-old date', () => {
    const d = ago(2 * H);
    expect(formatDistanceToNow(d, { addSuffix: false })).toMatch(/^about /); // control
    expect(formatCompactAge(d)).toBe('2 hours');
  });

  it('strips "less than" from a sub-minute date', () => {
    const d = ago(10_000);
    expect(formatDistanceToNow(d, { addSuffix: false })).toMatch(/^less than /); // control
    expect(formatCompactAge(d)).toBe('a minute');
  });

  it('leaves an already-unqualified distance untouched', () => {
    const d = ago(3 * D);
    expect(formatDistanceToNow(d, { addSuffix: false })).toBe('3 days'); // no qualifier to strip
    expect(formatCompactAge(d)).toBe('3 days');
  });

  it('never returns a leading qualifier across a range of ages', () => {
    for (const ms of [10_000, 5 * MIN, 2 * H, 3 * D, 40 * D, 400 * D]) {
      expect(formatCompactAge(ago(ms))).not.toMatch(/^(about|over|almost|less than)\b/);
    }
  });

  it('accepts a numeric timestamp', () => {
    expect(formatCompactAge(ago(3 * D).getTime())).toBe('3 days');
  });
});
