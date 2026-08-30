import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { createUnsubscribeToken, verifyUnsubscribeToken } from '../unsubscribe-token';

/**
 * The opt-out link is the only control a client has over mail they never signed up for, and it has
 * to work with no account behind it. That makes the token the whole of the authorisation: it names
 * one recipient on one deployment, and it must be useless for anybody else.
 */

const DEPLOYMENT = 'dep-1';
const OTHER_DEPLOYMENT = 'dep-2';

beforeEach(() => {
  vi.stubEnv('SESSION_SECRET', 'test-session-secret-for-unsubscribe-tokens');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('verifyUnsubscribeToken', () => {
  it('accepts the recipient and deployment the token was minted for', () => {
    const token = createUnsubscribeToken('participant', 'p1', DEPLOYMENT);

    expect(verifyUnsubscribeToken(token, 'participant', 'p1', DEPLOYMENT)).toBe(true);
  });

  it("refuses another participant's id", () => {
    // Without this, anyone holding their own link can unsubscribe every other reviewer by editing
    // one query parameter.
    const token = createUnsubscribeToken('participant', 'p1', DEPLOYMENT);

    expect(verifyUnsubscribeToken(token, 'participant', 'p2', DEPLOYMENT)).toBe(false);
  });

  it('refuses another deployment', () => {
    const token = createUnsubscribeToken('participant', 'p1', DEPLOYMENT);

    expect(verifyUnsubscribeToken(token, 'participant', 'p1', OTHER_DEPLOYMENT)).toBe(false);
  });

  it('refuses a participant token presented as a team mute', () => {
    const token = createUnsubscribeToken('participant', 'shared-id', DEPLOYMENT);

    expect(verifyUnsubscribeToken(token, 'user', 'shared-id', DEPLOYMENT)).toBe(false);
  });

  it('refuses a token signed with a different secret', () => {
    const token = createUnsubscribeToken('participant', 'p1', DEPLOYMENT);
    vi.stubEnv('SESSION_SECRET', 'a-completely-different-secret');

    expect(verifyUnsubscribeToken(token, 'participant', 'p1', DEPLOYMENT)).toBe(false);
  });

  it('refuses malformed input without throwing', () => {
    for (const token of ['', 'not-hex', 'ab', 'z'.repeat(64)]) {
      expect(verifyUnsubscribeToken(token, 'participant', 'p1', DEPLOYMENT)).toBe(false);
    }
  });

  it('cannot be tricked by moving the boundary between the fields', () => {
    // The tuple is joined with a separator that ids cannot contain, so a recipient id ending in the
    // separator cannot borrow a deployment id's bytes.
    const token = createUnsubscribeToken('participant', 'p1', `${DEPLOYMENT}-x`);

    expect(verifyUnsubscribeToken(token, 'participant', 'p1-x', DEPLOYMENT)).toBe(false);
  });
});

describe('createUnsubscribeToken', () => {
  it('refuses to mint a token when no secret is configured', () => {
    // Falling back to a default would make every instance's tokens interchangeable.
    vi.stubEnv('SESSION_SECRET', '');

    expect(() => createUnsubscribeToken('participant', 'p1', DEPLOYMENT)).toThrow();
  });
});
