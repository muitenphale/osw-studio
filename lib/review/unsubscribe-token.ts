/**
 * The token in an opt-out link.
 *
 * A digest goes to someone with no account who cannot be asked to sign in, so the link is the whole
 * of the authorisation. The token names one recipient on one deployment: a broader one would let
 * whoever received it silence the other reviewers, or reach across tenants.
 *
 * Keyed on SESSION_SECRET, so an instance has one secret to rotate. Signed rather than encrypted,
 * since the ids are already known to whoever holds the link.
 */

import { createHmac, timingSafeEqual } from 'crypto';

/** `participant` is a reviewer unsubscribing; `user` is a workspace member muting a deployment. */
export type UnsubscribeKind = 'participant' | 'user';

/**
 * A byte that cannot occur in a recipient id, a deployment id or the kind.
 *
 * Concatenating the three with a character any of them could contain would let one field borrow
 * another's bytes: `p1` on `dep-2` and `p1-dep` on `2` would sign the same string.
 */
const FIELD_SEPARATOR = '\n';

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value) {
    throw new Error('SESSION_SECRET environment variable not set');
  }
  return value;
}

function sign(kind: UnsubscribeKind, recipientId: string, deploymentId: string): string {
  return createHmac('sha256', secret())
    .update([kind, deploymentId, recipientId].join(FIELD_SEPARATOR))
    .digest('hex');
}

export function createUnsubscribeToken(
  kind: UnsubscribeKind,
  recipientId: string,
  deploymentId: string
): string {
  return sign(kind, recipientId, deploymentId);
}

/**
 * Whether this token was minted for exactly this kind, recipient and deployment.
 *
 * Never throws: it is reached from a route handling a link a mail client may have mangled, and a
 * malformed token is a refusal rather than a 500.
 */
export function verifyUnsubscribeToken(
  token: string,
  kind: UnsubscribeKind,
  recipientId: string,
  deploymentId: string
): boolean {
  try {
    const expected = Buffer.from(sign(kind, recipientId, deploymentId), 'utf8');
    const presented = Buffer.from(token, 'utf8');
    // Length is checked first because timingSafeEqual throws on a mismatch, and the length of a
    // hex digest is not a secret.
    if (expected.length !== presented.length) return false;
    return timingSafeEqual(expected, presented);
  } catch {
    return false;
  }
}
