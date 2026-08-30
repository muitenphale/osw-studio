import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { ReviewDatabase } from '@/lib/vfs/adapters/review-database';

/**
 * Review comments live in a third per-deployment database so they are created, backed up and
 * deleted with the deployment they annotate.
 */

let dir: string;
let db: ReviewDatabase | null;
let open: (deploymentId: string) => Promise<ReviewDatabase>;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'osws-review-db-'));
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
  // Closed here rather than at the end of each test: a failing assertion would skip an in-body
  // close and leave a handle open across the rmSync below, which fails on Windows.
  db?.close();
  vi.unstubAllEnvs();
  fs.rmSync(dir, { recursive: true, force: true });
});

const DEPLOYMENT_A = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const DEPLOYMENT_B = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
const DEPLOYMENT_C = 'cccccccc-3333-4333-8333-cccccccccccc';
const DEPLOYMENT_D = 'dddddddd-4444-4444-8444-dddddddddddd';
const DEPLOYMENT_E = 'eeeeeeee-5555-4555-8555-eeeeeeeeeeee';
const DEPLOYMENT_F = 'ffffffff-6666-4666-8666-ffffffffffff';
const DEPLOYMENT_G = 'aaaaaaaa-7777-4777-8777-bbbbbbbbbbbb';

describe('ReviewDatabase comments', () => {
  it('round-trips a comment with its anchor fields intact', async () => {
    const review = await open(DEPLOYMENT_A);
    review.upsertParticipant({ id: 'p-1', displayName: 'Client' });

    const created = review.createComment({
      participantId: 'p-1',
      authorName: 'Client',
      pagePath: '/pricing.html',
      selector: 'main > section:nth-of-type(2) h2',
      anchorText: 'Enterprise plan',
      body: 'Can this heading say "Teams" instead?',
    });

    const stored = review.getComment(created.id);

    expect(stored).toMatchObject({
      pagePath: '/pricing.html',
      selector: 'main > section:nth-of-type(2) h2',
      anchorText: 'Enterprise plan',
      body: 'Can this heading say "Teams" instead?',
      authorName: 'Client',
      participantId: 'p-1',
      status: 'open',
      parentId: null,
      isTeam: false,
    });
  });

  it('lists replies with parent_id intact so a thread can be reassembled', async () => {
    const review = await open(DEPLOYMENT_B);
    review.upsertParticipant({ id: 'p-1', displayName: 'Client' });
    review.upsertParticipant({ id: 'user:u-1', displayName: 'Designer', isTeam: true });

    const root = review.createComment({
      participantId: 'p-1',
      authorName: 'Client',
      pagePath: '/index.html',
      selector: 'h1',
      body: 'Too small on mobile.',
    });
    const reply = review.createComment({
      parentId: root.id,
      participantId: 'user:u-1',
      authorName: 'Designer',
      isTeam: true,
      pagePath: '/index.html',
      selector: 'h1',
      body: 'Bumped it a step.',
    });

    const listed = review.listComments({ pagePath: '/index.html' });

    expect(listed).toHaveLength(2);
    expect(listed.find((c) => c.id === root.id)?.parentId).toBeNull();
    expect(listed.find((c) => c.id === reply.id)?.parentId).toBe(root.id);
    expect(listed.find((c) => c.id === reply.id)?.isTeam).toBe(true);
  });

  it('records who resolved a comment and clears that when it is reopened', async () => {
    const review = await open(DEPLOYMENT_C);
    review.upsertParticipant({ id: 'p-1', displayName: 'Client' });
    const comment = review.createComment({
      participantId: 'p-1',
      authorName: 'Client',
      pagePath: '/about.html',
      body: 'Wrong phone number.',
    });

    review.setCommentStatus(comment.id, 'resolved', 'user:u-1');
    const resolved = review.getComment(comment.id);
    expect(resolved?.status).toBe('resolved');
    expect(resolved?.resolvedAt).toBeTruthy();
    expect(resolved?.resolvedBy).toBe('user:u-1');

    review.setCommentStatus(comment.id, 'open');
    const reopened = review.getComment(comment.id);
    expect(reopened?.status).toBe('open');
    expect(reopened?.resolvedAt).toBeNull();
    expect(reopened?.resolvedBy).toBeNull();
  });

  it('excludes a comment created exactly at the watermark and includes a later one', async () => {
    // The digest passes the previous run's watermark straight back in, so a comment sitting exactly
    // on it has already been sent. Timestamps are written explicitly: the column default has
    // one-second resolution and would put both rows in the same second.
    const review = await open(DEPLOYMENT_D);
    const { getReviewDatabaseConnection } = await import('@/lib/vfs/adapters/sqlite-connection');
    const raw = getReviewDatabaseConnection(DEPLOYMENT_D);
    const insert = raw.prepare(`
      INSERT INTO comments (id, participant_id, author_name, page_path, body, created_at)
      VALUES (?, 'p-1', 'Client', '/index.html', ?, ?)
    `);
    insert.run('c-at-watermark', 'Sent in the last digest.', '2026-01-01T00:00:00Z');
    insert.run('c-after', 'Written after the last digest.', '2026-01-01T00:00:01Z');

    const since = review.listCommentsSince('2026-01-01T00:00:00Z');

    expect(since.map((c) => c.id)).toEqual(['c-after']);
  });

  it('still excludes the watermark comment when the watermark carries milliseconds', async () => {
    // Stored timestamps have second resolution, so a caller's `new Date().toISOString()` would
    // otherwise sort below the row it names ('.' before 'Z') and re-send it every digest.
    const review = await open(DEPLOYMENT_G);
    const { getReviewDatabaseConnection } = await import('@/lib/vfs/adapters/sqlite-connection');
    const raw = getReviewDatabaseConnection(DEPLOYMENT_G);
    raw.prepare(`
      INSERT INTO comments (id, participant_id, author_name, page_path, body, created_at)
      VALUES (?, 'p-1', 'Client', '/index.html', 'Sent in the last digest.', ?)
    `).run('c-at-watermark', '2026-01-01T00:00:00Z');

    expect(review.listCommentsSince('2026-01-01T00:00:00.000Z')).toEqual([]);
  });

  it('writes timestamps a text comparison can order', async () => {
    const review = await open(DEPLOYMENT_D);
    review.upsertParticipant({ id: 'p-1', displayName: 'Client' });
    const comment = review.createComment({
      participantId: 'p-1',
      authorName: 'Client',
      pagePath: '/index.html',
      body: 'Anything.',
    });
    review.setCommentStatus(comment.id, 'resolved', 'user:u-1');

    const stored = review.getComment(comment.id);
    const participant = review.getParticipant('p-1');
    const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

    expect(stored?.createdAt).toMatch(iso);
    expect(stored?.resolvedAt).toMatch(iso);
    expect(participant?.createdAt).toMatch(iso);
    expect(participant?.lastSeenAt).toMatch(iso);
  });
});

