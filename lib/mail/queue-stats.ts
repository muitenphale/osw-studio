/**
 * What the outbox looks like from the outside.
 *
 * The queue endpoints exist because an unconfigured or misconfigured mail setup is otherwise
 * invisible: composition keeps working, the rows keep accruing, and the first sign of trouble is a
 * client saying they never heard from anyone. A pending count that will not go down, or an age that
 * keeps climbing, is that signal arriving before the client does.
 *
 * Counts only. A queued message is a private notification to a named person, and its recipient,
 * subject and body are none of an operator's business, including the instance admin's.
 */

import 'server-only';

import { getSystemDatabase } from '../auth/system-database';
import { MAX_DELIVERY_ATTEMPTS } from './outbox';

export interface QueueStats {
  /** Still deliverable: not accepted, attempts left. */
  pending: number;
  /** A subset of `pending` that has already been refused at least once. */
  failing: number;
  /** Out of attempts. These will not be retried and are kept as the record of what failed. */
  abandoned: number;
  oldestPendingAt: string | null;
  oldestPendingAgeSeconds: number | null;
}

/**
 * @param workspaceId scope to one workspace, or omit for the whole instance (admin view).
 */
export function getQueueStats(workspaceId?: string): QueueStats {
  const db = getSystemDatabase();
  // Named parameters throughout: better-sqlite3 refuses a statement that mixes the two styles.
  const scope = workspaceId === undefined ? '1 = 1' : 'workspace_id = :workspaceId';
  const args = workspaceId === undefined
    ? { cap: MAX_DELIVERY_ATTEMPTS }
    : { cap: MAX_DELIVERY_ATTEMPTS, workspaceId };

  const counts = db.prepare(`
    SELECT
      SUM(CASE WHEN delivered = 0 AND attempts < :cap THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN delivered = 0 AND attempts > 0 AND attempts < :cap THEN 1 ELSE 0 END) AS failing,
      SUM(CASE WHEN delivered = 0 AND attempts >= :cap THEN 1 ELSE 0 END) AS abandoned
    FROM email_outbox WHERE ${scope}
  `).get(args) as {
    pending: number | null;
    failing: number | null;
    abandoned: number | null;
  };

  const oldest = db.prepare(`
    SELECT created_at, CAST(strftime('%s', 'now') - strftime('%s', created_at) AS INTEGER) AS age
    FROM email_outbox
    WHERE delivered = 0 AND attempts < :cap AND ${scope}
    ORDER BY created_at ASC
    LIMIT 1
  `).get(args) as { created_at: string; age: number } | undefined;

  return {
    pending: counts.pending ?? 0,
    failing: counts.failing ?? 0,
    abandoned: counts.abandoned ?? 0,
    oldestPendingAt: oldest?.created_at ?? null,
    oldestPendingAgeSeconds: oldest ? Math.max(0, oldest.age) : null,
  };
}
