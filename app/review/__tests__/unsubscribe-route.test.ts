import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import { NextRequest } from 'next/server';

/**
 * The way out of a mailing list nobody joined.
 *
 * A client has no account, so this route is reached with nothing but the link from a digest footer.
 * That makes two things load-bearing: the token has to be the only thing that authorises the
 * change, and a link for one recipient must not work for another.
 */

const mocks = vi.hoisted(() => ({ resolveDeployment: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/vfs/adapters/deployment-adapter', () => ({
  resolveDeployment: mocks.resolveDeployment,
}));

import { GET as unsubscribe } from '../[deploymentId]/unsubscribe/route';
import { createUnsubscribeToken } from '@/lib/review/unsubscribe-token';
import {
  reviewUnsubscribeRateLimitKey,
  reviewUnsubscribeRateLimiter,
} from '@/lib/review/read-gate';
import { RATE_LIMIT_CONFIG, getIdentifier } from '@/lib/analytics/rate-limiter';
import { ReviewDatabase } from '@/lib/vfs/adapters/review-database';
import { closeReviewDatabase } from '@/lib/vfs/adapters/sqlite-connection';

const ORIGIN = 'http://localhost:3000';

let dir: string;
let deploymentId: string;

function reviewDatabasePath(id = deploymentId): string {
  return path.join(dir, 'deployments', id, 'review.sqlite');
}

function openDatabase(): ReviewDatabase {
  const db = new ReviewDatabase(deploymentId);
  db.init();
  return db;
}

async function call(query: Record<string, string>) {
  const search = new URLSearchParams(query).toString();
  const request = new NextRequest(`${ORIGIN}/review/${deploymentId}/unsubscribe?${search}`);
  return unsubscribe(request, { params: Promise.resolve({ deploymentId }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'osws-review-unsub-'));
  deploymentId = randomUUID();

  vi.stubEnv('DATA_DIR', path.join(dir, 'data'));
  vi.stubEnv('DEPLOYMENTS_DIR', path.join(dir, 'deployments'));
  vi.stubEnv('SESSION_SECRET', 'test-session-secret-for-unsubscribe-route');

  mocks.resolveDeployment.mockResolvedValue({
    adapter: {},
    workspaceId: 'ws-1',
    deployment: { id: deploymentId, name: 'Acme site', review: { enabled: true, notifyByEmail: true } },
  });
});

