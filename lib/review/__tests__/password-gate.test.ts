import { describe, it, expect, beforeEach } from 'vitest';

import {
  checkReviewPassword,
  consumeReviewPasswordAttempt,
  reviewPasswordRateLimitKey,
  reviewPasswordRateLimiter,
} from '../password-gate';
import { RATE_LIMIT_CONFIG } from '@/lib/analytics/rate-limiter';
import { hashPassword } from '@/lib/auth/passwords';

/**
 * The password is the only thing standing between a URL-holder and a client's unpublished site, so
 * the two properties that matter are that it is actually checked, and that guessing at it is not
 * free. A gate on the analytics-grade limit is not a gate.
 */

const DEPLOYMENT_A = 'aaaaaaaa-1111-2222-3333-444444444444';
const DEPLOYMENT_B = 'bbbbbbbb-1111-2222-3333-444444444444';

function requestFrom(ip: string): Request {
  return new Request('https://example.test/review/x', { headers: { 'x-forwarded-for': ip } });
}

describe('checkReviewPassword', () => {
  it('accepts the right password and rejects a wrong one', async () => {
    const hash = await hashPassword('correct horse battery');

    expect(await checkReviewPassword('correct horse battery', hash)).toBe(true);
    expect(await checkReviewPassword('correct horse batteryy', hash)).toBe(false);
    expect(await checkReviewPassword('', hash)).toBe(false);
  });

  it('rejects rather than admits when there is no usable hash', async () => {
    // A review with no password should never reach this, but an empty hash must not read as a pass.
    expect(await checkReviewPassword('anything', '')).toBe(false);
    expect(await checkReviewPassword('anything', 'not-a-bcrypt-hash')).toBe(false);
  });
});

describe('reviewPasswordRateLimitKey', () => {
  it('includes both the caller and the deployment', () => {
    const key = reviewPasswordRateLimitKey('203.0.113.7', DEPLOYMENT_A);

    expect(key).toContain('203.0.113.7');
    expect(key).toContain(DEPLOYMENT_A);
    expect(key).not.toBe(reviewPasswordRateLimitKey('203.0.113.7', DEPLOYMENT_B));
    expect(key).not.toBe(reviewPasswordRateLimitKey('203.0.113.8', DEPLOYMENT_A));
  });
});

describe('consumeReviewPasswordAttempt', () => {
  beforeEach(() => {
    reviewPasswordRateLimiter.clear();
  });

  it('is tighter than the strict analytics limit', () => {
    expect(RATE_LIMIT_CONFIG.reviewPassword.limit).toBeLessThan(RATE_LIMIT_CONFIG.strict.limit);
    expect(RATE_LIMIT_CONFIG.reviewPassword.windowMs).toBeGreaterThan(RATE_LIMIT_CONFIG.strict.windowMs);
  });

  it('locks an IP out of a deployment after the limit', () => {
    const request = requestFrom('203.0.113.7');
    const { limit } = RATE_LIMIT_CONFIG.reviewPassword;

    for (let attempt = 0; attempt < limit; attempt++) {
      expect(consumeReviewPasswordAttempt(request, DEPLOYMENT_A).allowed).toBe(true);
    }

    const blocked = consumeReviewPasswordAttempt(request, DEPLOYMENT_A);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('scopes the limit to the deployment, so hammering A does not lock out B', () => {
    const request = requestFrom('203.0.113.7');
    const { limit } = RATE_LIMIT_CONFIG.reviewPassword;

    for (let attempt = 0; attempt <= limit; attempt++) {
      consumeReviewPasswordAttempt(request, DEPLOYMENT_A);
    }
    expect(consumeReviewPasswordAttempt(request, DEPLOYMENT_A).allowed).toBe(false);

    // An agency's client working on their own review copy is not collateral damage of someone
    // guessing at a different one from behind the same NAT.
    expect(consumeReviewPasswordAttempt(request, DEPLOYMENT_B).allowed).toBe(true);
  });

  it('scopes the limit to the caller, so one guesser does not lock out everyone else', () => {
    const guesser = requestFrom('203.0.113.7');
    const { limit } = RATE_LIMIT_CONFIG.reviewPassword;

    for (let attempt = 0; attempt <= limit; attempt++) {
      consumeReviewPasswordAttempt(guesser, DEPLOYMENT_A);
    }
    expect(consumeReviewPasswordAttempt(guesser, DEPLOYMENT_A).allowed).toBe(false);

    expect(consumeReviewPasswordAttempt(requestFrom('198.51.100.4'), DEPLOYMENT_A).allowed).toBe(true);
  });
});
