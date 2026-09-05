import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * The counts themselves are one indexed query. What is worth pinning is the guard around them.
 *
 * `getReviewDatabaseConnection` creates the directory and the SQLite file on open, then caches the
 * handle. Counting without checking first would leave an empty review database and a held descriptor
 * behind for every deployment that has never used review, on every load of the listing.
 */

vi.mock('server-only', () => ({}));

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'osws-open-threads-'));
  vi.resetModules();
  vi.stubEnv('DEPLOYMENTS_DIR', path.join(dir, 'deployments'));
});

afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(dir, { recursive: true, force: true });
});

const ON = { enabled: true };
const D1 = 'aaaaaaaa-1111-2222-3333-444444444444';
const D2 = 'bbbbbbbb-1111-2222-3333-444444444444';

async function seed(deploymentId: string, comments: Array<{ status: string; parent?: string }>) {
  const { ReviewDatabase } = await import('@/lib/vfs/adapters/review-database');
  const db = new ReviewDatabase(deploymentId);
  db.init();

  const participant = db.upsertParticipant({ id: 'p1', displayName: 'Otto' });
  const ids: string[] = [];

  for (const c of comments) {
    const created = db.createComment({
      parentId: c.parent !== undefined ? ids[Number(c.parent)] : undefined,
      participantId: participant.id,
      authorName: 'Otto',
      pagePath: '/',
      selector: '#a',
      body: 'x',
    });
    ids.push(created.id);
    if (c.status === 'resolved') db.setCommentStatus(created.id, 'resolved', 'user-1');
  }
}

describe('openThreadCounts', () => {
  it('creates no database for a deployment it only had to look at', async () => {
    const { openThreadCounts } = await import('@/lib/review/open-thread-counts');

    openThreadCounts([
      { id: D1, review: undefined },
      { id: D2, review: { enabled: false } },
    ]);

    expect(fs.existsSync(path.join(dir, 'deployments', D1))).toBe(false);
    expect(fs.existsSync(path.join(dir, 'deployments', D2))).toBe(false);
  });

  it('creates no database for a review-enabled deployment that has never been published', async () => {
    const { openThreadCounts } = await import('@/lib/review/open-thread-counts');

    expect(openThreadCounts([{ id: D1, review: ON }])).toEqual({});
    expect(fs.existsSync(path.join(dir, 'deployments', D1, 'review.sqlite'))).toBe(false);
  });

  it('counts open roots, ignoring resolved ones and replies', async () => {
    await seed(D1, [
      { status: 'open' },
      { status: 'open' },
      { status: 'resolved' },
      { status: 'open', parent: '0' },
    ]);

    const { openThreadCounts } = await import('@/lib/review/open-thread-counts');
    expect(openThreadCounts([{ id: D1, review: ON }])).toEqual({ [D1]: 2 });
  });

  it('omits a deployment with nothing open rather than reporting a zero', async () => {
    await seed(D1, [{ status: 'resolved' }]);

    const { openThreadCounts } = await import('@/lib/review/open-thread-counts');
    expect(openThreadCounts([{ id: D1, review: ON }])).toEqual({});
  });
});