afterEach(() => {
  closeReviewDatabase(deploymentId);
  vi.unstubAllEnvs();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('participant unsubscribe', () => {
  it('clears notify and confirms', async () => {
    const db = openDatabase();
    db.upsertParticipant({ id: 'p1', displayName: 'Sam', email: 'sam@client.example' });

    const response = await call({
      id: 'p1',
      token: createUnsubscribeToken('participant', 'p1', deploymentId),
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('no longer');
    expect(openDatabase().getParticipant('p1')?.notify).toBe(false);
  });

  it('keeps the address it already had', async () => {
    // Unsubscribing is not a reason to forget who they are; they may turn it back on in the widget.
    const db = openDatabase();
    db.upsertParticipant({ id: 'p1', displayName: 'Sam', email: 'sam@client.example' });

    await call({ id: 'p1', token: createUnsubscribeToken('participant', 'p1', deploymentId) });

    const participant = openDatabase().getParticipant('p1');
    expect(participant?.email).toBe('sam@client.example');
    expect(participant?.displayName).toBe('Sam');
  });

  it("refuses a token minted for a different participant", async () => {
    const db = openDatabase();
    db.upsertParticipant({ id: 'p1', displayName: 'Sam', email: 'sam@client.example' });
    db.upsertParticipant({ id: 'p2', displayName: 'Mira', email: 'mira@client.example' });

    const response = await call({
      id: 'p2',
      token: createUnsubscribeToken('participant', 'p1', deploymentId),
    });

    expect(response.status).toBe(404);
    expect(openDatabase().getParticipant('p2')?.notify).toBe(true);
  });

  it('refuses a request with no token at all', async () => {
    const db = openDatabase();
    db.upsertParticipant({ id: 'p1', displayName: 'Sam', email: 'sam@client.example' });

    const response = await call({ id: 'p1', token: '' });

    expect(response.status).toBe(404);
    expect(openDatabase().getParticipant('p1')?.notify).toBe(true);
  });
});

describe('team mute', () => {
  it('mutes without moving the watermark', async () => {
    // Muting is a preference, not a position: advancing the watermark would silence the backlog and
    // then resume on the next comment.
    const db = openDatabase();
    db.setNotificationState('user', 'u1', {
      lastNotifiedAt: '2026-01-01T10:00:00Z',
      lastNotifiedCommentId: 'c1',
    });

    const response = await call({
      kind: 'user',
      id: 'u1',
      token: createUnsubscribeToken('user', 'u1', deploymentId),
    });

    expect(response.status).toBe(200);
    const state = openDatabase().getNotificationState('user', 'u1');
    expect(state?.muted).toBe(true);
    expect(state?.lastNotifiedAt).toBe('2026-01-01T10:00:00Z');
    expect(state?.lastNotifiedCommentId).toBe('c1');
  });

  it('refuses a participant token presented as a team mute', async () => {
    const response = await call({
      kind: 'user',
      id: 'u1',
      token: createUnsubscribeToken('participant', 'u1', deploymentId),
    });

    expect(response.status).toBe(404);
  });
});

describe('rate limit', () => {
  /** Fill the budget for one caller on one deployment, the way a flood would. */
  function exhaust(id: string): void {
    const request = new NextRequest(`${ORIGIN}/review/${id}/unsubscribe`);
    const key = reviewUnsubscribeRateLimitKey(getIdentifier(request), id);
    for (let attempt = 0; attempt < RATE_LIMIT_CONFIG.reviewUnsubscribe.limit; attempt++) {
      reviewUnsubscribeRateLimiter.check(key, RATE_LIMIT_CONFIG.reviewUnsubscribe);
    }
  }

  it('answers 429 once the caller has spent its budget on this deployment', async () => {
    const db = openDatabase();
    db.upsertParticipant({ id: 'p1', displayName: 'Sam', email: 'sam@client.example' });

    const token = createUnsubscribeToken('participant', 'p1', deploymentId);
    // Control: the link works before the budget is spent, so the 429 below is the limit.
    expect((await call({ id: 'p1', token })).status).toBe(200);

    exhaust(deploymentId);

    const blocked = await call({ id: 'p1', token });
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after')).toBeTruthy();
  });

  it('does not let a flood on one deployment silence the links of another', async () => {
    const other = randomUUID();
    exhaust(other);

    const db = openDatabase();
    db.upsertParticipant({ id: 'p1', displayName: 'Sam', email: 'sam@client.example' });

    const response = await call({
      id: 'p1',
      token: createUnsubscribeToken('participant', 'p1', deploymentId),
    });

    expect(response.status).toBe(200);
  });
});

describe('review off', () => {
  it('answers 404 and does not create a review database', async () => {
    // The connection helper creates the file, so a route that opened it before checking would
    // leave an empty review database in the directory of a deployment that has no review at all.
    mocks.resolveDeployment.mockResolvedValue({
      adapter: {},
      workspaceId: 'ws-1',
      deployment: { id: deploymentId, name: 'Acme site', review: { enabled: false } },
    });

    const response = await call({
      id: 'p1',
      token: createUnsubscribeToken('participant', 'p1', deploymentId),
    });

    expect(response.status).toBe(404);
    expect(fs.existsSync(reviewDatabasePath())).toBe(false);
  });

  it('answers 404 for a deployment that does not resolve', async () => {
    mocks.resolveDeployment.mockResolvedValue(null);

    const response = await call({
      id: 'p1',
      token: createUnsubscribeToken('participant', 'p1', deploymentId),
    });

    expect(response.status).toBe(404);
    expect(fs.existsSync(reviewDatabasePath())).toBe(false);
  });
});
