/**
 * Draining the email outbox.
 *
 * Same backoff shape, attempt cap and bounded pass as lib/webhooks/delivery.ts, with one difference.
 *
 * A webhook has one destination, so "not configured" and "failing" can share a path. Mail cannot: an
 * instance with no SMTP server is the normal state of a fresh install. With no transport resolvable
 * this pass does nothing, leaving the rows untouched rather than calling `markFailed`. Counting an
 * attempt against a message never handed to a server would walk the queue to MAX_DELIVERY_ATTEMPTS
 * while the operator was still choosing a relay, killing every message the moment SMTP was set up.
 * only the first one costs an attempt.
 *
 * Transports are resolved once per workspace per pass and reused across that workspace's messages,
 * which is also what keeps one workspace's bad credentials off every other workspace's rows.
 */

import {
  getPendingEmails,
  markAccepted,
  markFailed,
  pruneAccepted,
  PENDING_BATCH_SIZE,
  type OutboundEmail,
} from './outbox';
import { resolveTransport, type ResolvedTransport } from './transport';

/**
 * Seconds to wait before attempt n+1, indexed by attempts already made.
 *
 * Same schedule as webhook delivery, and the same length as MAX_DELIVERY_ATTEMPTS so the two run
 * out together: past the last step there is no longer wait left to apply. The early steps are short
 * because the common failure is a relay's rate limit clearing in seconds; the tail is ten minutes
 * because everything that survives that long is a person having to fix something.
 */
export const BACKOFF_SCHEDULE = [5, 30, 120, 600, 600, 600, 600, 600, 600, 600];

export interface DeliveryResult {
  /** Messages a mail server took. Not "reached a person", see lib/mail/outbox.ts. */
  accepted: number;
  /** Messages attempted and refused; each spent one attempt. */
  failed: number;
  /** Messages left untouched because no transport resolved. No attempt spent. */
  held: number;
}

/**
 * SQLite's `datetime('now')` is UTC, written with a space and no zone marker. `new Date` reads that
 * as local time, which would shift every backoff by the host's offset, hours of extra delay west
 * of UTC and, east of it, a backoff that has already expired the moment it is written.
 */
function parseTimestamp(value: string): number {
  const sqliteShape = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(value);
  return new Date(sqliteShape ? `${value.replace(' ', 'T')}Z` : value).getTime();
}

export function shouldDeliver(
  email: Pick<OutboundEmail, 'attempts' | 'last_attempted_at'>,
  now: number = Date.now()
): boolean {
  if (email.attempts === 0) return true;
  if (!email.last_attempted_at) return true;

  const waitSeconds = BACKOFF_SCHEDULE[Math.min(email.attempts - 1, BACKOFF_SCHEDULE.length - 1)];
  return now >= parseTimestamp(email.last_attempted_at) + waitSeconds * 1000;
}

/** Groups a batch by the transport that should carry it. A null workspace is instance mail. */
function groupByWorkspace(emails: OutboundEmail[]): Array<{ workspaceId: string | null; emails: OutboundEmail[] }> {
  const groups = new Map<string, { workspaceId: string | null; emails: OutboundEmail[] }>();

  for (const email of emails) {
    // A workspace id can never contain a NUL, so instance mail cannot collide with a real workspace.
    const key = email.workspace_id ?? '\0instance';
    let group = groups.get(key);
    if (!group) {
      group = { workspaceId: email.workspace_id, emails: [] };
      groups.set(key, group);
    }
    group.emails.push(email);
  }

  return [...groups.values()];
}

/**
 * The pass currently running, or null.
 *
 * A row is selected as pending, sent, and only then marked, so a second pass entering that window
 * selects the same rows and sends them again, a real client receiving the same digest twice. The
 * admin flush endpoint and the scheduler are the two callers and they are not coordinated, so this
 * is reachable by a flush landing on the timer, or by a double-click.
 *
 * An in-process guard is enough because it is the whole of the exposure: better-sqlite3 is
 * synchronous and the outbox lives in the one system database this process owns. A second process
 * writing the same file would need the claim to be a row update instead.
 */
let inFlight: Promise<DeliveryResult> | null = null;

/**
 * One drain pass, or the one already running.
 *
 * A caller arriving mid-pass waits for it and gets its counts, rather than starting a second pass
 * over the same rows or being told nothing happened.
 *
 * Never throws for an ordinary failure: a refused message is recorded and the pass carries on, and
 * a workspace whose transport cannot be built at all is skipped without touching its rows.
 */
export function deliverPendingEmails(): Promise<DeliveryResult> {
  if (inFlight) return inFlight;

  inFlight = drainOnce().finally(() => {
    inFlight = null;
  });

  return inFlight;
}

async function drainOnce(): Promise<DeliveryResult> {
  const result: DeliveryResult = { accepted: 0, failed: 0, held: 0 };

  const due = getPendingEmails(PENDING_BATCH_SIZE).filter((email) => shouldDeliver(email));

  for (const group of groupByWorkspace(due)) {
    let transport: ResolvedTransport | null = null;

    try {
      transport = await resolveTransport(group.workspaceId);
    } catch (err) {
      // Unreadable or malformed settings are still not a delivery attempt. Ids only, never the
      // recipient, the subject or the body.
      console.error(
        `[EmailDelivery] Could not resolve a transport for ${group.workspaceId ?? 'the instance'}:`,
        err instanceof Error ? err.message : err
      );
    }

    // The load-bearing branch. No transport means hold, not fail.
    if (!transport) {
      result.held += group.emails.length;
      continue;
    }

    try {
      for (const email of group.emails) {
        try {
          await transport.sendMail({
            to: email.to_email,
            subject: email.subject,
            text: email.body_text,
            html: email.body_html,
          });
          markAccepted(email.id);
          result.accepted++;
        } catch {
          // Deliberately not logged: the SMTP error text routinely quotes the recipient back, and
          // the queue endpoints already surface that a workspace is failing. The verbatim error is
          // available to an owner through the test-send route, on demand and to their own address.
          markFailed(email.id);
          result.failed++;
        }
      }
    } finally {
      try {
        transport.close();
      } catch {
        // A connection that will not close is of no further consequence to this pass.
      }
    }
  }

  // Runs on every pass, including empty ones, so accepted rows are still tidied away once a queue
  // goes quiet. Only ever removes accepted rows.
  pruneAccepted();

  return result;
}
