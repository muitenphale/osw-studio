import { describe, it, expect, beforeEach } from 'vitest';

import {
  consumeReviewAssetAttempt,
  consumeReviewCommentListAttempt,
  consumeReviewUnsubscribeAttempt,
  reviewAssetRateLimitKey,
  reviewAssetRateLimiter,
  reviewCommentListRateLimitKey,
  reviewCommentListRateLimiter,
  reviewUnsubscribeRateLimitKey,
  reviewUnsubscribeRateLimiter,
} from '../read-gate';
import { RATE_LIMIT_CONFIG } from '@/lib/analytics/rate-limiter';

/**
 * The review endpoints an anonymous caller can reach that are not writes.
 *
 * All do real work per request — the asset route resolves a deployment and reads a file, the
 * comment list resolves a deployment and reads its comment table, the unsubscribe route resolves a
 * deployment and opens its database — on URLs that are explicitly not secrets. The point of these
 * limits is the cost of the work, not the value of what it returns, so they sit far above anything
 * a person browsing a review copy can generate.
 */

const DEPLOYMENT_A = 'aaaaaaaa-1111-2222-3333-444444444444';
const DEPLOYMENT_B = 'bbbbbbbb-1111-2222-3333-444444444444';

function requestFrom(ip: string): Request {
  return new Request('https://example.test/review/x/logo.png', {
    headers: { 'x-forwarded-for': ip },
  });
}