describe('ReviewDatabase participants', () => {
  it('updates a display name without clearing the stored email', async () => {
    const review = await open(DEPLOYMENT_E);
    review.upsertParticipant({ id: 'p-1', displayName: 'Sam', email: 'sam@client.example', notify: true });

    review.upsertParticipant({ id: 'p-1', displayName: 'Sam Okafor' });

    const stored = review.getParticipant('p-1');
    expect(stored?.displayName).toBe('Sam Okafor');
    expect(stored?.email).toBe('sam@client.example');
    expect(stored?.notify).toBe(true);
  });
});

describe('ReviewDatabase notification state', () => {
  it('returns nothing for an unknown recipient and round-trips a written state', async () => {
    const review = await open(DEPLOYMENT_F);

    expect(review.getNotificationState('participant', 'p-unknown')).toBeNull();

    review.setNotificationState('participant', 'p-1', {
      lastNotifiedAt: '2026-01-01T00:00:01Z',
      lastNotifiedCommentId: 'c-after',
    });

    expect(review.getNotificationState('participant', 'p-1')).toEqual({
      recipientKind: 'participant',
      recipientId: 'p-1',
      lastNotifiedAt: '2026-01-01T00:00:01Z',
      lastNotifiedCommentId: 'c-after',
      muted: false,
    });
  });
});
