import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
vi.mock('server-only', () => ({}));
import Database from 'better-sqlite3';
import { toSqliteTimestamp } from '@/lib/sqlite-timestamp';

/**
 * Analytics rows are timestamped by the column default, `datetime('now')`, which writes
 * `YYYY-MM-DD HH:MM:SS`. Every range query used to bind a JS `toISOString()` value against those
 * columns, and text comparison puts `' '` (0x20) below `'T'` (0x54), so a stored row always ranked
 * lower than an ISO string bearing the same date.
 *
 * The date prefix decides the comparison first on every other day, which is why this went unnoticed:
 * it only shows on the boundary day, which is the day every range query is anchored to.
 *
 * Written against a real SQLite database rather than a mock, because the defect is in how SQLite
 * compares two strings and a mock would have been written to agree with whichever side was wrong.
 */

function pageviews(rows: string[]): Database.Database {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE pageviews (id INTEGER PRIMARY KEY,
           timestamp TEXT NOT NULL DEFAULT (datetime('now')))`);
  const insert = db.prepare('INSERT INTO pageviews (timestamp) VALUES (?)');
  for (const r of rows) insert.run(r);
  return db;
}

const MIDNIGHT = new Date(Date.UTC(2026, 8, 1, 0, 0, 0));

describe('a range query against a datetime(\'now\') column', () => {
  it('counts the rows on the cutoff day', () => {
    const db = pageviews(['2026-09-01 08:00:00', '2026-09-01 20:00:00']);
    const count = (v: string) =>
      (db.prepare('SELECT COUNT(*) c FROM pageviews WHERE timestamp >= ?').get(v) as { c: number }).c;

    expect(count(toSqliteTimestamp(MIDNIGHT))).toBe(2);
    // What the code used to bind, kept as the discriminator: it drops both rows.
    expect(count(MIDNIGHT.toISOString())).toBe(0);
    db.close();
  });

  it('keeps rows the retention delete should not remove', () => {
    const db = pageviews(['2026-09-01 20:00:00']);
    const remaining = () =>
      (db.prepare('SELECT COUNT(*) c FROM pageviews').get() as { c: number }).c;

    db.prepare('DELETE FROM pageviews WHERE timestamp < ?').run(toSqliteTimestamp(MIDNIGHT));
    expect(remaining()).toBe(1);

    // The same delete with an ISO bound value takes a row that is newer than the cutoff.
    db.prepare('DELETE FROM pageviews WHERE timestamp < ?').run(MIDNIGHT.toISOString());
    expect(remaining()).toBe(0);
    db.close();
  });
});

// ---------------------------------------------------------------------------
// The call sites, not just the comparison
// ---------------------------------------------------------------------------

const DEPLOYMENT = 'cccccccc-1111-2222-3333-444444444444';

describe('AnalyticsDatabase binds range values in the column\'s format', () => {
  /**
   * The rule above is only worth anything if `analytics-database.ts` actually applies it. This drives
   * the real class so that dropping `toSqliteTimestamp` from a query is caught, rather than only the
   * SQL semantics being pinned.
   */
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'osws-analytics-'));
    vi.resetModules();
    vi.stubEnv('DEPLOYMENTS_DIR', path.join(dir, 'deployments'));
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-30T12:00:00Z'));
  });

  afterEach(async () => {
    vi.useRealTimers();
    const { closeAnalyticsDatabase } = await import('@/lib/vfs/adapters/sqlite-connection');
    closeAnalyticsDatabase?.(DEPLOYMENT);
    vi.unstubAllEnvs();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('counts a pageview later on the cutoff day', async () => {
    const { AnalyticsDatabase } = await import('@/lib/vfs/adapters/analytics-database');
    const db = new AnalyticsDatabase(DEPLOYMENT);
    db.init();

    // getStats(29) puts the cutoff at 2026-09-01 12:00:00. This row is the same day but later, so
    // it is inside the range; compared against an ISO cutoff it sorts below and vanishes.
    const raw = (db as unknown as { db: import('better-sqlite3').Database }).db;
    raw.prepare(
      `INSERT INTO pageviews (page_path, session_id, timestamp) VALUES ('/', 's1', '2026-09-01 20:00:00')`
    ).run();

    expect(db.getStats(29).totalPageviews).toBe(1);
  });
});
