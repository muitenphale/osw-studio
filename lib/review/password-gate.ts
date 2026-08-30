/**
 * The password gate on a review copy.
 *
 * Guessing has to cost something. The URL is not a secret, it is pasted into an email thread and
 * forwarded around an agency's client, so the password is the whole gate, and an unauthenticated
 * caller can otherwise submit against it as fast as the server will hash.
 *
 * The limit is keyed on the caller *and* the deployment together. Keying on the caller alone would
 * let a guesser working through one review copy lock a different client out of theirs from behind
 * the same NAT; keying on the deployment alone would let one guesser shut the copy for everyone.
 */

import {
  getIdentifier,
  RATE_LIMIT_CONFIG,
  reviewPasswordRateLimiter,
} from '@/lib/analytics/rate-limiter';
import { verifyPassword } from '@/lib/auth/passwords';

export { reviewPasswordRateLimiter };

/**
 * Compare a submitted password against the stored bcrypt hash.
 *
 * Anything unusable, no password, no hash, a hash bcrypt will not parse, is a failure, never a
 * pass. A review with no password never reaches here; if it somehow did, an empty hash must not
 * read as "everyone is welcome".
 */
export async function checkReviewPassword(password: string, hash: string): Promise<boolean> {
  if (!password || !hash) return false;

  try {
    return await verifyPassword(password, hash);
  } catch {
    return false;
  }
}

export function reviewPasswordRateLimitKey(identifier: string, deploymentId: string): string {
  return `review-password:${identifier}:${deploymentId}`;
}

export interface ReviewPasswordAttempt {
  allowed: boolean;
  retryAfterSeconds: number;
}

/**
 * Record one password attempt and report whether it may proceed.
 *
 * Counted before the hash is verified, so a wrong guess and a right one cost the attacker the same;
 * counting only failures would make a correct password free to confirm.
 */
export function consumeReviewPasswordAttempt(
  request: Request,
  deploymentId: string
): ReviewPasswordAttempt {
  const key = reviewPasswordRateLimitKey(getIdentifier(request), deploymentId);
  const config = RATE_LIMIT_CONFIG.reviewPassword;

  if (reviewPasswordRateLimiter.check(key, config)) {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, reviewPasswordRateLimiter.getResetTime(key, config)),
  };
}
