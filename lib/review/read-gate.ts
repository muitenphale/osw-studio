/**
 * The rate gates on the review endpoints an anonymous caller can reach that are not writes:
 * serving an asset out of the review build, listing a deployment's comments, and following an
 * unsubscribe link.
 *
 * None of them returns anything worth guessing at, the first serves a file the URL-holder is
 * entitled to; the second is gated on access straight after; the third needs an HMAC no rate limit
 * makes guessable. What they have in common is that all do real work per request, on a URL that is
 * not a secret, for a caller who has proven nothing: a deployment resolve and a file read in one
 * case, a deployment resolve and a full table read in another, a deployment resolve and a database
 * open in the third. Left unbounded, an anonymous caller decides how much of that the instance
 * does.
 *
 * Keyed on the caller *and* the deployment, matching password-gate.ts and write-gate.ts: a flood
 * against one agency's review copy must not close a different agency's, and one flooder must not
 * close a copy for everyone in it.
 *
 * Separate budgets from each other and from the write gate, because a client who has just clicked
 * one unsubscribe link too many should still be able to look at the site.
 */

import {
  getIdentifier,
  RATE_LIMIT_CONFIG,
  reviewAssetRateLimiter,
  reviewCommentListRateLimiter,
  reviewUnsubscribeRateLimiter,
} from '@/lib/analytics/rate-limiter';

export { reviewAssetRateLimiter, reviewCommentListRateLimiter, reviewUnsubscribeRateLimiter };

export interface ReviewReadAttempt {
  allowed: boolean;
  retryAfterSeconds: number;
}

export function reviewAssetRateLimitKey(identifier: string, deploymentId: string): string {
  return `review-asset:${identifier}:${deploymentId}`;
}

export function reviewCommentListRateLimitKey(identifier: string, deploymentId: string): string {
  return `review-comment-list:${identifier}:${deploymentId}`;
}

export function reviewUnsubscribeRateLimitKey(identifier: string, deploymentId: string): string {
  return `review-unsubscribe:${identifier}:${deploymentId}`;
}

/** Record one asset request against the caller's budget and report whether it may proceed. */
export function consumeReviewAssetAttempt(
  request: Request,
  deploymentId: string
): ReviewReadAttempt {
  const key = reviewAssetRateLimitKey(getIdentifier(request), deploymentId);
  const config = RATE_LIMIT_CONFIG.reviewAsset;

  if (reviewAssetRateLimiter.check(key, config)) {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, reviewAssetRateLimiter.getResetTime(key, config)),
  };
}

/** Record one comment-list request against the caller's budget and report whether it may proceed. */
export function consumeReviewCommentListAttempt(
  request: Request,
  deploymentId: string
): ReviewReadAttempt {
  const key = reviewCommentListRateLimitKey(getIdentifier(request), deploymentId);
  const config = RATE_LIMIT_CONFIG.reviewCommentList;

  if (reviewCommentListRateLimiter.check(key, config)) {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, reviewCommentListRateLimiter.getResetTime(key, config)),
  };
}

/** Record one unsubscribe request against the caller's budget and report whether it may proceed. */
export function consumeReviewUnsubscribeAttempt(
  request: Request,
  deploymentId: string
): ReviewReadAttempt {
  const key = reviewUnsubscribeRateLimitKey(getIdentifier(request), deploymentId);
  const config = RATE_LIMIT_CONFIG.reviewUnsubscribe;

  if (reviewUnsubscribeRateLimiter.check(key, config)) {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, reviewUnsubscribeRateLimiter.getResetTime(key, config)),
  };
}
