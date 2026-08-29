import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SignJWT } from 'jose';

/**
 * The review cookie is the only thing standing between two anonymous visitors of the same
 * review copy, and between visitors of two different deployments. Those properties are asserted
 * here rather than left to the routes: the participant id must come out of a signature the
 * server made, a cookie minted for one deployment must be worthless against another, and a token
 * minted for a different purpose entirely must not be spendable here.
 */

const NOW = Date.UTC(2026, 0, 1, 12, 0, 0);
const DEPLOYMENT_A = 'aaaaaaaa-1111-2222-3333-444444444444';
const DEPLOYMENT_B = 'bbbbbbbb-1111-2222-3333-444444444444';
const SECRET = 'test-review-secret-value';

const OPEN = { enabled: true } as const;
const HASH_ONE = '$2b$12$abcdefghijklmnopqrstuvOldPasswordHashValue0000000000';
const HASH_TWO = '$2b$12$abcdefghijklmnopqrstuvNewPasswordHashValue1111111111';

async function load() {
  vi.resetModules();
  return import('../session');
}

/** A token signed with the same secret as a review cookie, but issued for something else. */
async function foreignToken(claims: Record<string, unknown>) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(Math.floor(NOW / 1000) + 3600)
    .setIssuedAt()
    .sign(new TextEncoder().encode(SECRET));
}

