import { describe, it, expect } from 'vitest';
import {
  InvalidReviewConfigError,
  mergeReviewConfig,
  readReviewPasswordUpdate,
} from '@/lib/api/deployment-review-merge';

/**
 * The deployment a client holds has been through `toPublicDeployment`, so its review block has no
 * `passwordHash` at all. A plain spread of that body over the stored record therefore unlocks the
 * review site — the destructive case these tests pin down.
 *
 * The hash itself is server-owned: the body carries a plaintext `password`, the route hashes it,
 * and the resolved hash reaches this merge as an argument. Anything hash-shaped in the body is
 * ignored, which the `passwordHash` tests below assert directly.
 */

describe('mergeReviewConfig', () => {
  it('keeps the stored password hash when the incoming block omits it', () => {
    const merged = mergeReviewConfig(
      { enabled: true, passwordHash: '$2b$10$storedhash', expiresAt: '2030-01-01T00:00:00.000Z' },
      { enabled: true, expiresAt: '2031-01-01T00:00:00.000Z', reviewPasswordSet: true }
    );

    expect(merged.passwordHash).toBe('$2b$10$storedhash');
    expect(merged.expiresAt).toBe('2031-01-01T00:00:00.000Z');
  });

  it('never persists the public-shape reviewPasswordSet flag', () => {
    const merged = mergeReviewConfig(
      { enabled: true, passwordHash: '$2b$10$storedhash' },
      { enabled: false, reviewPasswordSet: true }
    );

    expect(merged).not.toHaveProperty('reviewPasswordSet');
    expect(merged.enabled).toBe(false);
  });

  it('never persists the plaintext password field', () => {
    const merged = mergeReviewConfig(
      { enabled: true },
      { enabled: true, password: 'correct horse battery' },
      '$2b$12$freshhash'
    );

    expect(merged).not.toHaveProperty('password');
    expect(merged.passwordHash).toBe('$2b$12$freshhash');
  });

  it('ignores a body-supplied passwordHash rather than storing it', () => {
    // The hash is server-owned state. Honouring one from a body would let a caller install a hash
    // of a password the server never saw, and hand the cost factor to the client.
    const merged = mergeReviewConfig(
      { enabled: true, passwordHash: '$2b$10$storedhash' },
      { enabled: true, passwordHash: '$2b$10$attackerhash' }
    );

    expect(merged.passwordHash).toBe('$2b$10$storedhash');
  });

  it('ignores a body-supplied passwordHash even when it is null', () => {
    // Clearing is signalled by `password: null`, which the route resolves to an explicit null hash.
    const merged = mergeReviewConfig(
      { enabled: true, passwordHash: '$2b$10$storedhash' },
      { enabled: true, passwordHash: null }
    );

    expect(merged.passwordHash).toBe('$2b$10$storedhash');
  });

  it('stores the resolved hash the caller passes in', () => {
    const merged = mergeReviewConfig(
      { enabled: true, passwordHash: '$2b$10$storedhash' },
      { enabled: true },
      '$2b$12$freshhash'
    );

    expect(merged.passwordHash).toBe('$2b$12$freshhash');
  });

  it('clears the password when the caller passes an explicit null hash', () => {
    const merged = mergeReviewConfig({ enabled: true, passwordHash: '$2b$10$storedhash' }, { enabled: true }, null);

    expect(merged).not.toHaveProperty('passwordHash');
    expect(merged.enabled).toBe(true);
  });

  it('accepts a first review block when nothing is stored yet', () => {
    const merged = mergeReviewConfig(undefined, { enabled: true, notifyByEmail: true });

    expect(merged).toEqual({ enabled: true, notifyByEmail: true });
  });

  it('ignores a non-object review body rather than writing junk', () => {
    const stored = { enabled: true, passwordHash: '$2b$10$storedhash' };

    expect(mergeReviewConfig(stored, null)).toEqual(stored);
    expect(mergeReviewConfig(stored, 'nope')).toEqual(stored);
  });

  it('does not mutate the stored config it was handed', () => {
    // The stored block comes straight off a live deployment record the caller goes on to write, so
    // a merge that assigned into it would corrupt the record even when the result looks right.
    const stored = { enabled: true, passwordHash: '$2b$10$storedhash', notifyByEmail: true };
    const snapshot = structuredClone(stored);

    mergeReviewConfig(stored, { enabled: false, expiresAt: '2030-01-01T00:00:00.000Z' }, null);

    expect(stored).toEqual(snapshot);
  });

  it('leaves a stored hash alone when the body sends an empty review object', () => {
    const merged = mergeReviewConfig({ enabled: true, passwordHash: '$2b$10$storedhash' }, {});

    expect(merged.passwordHash).toBe('$2b$10$storedhash');
    expect(merged.enabled).toBe(true);
  });
});

describe('readReviewPasswordUpdate', () => {
  it('reads a plaintext password as a set', () => {
    expect(readReviewPasswordUpdate({ enabled: true, password: 'correct horse' })).toEqual({
      kind: 'set',
      password: 'correct horse',
    });
  });

  it('reads an explicit null as a clear', () => {
    expect(readReviewPasswordUpdate({ enabled: true, password: null })).toEqual({ kind: 'clear' });
  });

  it('reads an absent password as leave-alone', () => {
    expect(readReviewPasswordUpdate({ enabled: true })).toEqual({ kind: 'keep' });
    expect(readReviewPasswordUpdate(null)).toEqual({ kind: 'keep' });
    expect(readReviewPasswordUpdate('nope')).toEqual({ kind: 'keep' });
  });

  it('rejects a password shorter than the house minimum', () => {
    expect(() => readReviewPasswordUpdate({ password: 'short' })).toThrow(InvalidReviewConfigError);
  });

  it('rejects a password that is not a string', () => {
    expect(() => readReviewPasswordUpdate({ password: 12345678 })).toThrow(InvalidReviewConfigError);
  });
});
