import { describe, it, expect, afterEach } from 'vitest';
import { parseSqliteTimestamp } from '@/lib/sqlite-timestamp';

/**
 * `datetime('now')` writes UTC without a zone marker, and `new Date` reads an unmarked string as
 * local time. Every deadline computed from one of these columns was therefore displaced by the
 * host's offset: a webhook retry waited four hours too long in New York and fired three hours early
 * in Helsinki.
 *
 * The timezone is set per test rather than left to the runner. On a UTC host, which is what CI runs,
 * the naive parse and the correct one agree, so a test that does not move the clock passes just as
 * happily against the bug.
 */

const ORIGINAL_TZ = process.env.TZ;
afterEach(() => { process.env.TZ = ORIGINAL_TZ; });

const NOON_UTC = Date.UTC(2026, 8, 1, 12, 0, 0);

describe('parseSqliteTimestamp', () => {
  it.each(['UTC', 'America/New_York', 'Europe/Helsinki', 'Asia/Tokyo'])(
    'reads a datetime(\'now\') value as UTC in %s',
    (tz) => {
      process.env.TZ = tz;
      expect(parseSqliteTimestamp('2026-09-01 12:00:00')).toBe(NOON_UTC);
    }
  );

  it('leaves a value that already carries a zone alone', () => {
    process.env.TZ = 'America/New_York';
    // What strftime('%Y-%m-%dT%H:%M:%SZ','now') and toISOString() produce.
    expect(parseSqliteTimestamp('2026-09-01T12:00:00Z')).toBe(NOON_UTC);
    expect(parseSqliteTimestamp('2026-09-01T12:00:00.000Z')).toBe(NOON_UTC);
  });

  it('does not mistake a date-only value for the bare shape', () => {
    process.env.TZ = 'UTC';
    expect(parseSqliteTimestamp('2026-09-01')).toBe(Date.UTC(2026, 8, 1));
  });
});
