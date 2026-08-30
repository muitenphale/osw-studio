import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * The outbox is the seam between composition and delivery. Composition can be finished and correct
 * while no SMTP transport is configured at all — the rows simply accumulate — so every claim made
 * here has to hold without a network.
 */

vi.mock('server-only', () => ({}));

const WORKSPACE = '11111111-1111-1111-1111-111111111111';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'osws-mail-outbox-'));
  vi.resetModules();
  vi.stubEnv('DATA_DIR', path.join(dir, 'data'));
});

afterEach(async () => {
  const { closeSystemDatabase } = await import('@/lib/auth/system-database');
  closeSystemDatabase();
  vi.unstubAllEnvs();
  fs.rmSync(dir, { recursive: true, force: true });
});

function outbox() {
  return import('@/lib/mail/outbox');
}

describe('enqueueEmail', () => {
  it('stores a message and reads it back whole', async () => {
    const { enqueueEmail, getPendingEmails } = await outbox();

    enqueueEmail({
      workspaceId: WORKSPACE,
      to: 'sam@client.example',
      subject: '3 new comments on Acme site',
      bodyText: 'Sam left three comments.',
      bodyHtml: '<p>Sam left three comments.</p>',
    });

    const pending = getPendingEmails();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      workspace_id: WORKSPACE,
      to_email: 'sam@client.example',
      subject: '3 new comments on Acme site',
      body_text: 'Sam left three comments.',
      body_html: '<p>Sam left three comments.</p>',
      attempts: 0,
      delivered: 0,
    });
  });

  it('accepts a message with no workspace behind it', async () => {
    // An admin test send goes out on the instance transport, not a workspace's.
    const { enqueueEmail, getPendingEmails } = await outbox();

    enqueueEmail({ to: 'admin@localhost', subject: 'Test', bodyText: 'Test.' });

    const pending = getPendingEmails();
    expect(pending[0].workspace_id).toBeNull();
    expect(pending[0].body_html).toBeNull();
  });

  it('returns the row id so a caller can follow one message', async () => {
    const { enqueueEmail } = await outbox();

    const first = enqueueEmail({ to: 'a@example.test', subject: 'A', bodyText: 'A.' });
    const second = enqueueEmail({ to: 'b@example.test', subject: 'B', bodyText: 'B.' });

    expect(second).toBeGreaterThan(first);
  });
});

describe('getPendingEmails', () => {
  it('takes the oldest rows up to the limit and leaves the rest queued', async () => {
    // Draining everything in one pass lets a single burst trip a provider rate limit, after which
    // backoff punishes messages that were never the problem.
    const { enqueueEmail, getPendingEmails } = await outbox();

    for (let i = 0; i < 5; i++) {
      enqueueEmail({ to: `r${i}@example.test`, subject: `S${i}`, bodyText: 'x' });
    }

    const batch = getPendingEmails(2);
    expect(batch.map((e) => e.to_email)).toEqual(['r0@example.test', 'r1@example.test']);
    expect(getPendingEmails(99)).toHaveLength(5);
  });

  it('defaults to a bounded batch rather than the whole queue', async () => {
    const { enqueueEmail, getPendingEmails, PENDING_BATCH_SIZE } = await outbox();

    for (let i = 0; i < PENDING_BATCH_SIZE + 3; i++) {
      enqueueEmail({ to: `r${i}@example.test`, subject: 'S', bodyText: 'x' });
    }

    expect(getPendingEmails()).toHaveLength(PENDING_BATCH_SIZE);
  });

  it('excludes accepted rows and rows that have exhausted their attempts', async () => {
    const { enqueueEmail, getPendingEmails, markAccepted, markFailed, MAX_DELIVERY_ATTEMPTS } = await outbox();

    const accepted = enqueueEmail({ to: 'gone@example.test', subject: 'A', bodyText: 'x' });
    const exhausted = enqueueEmail({ to: 'broken@example.test', subject: 'B', bodyText: 'x' });
    const live = enqueueEmail({ to: 'live@example.test', subject: 'C', bodyText: 'x' });

    markAccepted(accepted);
    for (let i = 0; i < MAX_DELIVERY_ATTEMPTS; i++) markFailed(exhausted);

    const pending = getPendingEmails();
    expect(pending.map((e) => e.id)).toEqual([live]);
  });

  it('keeps one workspace bad credentials from starving another workspace', async () => {
    // Per-workspace isolation comes free from the workspace_id column: a workspace whose rows keep
    // failing burns only its own attempt budget.
    const { enqueueEmail, getPendingEmails, markFailed, MAX_DELIVERY_ATTEMPTS } = await outbox();

    const broken = enqueueEmail({ workspaceId: 'ws-broken', to: 'a@example.test', subject: 'A', bodyText: 'x' });
    const healthy = enqueueEmail({ workspaceId: 'ws-healthy', to: 'b@example.test', subject: 'B', bodyText: 'x' });

    for (let i = 0; i < MAX_DELIVERY_ATTEMPTS; i++) markFailed(broken);

    expect((getPendingEmails()).map((e) => e.id)).toEqual([healthy]);
  });
});

