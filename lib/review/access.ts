/**
 * Who may see a review copy, and under which identity.
 *
 * Two kinds of caller reach the same pages by different doors. A client has no OSW Studio account
 * and carries only the review cookie this instance minted for them. A team member carries the
 * normal account session and is authorised through the same workspace check every other
 * deployment-addressed route uses, so review adds no second, weaker path into a tenant's data.
 *
 * Everything here is a read of server-held state: the deployment record decides whether review is
 * open, and the signature on the cookie decides who the caller is. No field supplied by the caller
 * is taken at face value.
 */

import 'server-only';

import { requireDeploymentAccess } from '@/lib/api/deployment-access';
import { getSession } from '@/lib/auth/session';
import { resolveDeployment } from '@/lib/vfs/adapters/deployment-adapter';
import type { ReviewConfig } from '@/lib/vfs/types';
import { reviewCookieName, verifyReviewSession } from './session';

export type ReviewAccess =
  | { kind: 'participant'; participantId: string }
  | { kind: 'team'; participantId: string; userId: string }
  | { kind: 'denied' };

/**
 * Anything that can produce a cookie: a NextRequest (cookie jar) or a plain Request (raw header).
 */
type CookieSource = {
  cookies?: { get(name: string): { value: string } | undefined };
  headers?: { get(name: string): string | null };
};

/**
 * More candidates than this is not a browser sending cookies, it is someone making the server work;
 * every extra one costs a signature check.
 */
const MAX_COOKIE_CANDIDATES = 8;

/**
 * Every cookie of this name, not just the first.
 *
 * Published sites are attacker-authorable HTML served from this same origin, so a script on one can
 * set a second `osw_review_{id}` cookie holding a token it minted for itself. Duplicate names at
 * equal path have no defined precedence, so taking whichever arrives first would let that script
 * pin a visitor to its own participant id and collect their comments under it. The jar is read too,
 * because a NextRequest collapses duplicates and may hold a value the raw header does not.
 */
function readCookies(request: CookieSource, name: string): string[] {
  const values: string[] = [];

  const header = request.headers?.get('cookie');
  if (header) {
    for (const pair of header.split(';')) {
      const separator = pair.indexOf('=');
      if (separator === -1) continue;
      if (pair.slice(0, separator).trim() !== name) continue;
      values.push(decodeURIComponent(pair.slice(separator + 1).trim()));
    }
  }

  const fromJar = request.cookies?.get(name)?.value;
  if (fromJar && !values.includes(fromJar)) values.push(fromJar);

  return values.slice(0, MAX_COOKIE_CANDIDATES);
}

/**
 * Evaluated per request rather than once at entry, so a tab that was open when the deadline passed
 * stops working on its next call instead of running until its cookie happens to lapse.
 *
 * A deadline that will not parse is treated as closed: the alternative is serving a review copy on
 * the strength of a value nobody can interpret.
 */
export function isReviewExpired(review: ReviewConfig): boolean {
  if (!review.expiresAt) return false;
  const deadline = Date.parse(review.expiresAt);
  if (Number.isNaN(deadline)) return true;
  return deadline <= Date.now();
}

/** The first presented cookie that actually verifies for this deployment, if any. */
async function resolveParticipant(
  deploymentId: string,
  review: ReviewConfig,
  request: CookieSource
): Promise<ReviewAccess | null> {
  for (const token of readCookies(request, reviewCookieName(deploymentId))) {
    // The participant id comes out of the verified payload, never off the wire: a caller can
    // present a cookie, but only one this server signed for this deployment carries an identity.
    const session = await verifyReviewSession(token, deploymentId, review);
    if (session) return { kind: 'participant', participantId: session.participantId };
  }
  return null;
}

/**
 * Resolve who is asking for a deployment's review copy.
 *
 * Review being switched off is absolute — that copy is not published to anyone, team included.
 * Expiry is not: it is the owner closing the round to their client, so a team member with workspace
 * access still gets in afterwards to read the comments that came out of it and to reopen the round.
 * Locking the owner out of their own deployment on a date they set for someone else would be the
 * wrong end of the same rule.
 *
 * The account is checked before the cookie because a team member who once went through the password
 * gate is still holding a participant cookie. Reading that first would attribute their comments to
 * an anonymous UUID and hide anything the UI shows only to the team.
 */
export async function resolveReviewAccess(
  deploymentId: string,
  request: CookieSource
): Promise<ReviewAccess> {
  const resolved = await resolveDeployment(deploymentId);
  const review = resolved?.deployment.review;
  if (!review?.enabled) return { kind: 'denied' };

  // Only worth the workspace lookup when an account session is actually present — an anonymous
  // client is the common case here, and this runs on every asset of every page they open.
  const account = await getSession();
  if (account) {
    const access = await requireDeploymentAccess(deploymentId, 'viewer');
    if (access.ok) {
      // Prefixed so a team member's attributions can never collide with a minted participant id.
      return { kind: 'team', participantId: `user:${account.userId}`, userId: account.userId };
    }
  }

  if (isReviewExpired(review)) return { kind: 'denied' };

  return (await resolveParticipant(deploymentId, review, request)) ?? { kind: 'denied' };
}
