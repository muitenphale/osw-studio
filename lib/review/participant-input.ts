/**
 * What a participant may say about themselves.
 *
 * Two fields from an untrusted caller: the name comments are attributed to, and an optional address
 * the digest goes to.
 *
 * The address is why this is strict. It is stored now and interpolated into a message later, where a
 * newline is a forged header and a comma is a second recipient. The boundary is the only place
 * refusing costs nothing.
 *
 * The participant id is not part of this type: it comes from the verified access result, so a
 * body-supplied one has nowhere to land rather than needing to be stripped.
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
 * Narrower than RFC 5322 permits. Quoted local parts, comments and bare-hostname domains are all
 * legal, none are what a client types into a review sidebar, and the characters excluded are the
 * ones that change an address's meaning to a mail transfer agent.
 */
const EMAIL_PATTERN =
  /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;

/**
 * Anything that would let an address carry a second instruction into an SMTP envelope or a header.
 *
 * Checked separately from the pattern, which already excludes them, so the property survives anyone
 * later relaxing the pattern for an unusual address.
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
 * Built field by field rather than spread, so the result has room for a name and an address and
 * nothing else.
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
