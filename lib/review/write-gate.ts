/**
 * The rate gate on review writes, comments, replies, and a participant renaming themselves.
 *
 * Keyed on the caller *and* the deployment together, for the same reason the password gate is: a
 * flooder working through one agency's review copy must not be able to silence a different
 * agency's client from behind the same NAT, and one flooder must not be able to close a copy for
 * everyone in it.
 *
 * Comments and profile edits share one budget deliberately. They are the same act from the
 * server's point of view, an anonymous caller writing a row into a tenant's database, and
 * splitting them would just hand a flooder two budgets to spend.
 */

import {
  getIdentifier,
  RATE_LIMIT_CONFIG,
  reviewCommentRateLimiter,
} from '@/lib/analytics/rate-limiter';

export { reviewCommentRateLimiter };

export interface ReviewWriteAttempt {
  allowed: boolean;
  retryAfterSeconds: number;
}

export function reviewWriteRateLimitKey(identifier: string, deploymentId: string): string {
  return `review-write:${identifier}:${deploymentId}`;
}

/** Record one write attempt against the caller's budget and report whether it may proceed. */
export function consumeReviewWriteAttempt(
  request: Request,
  deploymentId: string
): ReviewWriteAttempt {
  const key = reviewWriteRateLimitKey(getIdentifier(request), deploymentId);
  const config = RATE_LIMIT_CONFIG.reviewComment;

  if (reviewCommentRateLimiter.check(key, config)) {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, reviewCommentRateLimiter.getResetTime(key, config)),
  };
}
