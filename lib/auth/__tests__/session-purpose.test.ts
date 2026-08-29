/**
 * The account session shares SESSION_SECRET with two other token families: handoff tokens
 * (`purpose: 'handoff'`) and review-session cookies (`purpose: 'review'`), the latter handed to
 * anonymous strangers who open a review copy of a published site. A valid signature alone therefore
 * no longer means "this is an account session", so verifySession has to tell the families apart on
 * the claim rather than rely on a downstream user lookup failing to resolve.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SignJWT } from 'jose';

import { createSession, verifySession, createHandoffToken, verifyHandoffToken } from '@/lib/auth/session';

const SECRET = 'test-session-secret-for-purpose-guard';

function secretKey(): Uint8Array {
  return new TextEncoder().encode(SECRET);
}

/** A token signed with the account key but minted by something other than createSession. */
async function foreignToken(claims: Record<string, unknown>): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('5m')
    .setIssuedAt()
    .sign(secretKey());
}

describe('verifySession purpose guard', () => {
  beforeEach(() => {
    vi.stubEnv('SESSION_SECRET', SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('accepts a genuine account session', async () => {
    const token = await createSession('user-1', 'user@example.com', false);

    const session = await verifySession(token);

    expect(session).not.toBeNull();
    expect(session?.userId).toBe('user-1');
    expect(session?.email).toBe('user@example.com');
    expect(session?.isAdmin).toBe(false);
  });

  it('refuses a review token presented as an account session', async () => {
    const token = await foreignToken({
      deploymentId: 'deployment-1',
      participantId: 'participant-1',
      purpose: 'review',
      pwe: 'open',
    });

    expect(await verifySession(token)).toBeNull();
  });

  it('refuses a handoff token presented as an account session', async () => {
    const token = await createHandoffToken('user-1');

    expect(await verifySession(token)).toBeNull();
  });

  it('still accepts a genuine handoff token at verifyHandoffToken', async () => {
    const token = await createHandoffToken('user-2');

    expect(await verifyHandoffToken(token)).toEqual({ userId: 'user-2' });
  });
});
