/**
 * Merges a review block from a request body over the stored one.
 *
 * The deployment a client holds came out of `toPublicDeployment`, which removes `passwordHash` and
 * puts `reviewPasswordSet` in its place. A GET-then-PUT round trip therefore carries a review block
 * that legitimately has no hash in it, and spreading that over the stored record would unlock the
 * review site without anyone asking for it. The hash is server-owned state: an absent field means
 * "leave it as it was", never "remove it".
 *
 * The hash is server-owned in the stronger sense too — a body never supplies one. The password
 * arrives as plaintext under `review.password`, the route hashes it, and the resolved value reaches
 * this function as the `passwordHash` argument. That keeps the cost factor and the length rule on
 * the server, where a client cannot install a hash of a password the server never saw. A `password`
 * or `passwordHash` field in the body is dropped here, the same silent treatment the read-only
 * `reviewPasswordSet` projection gets: a round trip that echoes back a field the server owns is a
 * normal request, not a caller error.
 *
 * Clearing the password is a deliberate act, so it needs its own signal — the body sends
 * `password: null`, which the route resolves to a `null` hash argument.
 */
import type { ReviewConfig } from '@/lib/vfs/types';

/** Signals a malformed review block in a request body, so a route can answer 400 rather than 500. */
export class InvalidReviewConfigError extends Error {}

/** Matches the account password rule in the register route. */
export const MIN_REVIEW_PASSWORD_LENGTH = 8;

/** What a request body asks be done with the stored hash. */
export type ReviewPasswordUpdate =
  | { kind: 'keep' }
  | { kind: 'clear' }
  | { kind: 'set'; password: string };

/**
 * Reads the password intent out of a review block, without hashing anything.
 *
 * Split out so the rule about what a body may ask for stays synchronous and testable next to the
 * merge; the route pairs it with `hashPassword`, which is the only async step.
 */
export function readReviewPasswordUpdate(incoming: unknown): ReviewPasswordUpdate {
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
    return { kind: 'keep' };
  }

  const { password } = incoming as { password?: unknown };

  if (password === undefined) {
    return { kind: 'keep' };
  }

  if (password === null) {
    return { kind: 'clear' };
  }

  if (typeof password !== 'string') {
    throw new InvalidReviewConfigError('review.password must be a string');
  }

  if (password.length < MIN_REVIEW_PASSWORD_LENGTH) {
    throw new InvalidReviewConfigError(
      `Review password must be at least ${MIN_REVIEW_PASSWORD_LENGTH} characters`
    );
  }

  return { kind: 'set', password };
}

/**
 * @param passwordHash A hash to store, `null` to clear the stored one, or omitted to leave it be.
 */
export function mergeReviewConfig(
  stored: ReviewConfig | undefined,
  incoming: unknown,
  passwordHash?: string | null
): ReviewConfig {
  const base: ReviewConfig = { enabled: false, ...stored };

  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
    return base;
  }

  // Everything destructured out here is server-owned or a read-only projection, and none of it is
  // taken from the body. See the header note.
  const {
    passwordHash: _bodyPasswordHash,
    password: _password,
    reviewPasswordSet: _reviewPasswordSet,
    ...rest
  } = incoming as Partial<ReviewConfig> & {
    passwordHash?: unknown;
    password?: unknown;
    reviewPasswordSet?: unknown;
  };

  const merged: ReviewConfig = { ...base, ...rest };

  if (passwordHash === null) {
    delete merged.passwordHash;
  } else if (passwordHash !== undefined) {
    merged.passwordHash = passwordHash;
  }

  return merged;
}

/**
 * Whether a review change alters what a publish would produce.
 *
 * Only `enabled` does: the static build writes or removes the review copy of the site on that flag
 * alone. The password and the expiry are read at request time by the review access layer and take
 * effect immediately, so counting them as a settings change would show an "unpublished changes"
 * prompt for something already live.
 */
export function reviewChangeNeedsRepublish(
  stored: ReviewConfig | undefined,
  merged: ReviewConfig
): boolean {
  return (stored?.enabled === true) !== (merged.enabled === true);
}
