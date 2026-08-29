/**
 * Who may resolve or reopen a comment.
 *
 * Resolving is the agency saying "handled". A client who could do it would be able to close their
 * own feedback out of the team's queue, so the verb is team-only even though both kinds of caller
 * are legitimately inside the same review copy.
 *
 * The refusal is 403 rather than the 404 used elsewhere: this caller has already proven access to
 * the deployment, so there is nothing left to conceal by pretending it does not exist, and a 404
 * here would read to the client as a broken page rather than as a permission boundary.
 */

import type { ReviewCommentStatus } from '@/lib/vfs/adapters/review-database';
import type { ReviewAccess } from './access';

export type StatusChangeResult =
  | { ok: true; status: ReviewCommentStatus; resolvedBy: string | undefined }
  | { ok: false; httpStatus: 403 | 400; error: string };

const STATUSES: ReviewCommentStatus[] = ['open', 'resolved'];

/**
 * Authorise a status change and derive its stamp.
 *
 * Authorisation is settled before the body is looked at, so a participant gets the same 403
 * whatever they send; validating first would answer 400 on a bad value and tell them that the
 * status field was the only thing standing in their way.
 *
 * `resolvedBy` comes from the session's user id. A body-supplied one is never consulted, or the
 * resolution audit trail would be whatever the caller typed.
 */
export function authorizeStatusChange(access: ReviewAccess, raw: unknown): StatusChangeResult {
  if (access.kind !== 'team') {
    return { ok: false, httpStatus: 403, error: 'Only team members can change comment status' };
  }

  const status = (raw && typeof raw === 'object' ? (raw as Record<string, unknown>).status : undefined);
  if (typeof status !== 'string' || !STATUSES.includes(status as ReviewCommentStatus)) {
    return { ok: false, httpStatus: 400, error: "status must be 'open' or 'resolved'" };
  }

  // Reopening carries no resolver: the database clears resolved_at and resolved_by together, and a
  // name left on an open comment would read as resolved by someone.
  return {
    ok: true,
    status: status as ReviewCommentStatus,
    resolvedBy: status === 'resolved' ? access.userId : undefined,
  };
}
