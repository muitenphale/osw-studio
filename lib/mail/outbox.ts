/**
 * Email outbox
 *
 * Composition writes finished messages here; delivery drains them over SMTP. Nothing in this module
 * touches the network, so the queue fills whether or not a transport is configured.
 *
 * The column is `delivered`, matching webhook_outbox, but SMTP only tells us a server *accepted* a
 * message: bounces arrive asynchronously at a mailbox nothing here reads. The functions are named
 * for what is known, and the column is the only place the weaker word survives.
 */

import { getSystemDatabase } from '../auth/system-database';

/**
 * How many pending messages one drain pass may take.
 *
 * Draining the whole queue at once can trip a provider's rate limit, which then pushes messages
 * that were never the problem into backoff. A bounded pass also finishes inside one scheduler
 * interval, so a backlog bleeds off over several passes instead of overlapping them.
 */
export const PENDING_BATCH_SIZE = 25;

/**
 * How many times a message may be attempted before it is abandoned.
 *
 * Matches the length of the delivery backoff schedule: past the last step there is no longer wait
 * to apply. Abandoned rows stay in the table as the record of what failed; pruning only removes
 * accepted ones.
 */
export const MAX_DELIVERY_ATTEMPTS = 10;

/**
 * A queued message as stored. Fields are the raw column names because delivery reads whole rows.
 *
 * `delivered` / `delivered_at` record that a mail server accepted the message. See the module note.
 */
export interface OutboundEmail {
  id: number;
  /** NULL for instance mail (an admin test send), otherwise the workspace whose transport sends it. */
  workspace_id: string | null;
  to_email: string;
  subject: string;
  body_text: string;
  body_html: string | null;
  created_at: string;
  delivered: number;
  delivered_at: string | null;
  attempts: number;
  last_attempted_at: string | null;
}

export interface OutboundEmailInput {
  /** Omit for instance mail; the message then goes out on the instance's own transport. */
  workspaceId?: string | null;
  to: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string | null;
}

/**
 * Queue a finished message. Returns its row id.
 *
 * Not gated on whether mail is configured, that judgement belongs to whoever composed the message,
 * and a caller with a message in hand has already made it. Review composition asks first (see
 * lib/scheduler/review-notifications.ts); a test send bypasses the queue entirely.
 */
export function enqueueEmail(email: OutboundEmailInput): number {
  const db = getSystemDatabase();
  const result = db.prepare(`
    INSERT INTO email_outbox (workspace_id, to_email, subject, body_text, body_html)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    email.workspaceId ?? null,
    email.to,
    email.subject,
    email.bodyText,
    email.bodyHtml ?? null
  );
  return Number(result.lastInsertRowid);
}

/**
 * The oldest messages still worth attempting, up to `limit`.
 *
 * Oldest first so a backlog drains in the order it was composed rather than starving on whatever
 * happens to be cheapest to send.
 */
export function getPendingEmails(limit = PENDING_BATCH_SIZE): OutboundEmail[] {
  const db = getSystemDatabase();
  return db.prepare(`
    SELECT * FROM email_outbox
    WHERE delivered = 0 AND attempts < ?
    ORDER BY id ASC
    LIMIT ?
  `).all(MAX_DELIVERY_ATTEMPTS, limit) as OutboundEmail[];
}

/**
 * Record that a mail server accepted this message, which is the strongest claim SMTP supports.
 * Whether it reached a person is not knowable from here.
 */
export function markAccepted(id: number): void {
  const db = getSystemDatabase();
  db.prepare(
    "UPDATE email_outbox SET delivered = 1, delivered_at = datetime('now') WHERE id = ?"
  ).run(id);
}

/**
 * Record a failed attempt. The timestamp is what delivery's backoff measures from, so it is
 * stamped whatever the failure was.
 */
export function markFailed(id: number): void {
  const db = getSystemDatabase();
  db.prepare(
    "UPDATE email_outbox SET attempts = attempts + 1, last_attempted_at = datetime('now') WHERE id = ?"
  ).run(id);
}

/**
 * Discard what a workspace has queued, because its mail has just been switched off.
 *
 * Off means off. Left alone these rows would sit untouched, delivery holds rather than fails when
 * no transport resolves, and go out the moment the switch came back, which is the volley that
 * composition is now written to prevent; leaving them would put the backlog back by another route.
 *
 * Only rows still worth attempting. An abandoned one has exhausted its attempts and is the record
 * that something failed to reach a recipient, which is the same reason `pruneAccepted` will not
 * touch it either.
 *
 * Returns how many rows went.
 */
export function discardWorkspacePending(workspaceId: string): number {
  const db = getSystemDatabase();
  const result = db.prepare(`
    DELETE FROM email_outbox
    WHERE delivered = 0 AND attempts < ? AND workspace_id = ?
  `).run(MAX_DELIVERY_ATTEMPTS, workspaceId);
  return result.changes;
}

/**
 * Discard what the workspaces relaying through the instance have queued, because the offer has just
 * been withdrawn.
 *
 * The set is defined by exclusion, everything with a workspace behind it that is not sending
 * through its own server, so that a workspace which has never opened its mail page is covered too.
 * It is in instance mode by default, and a stored row is not what makes it depend on the relay.
 *
 * Instance mail keeps its rows: `workspace_id IS NULL` is the instance's own, which the offer switch
 * has never governed. A workspace with its own server keeps its rows for the same reason, the
 * withdrawal says nothing about a server the operator does not own.
 *
 * Returns how many rows went.
 */
export function discardRelayedPending(): number {
  const db = getSystemDatabase();
  const result = db.prepare(`
    DELETE FROM email_outbox
    WHERE delivered = 0
      AND attempts < ?
      AND workspace_id IS NOT NULL
      AND workspace_id NOT IN (SELECT workspace_id FROM workspace_mail WHERE mode = 'own')
  `).run(MAX_DELIVERY_ATTEMPTS);
  return result.changes;
}

/**
 * Drop accepted messages older than `olderThanDays`.
 *
 * Only accepted rows go: a message that was never accepted, still pending, or abandoned after
 * exhausting its attempts, is the only evidence that something failed to reach a recipient, and
 * deleting it on age would erase that silently.
 */
export function pruneAccepted(olderThanDays = 7): void {
  const db = getSystemDatabase();
  db.prepare(
    "DELETE FROM email_outbox WHERE delivered = 1 AND delivered_at < datetime('now', ?)"
  ).run(`-${olderThanDays} days`);
}
