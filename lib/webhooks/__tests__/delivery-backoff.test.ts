import { describe, it, expect, afterEach, vi } from 'vitest';
import { shouldDeliver } from '@/lib/webhooks/delivery';
import type { WebhookEvent } from '@/lib/webhooks/types';

/**
 * `last_attempted_at` is written by SQLite's `datetime('now')`, which is UTC with a space and no
 * zone marker. Reading it with `new Date` treats it as local time, so every retry was displaced by
 * the host's offset: hours late west of UTC, already expired east of it.
 *
 * The timezone is set per case rather than left to the runner. On a UTC host the naive parse and
 * the correct one agree, so a test that does not move the clock passes against the bug, which is
 * why this survived CI.
 */

const ORIGINAL_TZ = process.env.TZ;
afterEach(() => {
  process.env.TZ = ORIGINAL_TZ;
  vi.useRealTimers();
});

function event(over: Partial<WebhookEvent> = {}): WebhookEvent {
  return {
    id: 1,
    event_type: 'user.created',
    payload: '{}',
    created_at: '2026-09-01 12:00:00',
    delivered: false,
    delivered_at: null,
    attempts: 1,
    last_attempted_at: '2026-09-01 12:00:00',
    ...over,
  } as WebhookEvent;
}

/** First backoff step is 5s, so 12:00:04 is too early and 12:00:06 is due. */
function atUtc(hhmmss: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`2026-09-01T${hhmmss}Z`));
}

describe('shouldDeliver', () => {
  it.each(['UTC', 'America/New_York', 'Europe/Helsinki', 'Asia/Tokyo'])(
    'measures the backoff from the stored time as UTC in %s',
    (tz) => {
      process.env.TZ = tz;

      atUtc('12:00:04');
      expect(shouldDeliver(event())).toBe(false);

      atUtc('12:00:06');
      expect(shouldDeliver(event())).toBe(true);
    }
  );

  it('attempts a never-tried event immediately', () => {
    expect(shouldDeliver(event({ attempts: 0 }))).toBe(true);
    expect(shouldDeliver(event({ last_attempted_at: null }))).toBe(true);
  });
});
