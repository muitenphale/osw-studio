/**
 * What a participant may say about themselves.
 *
 * Two fields, both from an untrusted caller: the name their comments are attributed to, and an
 * optional address the comment digest is sent to.
 *
 * The address is the reason this module is strict. It is stored now and interpolated into an
 * outgoing message later, and a value that only fails at send time has already been persisted and
 * handed to the mailer — by which point a newline in it is a forged header and a comma in it is a
 * second recipient. Rejecting at the boundary is the only place where refusing is free.
 *
 * The caller's participant id is deliberately not part of this type. It comes from the verified
 * access result, so a body-supplied id has nowhere to land rather than needing to be stripped.
 */

/** A display name, not a biography; it renders on every comment in the thread. */
export const MAX_DISPLAY_NAME = 80;

/** RFC 5321's maximum reverse-path length, so an address that fits here fits in an envelope. */
export const MAX_EMAIL = 254;

/** RFC 5321's maximum local part. */
const MAX_EMAIL_LOCAL = 64;

/**
 * Dot-separated atoms either side of a single `@`, with at least one dot in the domain.
 *
 * Deliberately narrower than the addresses RFC 5322 permits: quoted local parts, comments and
 * bare-hostname domains are all legal and none of them are what a client types into a review
 * sidebar. The characters this excludes are exactly the ones that change an address's meaning to a
 * mail transfer agent.
 */
const EMAIL_PATTERN =
  /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;

/**
 * Anything that would let an address carry a second instruction into an SMTP envelope or a header.
 *
 * Checked separately from the pattern even though the pattern already excludes them, because this
 * is the property that has to survive anyone later relaxing the pattern to accommodate a customer's
 * unusual address.
 */
const HEADER_INJECTION = /[\r\n\t\0,;<>"()[\]\\ ]/;

export function isValidReviewEmail(value: string): boolean {
  if (typeof value !== 'string') return false;
  if (value.length === 0 || value.length > MAX_EMAIL) return false;
  if (HEADER_INJECTION.test(value)) return false;
  if (!EMAIL_PATTERN.test(value)) return false;

  const [local] = value.split('@');
  return local.length <= MAX_EMAIL_LOCAL;
}

export interface ReviewParticipantProfile {
  displayName: string;
  email: string | undefined;
}

export type ParticipantProfileResult =
  | { ok: true; value: ReviewParticipantProfile }
  | { ok: false; error: string };

/**
 * Validate a participant PATCH body into the two fields a participant owns about themselves.
 *
 * Built field by field rather than by spreading, so an id, a team flag, or anything else the body
 * carries has no route through: the returned value has room for a name and an address and nothing
 * else.
 */
export function validateParticipantProfile(raw: unknown): ParticipantProfileResult {
  const input = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};

  const displayName = input.display_name;
  if (typeof displayName !== 'string' || displayName.trim().length === 0) {
    return { ok: false, error: 'display_name is required' };
  }
  if (displayName.length > MAX_DISPLAY_NAME) {
    return { ok: false, error: `display_name exceeds ${MAX_DISPLAY_NAME} characters` };
  }

  const rawEmail = input.email;
  if (rawEmail === undefined || rawEmail === null || rawEmail === '') {
    return { ok: true, value: { displayName: displayName.trim(), email: undefined } };
  }
  if (typeof rawEmail !== 'string') {
    return { ok: false, error: 'email must be a string' };
  }

  // Trimmed before validating so a stray space pasted from an email client is a non-event, but the
  // check that follows is on the exact string that will be stored.
  const email = rawEmail.trim();
  if (!isValidReviewEmail(email)) {
    return { ok: false, error: 'email is not a valid address' };
  }

  return { ok: true, value: { displayName: displayName.trim(), email } };
}