describe('review asset rate limit', () => {
  beforeEach(() => {
    reviewAssetRateLimiter.clear();
  });

  it('is far looser than the write limit, because a page load is a burst', () => {
    const asset = RATE_LIMIT_CONFIG.reviewAsset;
    const write = RATE_LIMIT_CONFIG.reviewComment;

    const assetPerMinute = asset.limit / (asset.windowMs / 60_000);
    const writePerMinute = write.limit / (write.windowMs / 60_000);

    expect(assetPerMinute).toBeGreaterThan(writePerMinute * 20);
    // A review copy is served no-store, so every navigation refetches every subresource; a limit
    // that a heavy page could reach in one load would be a broken page, not a gate.
    expect(asset.limit).toBeGreaterThanOrEqual(500);
  });

  it('includes both the caller and the deployment in the key', () => {
    const key = reviewAssetRateLimitKey('203.0.113.7', DEPLOYMENT_A);

    expect(key).toContain('203.0.113.7');
    expect(key).toContain(DEPLOYMENT_A);
    expect(key).not.toBe(reviewAssetRateLimitKey('203.0.113.7', DEPLOYMENT_B));
    expect(key).not.toBe(reviewAssetRateLimitKey('203.0.113.8', DEPLOYMENT_A));
  });

  it('blocks a caller past the limit and reports when to come back', () => {
    const request = requestFrom('203.0.113.7');
    const { limit } = RATE_LIMIT_CONFIG.reviewAsset;

    for (let attempt = 0; attempt < limit; attempt++) {
      expect(consumeReviewAssetAttempt(request, DEPLOYMENT_A).allowed).toBe(true);
    }

    const blocked = consumeReviewAssetAttempt(request, DEPLOYMENT_A);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('scopes the limit to the deployment, so hammering A does not lock out B', () => {
    const request = requestFrom('203.0.113.7');
    const { limit } = RATE_LIMIT_CONFIG.reviewAsset;

    for (let attempt = 0; attempt <= limit; attempt++) {
      consumeReviewAssetAttempt(request, DEPLOYMENT_A);
    }
    expect(consumeReviewAssetAttempt(request, DEPLOYMENT_A).allowed).toBe(false);

    expect(consumeReviewAssetAttempt(request, DEPLOYMENT_B).allowed).toBe(true);
  });

  it('scopes the limit to the caller, so one flooder does not close the copy for everyone', () => {
    const flooder = requestFrom('203.0.113.7');
    const { limit } = RATE_LIMIT_CONFIG.reviewAsset;

    for (let attempt = 0; attempt <= limit; attempt++) {
      consumeReviewAssetAttempt(flooder, DEPLOYMENT_A);
    }
    expect(consumeReviewAssetAttempt(flooder, DEPLOYMENT_A).allowed).toBe(false);

    expect(consumeReviewAssetAttempt(requestFrom('198.51.100.4'), DEPLOYMENT_A).allowed).toBe(true);
  });
});

describe('review comment list rate limit', () => {
  beforeEach(() => {
    reviewCommentListRateLimiter.clear();
  });

  it('paces a page loading rather than a person typing', () => {
    const list = RATE_LIMIT_CONFIG.reviewCommentList;
    const write = RATE_LIMIT_CONFIG.reviewComment;

    // The widget fetches the list on every navigation and again after each write, so the ceiling
    // has to sit well above the write budget or a client working through a site trips it.
    const listPerMinute = list.limit / (list.windowMs / 60_000);
    const writePerMinute = write.limit / (write.windowMs / 60_000);
    expect(listPerMinute).toBeGreaterThan(writePerMinute * 10);
  });

  it('includes both the caller and the deployment in the key', () => {
    const key = reviewCommentListRateLimitKey('203.0.113.7', DEPLOYMENT_A);

    expect(key).toContain('203.0.113.7');
    expect(key).toContain(DEPLOYMENT_A);
    expect(key).not.toBe(reviewCommentListRateLimitKey('203.0.113.7', DEPLOYMENT_B));
    expect(key).not.toBe(reviewCommentListRateLimitKey('203.0.113.8', DEPLOYMENT_A));
  });

  it('blocks a caller past the limit and reports when to come back', () => {
    const request = requestFrom('203.0.113.7');
    const { limit } = RATE_LIMIT_CONFIG.reviewCommentList;

    for (let attempt = 0; attempt < limit; attempt++) {
      expect(consumeReviewCommentListAttempt(request, DEPLOYMENT_A).allowed).toBe(true);
    }

    const blocked = consumeReviewCommentListAttempt(request, DEPLOYMENT_A);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('scopes the limit to the deployment and the caller', () => {
    const request = requestFrom('203.0.113.7');
    const { limit } = RATE_LIMIT_CONFIG.reviewCommentList;

    for (let attempt = 0; attempt <= limit; attempt++) {
      consumeReviewCommentListAttempt(request, DEPLOYMENT_A);
    }
    expect(consumeReviewCommentListAttempt(request, DEPLOYMENT_A).allowed).toBe(false);

    expect(consumeReviewCommentListAttempt(request, DEPLOYMENT_B).allowed).toBe(true);
    expect(
      consumeReviewCommentListAttempt(requestFrom('198.51.100.4'), DEPLOYMENT_A).allowed
    ).toBe(true);
  });

  it('does not share a budget with asset serving', () => {
    const request = requestFrom('203.0.113.7');
    const { limit } = RATE_LIMIT_CONFIG.reviewCommentList;

    for (let attempt = 0; attempt <= limit; attempt++) {
      consumeReviewCommentListAttempt(request, DEPLOYMENT_A);
    }

    // Reading the comments too often must not take the site itself away from the reader.
    reviewAssetRateLimiter.clear();
    expect(consumeReviewAssetAttempt(request, DEPLOYMENT_A).allowed).toBe(true);
  });
});

describe('review unsubscribe rate limit', () => {
  beforeEach(() => {
    reviewUnsubscribeRateLimiter.clear();
  });

  it('leaves room for a whole client team of links arriving through one mail gateway', () => {
    expect(RATE_LIMIT_CONFIG.reviewUnsubscribe.limit).toBeGreaterThanOrEqual(20);
  });

  it('includes both the caller and the deployment in the key', () => {
    const key = reviewUnsubscribeRateLimitKey('203.0.113.7', DEPLOYMENT_A);

    expect(key).toContain('203.0.113.7');
    expect(key).toContain(DEPLOYMENT_A);
    expect(key).not.toBe(reviewUnsubscribeRateLimitKey('203.0.113.7', DEPLOYMENT_B));
    expect(key).not.toBe(reviewUnsubscribeRateLimitKey('203.0.113.8', DEPLOYMENT_A));
  });

  it('blocks a caller past the limit', () => {
    const request = requestFrom('203.0.113.7');
    const { limit } = RATE_LIMIT_CONFIG.reviewUnsubscribe;

    for (let attempt = 0; attempt < limit; attempt++) {
      expect(consumeReviewUnsubscribeAttempt(request, DEPLOYMENT_A).allowed).toBe(true);
    }

    expect(consumeReviewUnsubscribeAttempt(request, DEPLOYMENT_A).allowed).toBe(false);
  });

  it('scopes the limit to the deployment and the caller', () => {
    const request = requestFrom('203.0.113.7');
    const { limit } = RATE_LIMIT_CONFIG.reviewUnsubscribe;

    for (let attempt = 0; attempt <= limit; attempt++) {
      consumeReviewUnsubscribeAttempt(request, DEPLOYMENT_A);
    }
    expect(consumeReviewUnsubscribeAttempt(request, DEPLOYMENT_A).allowed).toBe(false);

    expect(consumeReviewUnsubscribeAttempt(request, DEPLOYMENT_B).allowed).toBe(true);
    expect(consumeReviewUnsubscribeAttempt(requestFrom('198.51.100.4'), DEPLOYMENT_A).allowed).toBe(
      true
    );
  });

  it('does not share a budget with asset serving', () => {
    const request = requestFrom('203.0.113.7');
    const { limit } = RATE_LIMIT_CONFIG.reviewUnsubscribe;

    for (let attempt = 0; attempt <= limit; attempt++) {
      consumeReviewUnsubscribeAttempt(request, DEPLOYMENT_A);
    }

    // A recipient who has clicked one too many unsubscribe links must still be able to see the site.
    reviewAssetRateLimiter.clear();
    expect(consumeReviewAssetAttempt(request, DEPLOYMENT_A).allowed).toBe(true);
  });
});
