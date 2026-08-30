import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { ReviewDatabase } from '@/lib/vfs/adapters/review-database';

/**
 * Muting is a preference, not a position.
 *
 * The obvious implementation of the digest footer's "Mute this deployment" — jump the recipient's
 * watermark to now — only silences the backlog: the next comment written is after that watermark,
 * so the digest resumes. notification_state therefore carries a `muted` flag of its own, and
 * composition skips a muted recipient *without* moving their watermark, so unmuting shows them
 * everything they missed rather than a hole.
 */

let dir: string;
let db: ReviewDatabase | null;
let open: (deploymentId: string) => Promise<ReviewDatabase>;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'osws-review-mute-'));
  db = null;
  vi.resetModules();
  vi.stubEnv('DEPLOYMENTS_DIR', dir);

  open = async (deploymentId: string) => {
    const { ReviewDatabase } = await import('@/lib/vfs/adapters/review-database');
    db = new ReviewDatabase(deploymentId);
    db.init();
    return db;
  };
});

afterEach(() => {
  db?.close();
  vi.unstubAllEnvs();
  fs.rmSync(dir, { recursive: true, force: true });
});

const DEPLOYMENT_A = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const DEPLOYMENT_B = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
const DEPLOYMENT_C = 'cccccccc-3333-4333-8333-cccccccccccc';
const DEPLOYMENT_D = 'dddddddd-4444-4444-8444-dddddddddddd';
const LEGACY = 'eeeeeeee-5555-4555-8555-eeeeeeeeeeee';

describe('notification_state muted flag', () => {
  it('defaults to not muted and round-trips a mute', async () => {
    const review = await open(DEPLOYMENT_A);

    review.setNotificationState('participant', 'p-1', {
      lastNotifiedAt: '2026-01-01T00:00:01Z',
      lastNotifiedCommentId: 'c-1',
    });
    expect(review.getNotificationState('participant', 'p-1')?.muted).toBe(false);

    review.setMuted('participant', 'p-1', true);

    expect(review.getNotificationState('participant', 'p-1')).toEqual({
      recipientKind: 'participant',
      recipientId: 'p-1',
      lastNotifiedAt: '2026-01-01T00:00:01Z',
      lastNotifiedCommentId: 'c-1',
      muted: true,
    });

    review.setMuted('participant', 'p-1', false);
    expect(review.getNotificationState('participant', 'p-1')?.muted).toBe(false);
  });

  it('mutes a recipient who has never been notified, without inventing a watermark', async () => {
    // The mute link is in the digest footer, but a team member can mute from the studio before any
    // digest has gone out. A row created by muting must not carry a watermark, or unmuting would
    // hide every comment written before the mute.
    const review = await open(DEPLOYMENT_B);

    review.setMuted('user', 'user:u-1', true);

    expect(review.getNotificationState('user', 'user:u-1')).toEqual({
      recipientKind: 'user',
      recipientId: 'user:u-1',
      lastNotifiedAt: null,
      lastNotifiedCommentId: null,
      muted: true,
    });
  });

  it('keeps a recipient muted when the watermark is written without mentioning mute', async () => {
    // Composition advances watermarks on every run. If that write reset `muted`, one digest cycle
    // would unmute everybody who had asked for silence.
    const review = await open(DEPLOYMENT_C);

    review.setMuted('participant', 'p-1', true);
    review.setNotificationState('participant', 'p-1', {
      lastNotifiedAt: '2026-02-01T00:00:00Z',
      lastNotifiedCommentId: 'c-9',
    });

    const state = review.getNotificationState('participant', 'p-1');
    expect(state?.muted).toBe(true);
    expect(state?.lastNotifiedAt).toBe('2026-02-01T00:00:00Z');
  });

  it('lets a single write set the watermark and the mute together', async () => {
    const review = await open(DEPLOYMENT_D);

    review.setNotificationState('participant', 'p-1', {
      lastNotifiedAt: '2026-03-01T00:00:00Z',
      lastNotifiedCommentId: 'c-3',
      muted: true,
    });

    expect(review.getNotificationState('participant', 'p-1')?.muted).toBe(true);
  });
});

describe('notification_state muted migration', () => {
  it('adds the column to a database created before it existed, keeping the rows', async () => {
    // Shipped installs already have a notification_state table, and CREATE TABLE IF NOT EXISTS
    // never touches it. Without an explicit ALTER those installs would read a column that is not
    // there — every digest run throwing on the first recipient it looks up.
    const { getReviewDatabaseConnection } = await import('@/lib/vfs/adapters/sqlite-connection');
    const raw = getReviewDatabaseConnection(LEGACY);
    raw.exec(`
      CREATE TABLE notification_state (
        recipient_kind TEXT NOT NULL,
        recipient_id TEXT NOT NULL,
        last_notified_at TEXT,
        last_notified_comment_id TEXT,
        PRIMARY KEY (recipient_kind, recipient_id)
      )
    `);
    raw.prepare(`
      INSERT INTO notification_state (recipient_kind, recipient_id, last_notified_at, last_notified_comment_id)
      VALUES ('participant', 'p-legacy', '2025-12-01T00:00:00Z', 'c-legacy')
    `).run();

    const { ReviewDatabase } = await import('@/lib/vfs/adapters/review-database');
    db = new ReviewDatabase(LEGACY);
    db.init();

    expect(db.getNotificationState('participant', 'p-legacy')).toEqual({
      recipientKind: 'participant',
      recipientId: 'p-legacy',
      lastNotifiedAt: '2025-12-01T00:00:00Z',
      lastNotifiedCommentId: 'c-legacy',
      muted: false,
    });

    db.setMuted('participant', 'p-legacy', true);
    expect(db.getNotificationState('participant', 'p-legacy')?.muted).toBe(true);
  });

  it('is safe to run twice on the same database', async () => {
    const { getReviewDatabaseConnection } = await import('@/lib/vfs/adapters/sqlite-connection');
    const raw = getReviewDatabaseConnection(LEGACY);
    raw.exec(`
      CREATE TABLE notification_state (
        recipient_kind TEXT NOT NULL,
        recipient_id TEXT NOT NULL,
        last_notified_at TEXT,
        last_notified_comment_id TEXT,
        PRIMARY KEY (recipient_kind, recipient_id)
      )
    `);

    const { ReviewDatabase } = await import('@/lib/vfs/adapters/review-database');
    db = new ReviewDatabase(LEGACY);
    db.init();

    // A second instance over the same file re-runs init from scratch — the per-instance
    // `initialized` guard says nothing about what is already on disk.
    const second = new ReviewDatabase(LEGACY);
    expect(() => second.init()).not.toThrow();

    const cols = raw.prepare('PRAGMA table_info(notification_state)').all() as Array<{ name: string }>;
    expect(cols.filter((c) => c.name === 'muted')).toHaveLength(1);
  });
});
