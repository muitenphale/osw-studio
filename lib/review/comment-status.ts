/**
 * Who may resolve or reopen a comment.
 *
 * Team-only, where team means a member who clears `editor`. A client who could resolve would be
 * closing their own feedback out of the agency's queue.
 *
 * 403 rather than the 404 used elsewhere in the review layer: this caller has already proven access
 * to the deployment, so there is nothing left to conceal.
 */

import type { ReviewCommentStatus } from '@/lib/vfs/adapters/review-database';
import { actsAsTeam, type ReviewAccess } from './access';

export type StatusChangeResult =
  | { ok: true; status: ReviewCommentStatus; resolvedBy: string | undefined }
  | { ok: false; httpStatus: 403 | 400; error: string };

const STATUSES: ReviewCommentStatus[] = ['open', 'resolved'];

/**
 * Authorisation is settled before the body is read, so a participant gets the same 403 whatever
 * they send. `resolvedBy` comes from the session, never from the body.
 */
export function authorizeStatusChange(access: ReviewAccess, raw: unknown): StatusChangeResult {
  if (!actsAsTeam(access)) {
    return { ok: false, httpStatus: 403, error: 'Only team members can change comment status' };
  }

  const status = (raw && typeof raw === 'object' ? (raw as Record<string, unknown>).status : undefined);
  if (typeof status !== 'string' || !STATUSES.includes(status as ReviewCommentStatus)) {
    return { ok: false, httpStatus: 400, error: "status must be 'open' or 'resolved'" };
  }

  // Reopening carries no resolver: the database clears resolved_at and resolved_by together.
  return {
    ok: true,
    status: status as ReviewCommentStatus,
    resolvedBy: status === 'resolved' && access.kind === 'team' ? access.userId : undefined,
  };
}