describe('markFailed and markAccepted', () => {
  it('counts an attempt and records when it happened', async () => {
    const { enqueueEmail, getPendingEmails, markFailed } = await outbox();

    const id = enqueueEmail({ to: 'a@example.test', subject: 'A', bodyText: 'x' });
    markFailed(id);

    const [row] = getPendingEmails();
    expect(row.id).toBe(id);
    expect(row.attempts).toBe(1);
    expect(row.last_attempted_at).toBeTruthy();

    markFailed(id);
    expect((getPendingEmails())[0].attempts).toBe(2);
  });

  it('stamps both the flag and the timestamp when a mail server accepts a message', async () => {
    const { enqueueEmail, markAccepted } = await outbox();
    const { getSystemDatabase } = await import('@/lib/auth/system-database');

    const id = enqueueEmail({ to: 'a@example.test', subject: 'A', bodyText: 'x' });
    markAccepted(id);

    const row = getSystemDatabase()
      .prepare('SELECT delivered, delivered_at FROM email_outbox WHERE id = ?')
      .get(id) as { delivered: number; delivered_at: string | null };

    expect(row.delivered).toBe(1);
    expect(row.delivered_at).toBeTruthy();
  });
});

describe('discarding what a switched-off tier had queued', () => {
  /**
   * Off means off. Nothing is composed for a closed channel, so leaving its queue behind would put
   * the backlog back by the other route: delivery holds these rows rather than failing them, and
   * they would all go out at the moment the switch came back.
   */
  it('takes one workspace’s pending rows and nobody else’s', async () => {
    const { enqueueEmail, getPendingEmails, discardWorkspacePending } = await outbox();

    enqueueEmail({ workspaceId: WORKSPACE, to: 'a@example.test', subject: 'A', bodyText: 'x' });
    enqueueEmail({ workspaceId: WORKSPACE, to: 'b@example.test', subject: 'B', bodyText: 'x' });
    const other = enqueueEmail({ workspaceId: 'ws-other', to: 'c@example.test', subject: 'C', bodyText: 'x' });
    const instance = enqueueEmail({ to: 'admin@example.test', subject: 'D', bodyText: 'x' });

    expect(discardWorkspacePending(WORKSPACE)).toBe(2);
    expect(getPendingEmails().map((e) => e.id)).toEqual([other, instance]);
  });

  it('keeps the record of what failed', async () => {
    // An abandoned row is the only evidence that something never reached a recipient, which is the
    // same reason pruneAccepted will not remove one either.
    const { enqueueEmail, discardWorkspacePending, markFailed, MAX_DELIVERY_ATTEMPTS } = await outbox();
    const { getSystemDatabase } = await import('@/lib/auth/system-database');

    const abandoned = enqueueEmail({ workspaceId: WORKSPACE, to: 'a@example.test', subject: 'A', bodyText: 'x' });
    for (let i = 0; i < MAX_DELIVERY_ATTEMPTS; i++) markFailed(abandoned);

    expect(discardWorkspacePending(WORKSPACE)).toBe(0);
    expect(
      getSystemDatabase().prepare('SELECT id FROM email_outbox WHERE id = ?').get(abandoned)
    ).toBeTruthy();
  });

  it('takes the relaying workspaces when the instance withdraws its offer, and leaves its own mail', async () => {
    // A workspace with no mail row of its own is in instance mode by default, so it relays — the
    // absence of a row is not what decides it, and the delete is written as an exclusion for that
    // reason.
    const { enqueueEmail, getPendingEmails, discardRelayedPending } = await outbox();

    enqueueEmail({ workspaceId: WORKSPACE, to: 'a@example.test', subject: 'A', bodyText: 'x' });
    const instance = enqueueEmail({ to: 'admin@example.test', subject: 'B', bodyText: 'x' });

    expect(discardRelayedPending()).toBe(1);
    // The instance's own mail was never part of the offer, and the operator still has a server.
    expect(getPendingEmails().map((e) => e.id)).toEqual([instance]);
  });
});

describe('pruneAccepted', () => {
  it('removes old accepted rows and leaves pending ones alone', async () => {
    const { enqueueEmail, getPendingEmails, markAccepted, pruneAccepted } = await outbox();
    const { getSystemDatabase } = await import('@/lib/auth/system-database');

    const old = enqueueEmail({ to: 'old@example.test', subject: 'A', bodyText: 'x' });
    const recent = enqueueEmail({ to: 'recent@example.test', subject: 'B', bodyText: 'x' });
    const pending = enqueueEmail({ to: 'pending@example.test', subject: 'C', bodyText: 'x' });

    markAccepted(old);
    markAccepted(recent);
    getSystemDatabase()
      .prepare("UPDATE email_outbox SET delivered_at = datetime('now', '-30 days') WHERE id = ?")
      .run(old);

    pruneAccepted(7);

    const remaining = getSystemDatabase()
      .prepare('SELECT id FROM email_outbox ORDER BY id ASC')
      .all() as Array<{ id: number }>;

    expect(remaining.map((r) => r.id)).toEqual([recent, pending]);
    expect((getPendingEmails()).map((e) => e.id)).toEqual([pending]);
  });

  it('never removes a row that has not been accepted, however old', async () => {
    const { enqueueEmail, pruneAccepted } = await outbox();
    const { getSystemDatabase } = await import('@/lib/auth/system-database');

    const stale = enqueueEmail({ to: 'stale@example.test', subject: 'A', bodyText: 'x' });
    getSystemDatabase()
      .prepare("UPDATE email_outbox SET created_at = datetime('now', '-400 days') WHERE id = ?")
      .run(stale);

    pruneAccepted(7);

    const row = getSystemDatabase().prepare('SELECT id FROM email_outbox WHERE id = ?').get(stale);
    expect(row).toBeTruthy();
  });
});