describe('review session', () => {
  beforeEach(() => {
    vi.stubEnv('SESSION_SECRET', SECRET);
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('mints a cookie that verifies and carries a participant id', async () => {
    const { mintReviewCookie, verifyReviewSession, reviewCookieName } = await load();

    const cookie = await mintReviewCookie(DEPLOYMENT_A, OPEN);
    const payload = await verifyReviewSession(cookie.value, DEPLOYMENT_A, OPEN);

    expect(cookie.name).toBe(reviewCookieName(DEPLOYMENT_A));
    expect(payload).not.toBeNull();
    expect(payload!.participantId).toBe(cookie.participantId);
    expect(payload!.deploymentId).toBe(DEPLOYMENT_A);
    expect(cookie.participantId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });

  it('gives each mint a distinct participant id', async () => {
    const { mintReviewCookie } = await load();

    const first = await mintReviewCookie(DEPLOYMENT_A, OPEN);
    const second = await mintReviewCookie(DEPLOYMENT_A, OPEN);

    expect(first.participantId).not.toBe(second.participantId);
  });

  it('caps exp at review.expiresAt when that is sooner than the default lifetime', async () => {
    const { mintReviewCookie, verifyReviewSession, REVIEW_SESSION_DURATION } = await load();

    const review = { enabled: true, expiresAt: new Date(NOW + 60_000).toISOString() };
    const cookie = await mintReviewCookie(DEPLOYMENT_A, review);
    const payload = await verifyReviewSession(cookie.value, DEPLOYMENT_A, review);

    expect(payload!.exp).toBe(Math.floor((NOW + 60_000) / 1000));
    expect(payload!.exp).toBeLessThan(Math.floor((NOW + REVIEW_SESSION_DURATION) / 1000));
  });

  it('keeps the default lifetime when review.expiresAt is further out', async () => {
    const { mintReviewCookie, verifyReviewSession, REVIEW_SESSION_DURATION } = await load();

    const review = { enabled: true, expiresAt: new Date(NOW + REVIEW_SESSION_DURATION * 10).toISOString() };
    const cookie = await mintReviewCookie(DEPLOYMENT_A, review);
    const payload = await verifyReviewSession(cookie.value, DEPLOYMENT_A, review);

    expect(payload!.exp).toBe(Math.floor((NOW + REVIEW_SESSION_DURATION) / 1000));
  });

  it('ignores an unparseable expiresAt rather than minting a dead cookie', async () => {
    const { mintReviewCookie, verifyReviewSession, REVIEW_SESSION_DURATION } = await load();

    const review = { enabled: true, expiresAt: 'not-a-date' };
    const cookie = await mintReviewCookie(DEPLOYMENT_A, review);
    const payload = await verifyReviewSession(cookie.value, DEPLOYMENT_A, review);

    expect(payload!.exp).toBe(Math.floor((NOW + REVIEW_SESSION_DURATION) / 1000));
  });

  it('gives the token and the cookie the same lifetime, in every case', async () => {
    const { mintReviewCookie, verifyReviewSession } = await load();
    const nowSeconds = Math.floor(NOW / 1000);

    // One call owns both numbers, so a caller cannot pair a short token with a long cookie.
    for (const review of [
      { enabled: true },
      { enabled: true, expiresAt: new Date(NOW + 60_000).toISOString() },
      { enabled: true, expiresAt: 'not-a-date' },
    ]) {
      const cookie = await mintReviewCookie(DEPLOYMENT_A, review);
      const payload = await verifyReviewSession(cookie.value, DEPLOYMENT_A, review);

      expect(payload!.exp - nowSeconds).toBe(cookie.options.maxAge);
    }
  });

  it('rejects a cookie minted for another deployment', async () => {
    const { mintReviewCookie, verifyReviewSession } = await load();

    const cookie = await mintReviewCookie(DEPLOYMENT_A, OPEN);

    expect(await verifyReviewSession(cookie.value, DEPLOYMENT_B, OPEN)).toBeNull();
  });

  it('rejects a token signed for another purpose with the same secret', async () => {
    const { verifyReviewSession } = await load();

    // An account session: same signing key, no purpose claim.
    const account = await foreignToken({ userId: 'user-7', email: 'a@b.c', isAdmin: true });
    // A handoff token: same signing key, a different declared purpose.
    const handoff = await foreignToken({ userId: 'user-7', purpose: 'handoff' });
    // The discriminating case: every other claim a review session needs, correct — including the
    // epoch of a review with no password — so nothing but the missing purpose stamp can reject it.
    const unstamped = await foreignToken({
      deploymentId: DEPLOYMENT_A,
      participantId: 'someone',
      pwe: 'open',
    });

    expect(await verifyReviewSession(account, DEPLOYMENT_A, OPEN)).toBeNull();
    expect(await verifyReviewSession(handoff, DEPLOYMENT_A, OPEN)).toBeNull();
    expect(await verifyReviewSession(unstamped, DEPLOYMENT_A, OPEN)).toBeNull();
  });

  it('declares its purpose so other verifiers can tell it apart', async () => {
    const { mintReviewCookie } = await load();

    const { value } = await mintReviewCookie(DEPLOYMENT_A, OPEN);
    const payload = JSON.parse(Buffer.from(value.split('.')[1], 'base64url').toString());

    expect(payload.purpose).toBe('review');
  });

  it('stops honouring a session once the review password changes', async () => {
    const { mintReviewCookie, verifyReviewSession } = await load();

    const cookie = await mintReviewCookie(DEPLOYMENT_A, { enabled: true, passwordHash: HASH_ONE });

    // Same round, same deployment, new password: the point of changing it is to cut people off.
    expect(await verifyReviewSession(cookie.value, DEPLOYMENT_A, { enabled: true, passwordHash: HASH_TWO }))
      .toBeNull();
    // Removing the password entirely is also a change of gate.
    expect(await verifyReviewSession(cookie.value, DEPLOYMENT_A, { enabled: true })).toBeNull();
    // Unrelated edits to the review settings must not log everyone out.
    expect(
      await verifyReviewSession(cookie.value, DEPLOYMENT_A, {
        enabled: true,
        passwordHash: HASH_ONE,
        notifyByEmail: true,
      })
    ).not.toBeNull();
  });

  it('stops honouring a passwordless session once a password is set', async () => {
    const { mintReviewCookie, verifyReviewSession } = await load();

    const cookie = await mintReviewCookie(DEPLOYMENT_A, OPEN);

    expect(await verifyReviewSession(cookie.value, DEPLOYMENT_A, { enabled: true, passwordHash: HASH_ONE }))
      .toBeNull();
  });

  it('does not put password material in the token', async () => {
    const { mintReviewCookie } = await load();

    const { value } = await mintReviewCookie(DEPLOYMENT_A, { enabled: true, passwordHash: HASH_ONE });
    const payload = Buffer.from(value.split('.')[1], 'base64url').toString();

    expect(payload).not.toContain(HASH_ONE);
    expect(payload).not.toContain(HASH_ONE.slice(0, 16));
  });

  it('rejects a tampered token', async () => {
    const { mintReviewCookie, verifyReviewSession } = await load();

    const { value } = await mintReviewCookie(DEPLOYMENT_A, OPEN);
    const [header, body, signature] = value.split('.');
    const forgedBody = Buffer.from(
      JSON.stringify({
        deploymentId: DEPLOYMENT_A,
        participantId: 'attacker',
        purpose: 'review',
        exp: 9_999_999_999,
      })
    ).toString('base64url');

    expect(await verifyReviewSession(`${header}.${forgedBody}.${signature}`, DEPLOYMENT_A, OPEN)).toBeNull();
    expect(await verifyReviewSession(`${header}.${body}.${signature}x`, DEPLOYMENT_A, OPEN)).toBeNull();
  });

  it('rejects a token signed with a different secret', async () => {
    const first = await load();
    const { value } = await first.mintReviewCookie(DEPLOYMENT_A, OPEN);

    vi.stubEnv('SESSION_SECRET', 'a-completely-different-secret');
    const second = await load();

    expect(await second.verifyReviewSession(value, DEPLOYMENT_A, OPEN)).toBeNull();
  });

  it('rejects an expired token', async () => {
    const { mintReviewCookie, verifyReviewSession } = await load();

    const review = { enabled: true, expiresAt: new Date(NOW + 60_000).toISOString() };
    const { value } = await mintReviewCookie(DEPLOYMENT_A, review);
    vi.setSystemTime(NOW + 120_000);

    expect(await verifyReviewSession(value, DEPLOYMENT_A, review)).toBeNull();
  });

  it('rejects garbage instead of throwing', async () => {
    const { verifyReviewSession } = await load();

    expect(await verifyReviewSession('', DEPLOYMENT_A, OPEN)).toBeNull();
    expect(await verifyReviewSession('not.a.jwt', DEPLOYMENT_A, OPEN)).toBeNull();
  });

  it('names the cookie per deployment and scopes its path to that deployment', async () => {
    const { mintReviewCookie, reviewCookieName, REVIEW_SESSION_DURATION } = await load();

    expect(reviewCookieName(DEPLOYMENT_A)).not.toBe(reviewCookieName(DEPLOYMENT_B));
    expect(reviewCookieName(DEPLOYMENT_A)).toContain(DEPLOYMENT_A);

    const { options } = await mintReviewCookie(DEPLOYMENT_A, OPEN);
    expect(options.path).toBe(`/review/${DEPLOYMENT_A}`);
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe('lax');
    expect(options.maxAge).toBe(REVIEW_SESSION_DURATION / 1000);
  });

  it('caps cookie maxAge at review.expiresAt too', async () => {
    const { mintReviewCookie } = await load();

    const { options } = await mintReviewCookie(DEPLOYMENT_A, {
      enabled: true,
      expiresAt: new Date(NOW + 60_000).toISOString(),
    });

    expect(options.maxAge).toBe(60);
  });

  it('marks the cookie Secure in production only, and never when it is switched off', async () => {
    const production = async (secureCookies?: string) => {
      vi.stubEnv('NODE_ENV', 'production');
      if (secureCookies !== undefined) vi.stubEnv('SECURE_COOKIES', secureCookies);
      const { mintReviewCookie } = await load();
      return (await mintReviewCookie(DEPLOYMENT_A, OPEN)).options.secure;
    };

    expect(await production()).toBe(true);
    // Local http development and the documented pre-SSL VPS path would both break on a hardcoded
    // Secure, so the absence of it in those cases is as much a requirement as its presence above.
    expect(await production('false')).toBe(false);

    vi.unstubAllEnvs();
    vi.stubEnv('SESSION_SECRET', SECRET);
    vi.stubEnv('NODE_ENV', 'development');
    const { mintReviewCookie } = await load();
    expect((await mintReviewCookie(DEPLOYMENT_A, OPEN)).options.secure).toBe(false);
  });
});
