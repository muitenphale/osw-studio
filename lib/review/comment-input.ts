/**
 * What a review comment is allowed to contain, and who it is allowed to be from.
 *
 * A review copy is reachable by anyone holding its URL, so a POST body is the least trusted input in
 * the feature. Content and identity are decided separately: the body says what the comment is and
 * where it points, and nothing about who wrote it.
 *
 * Identity comes from `resolveCommentAuthorship`, which takes no body parameter at all, so the
 * impersonation guard is in the signature rather than in a filter someone must remember to apply.
 */

import { actsAsTeam, type ReviewAccess } from './access';
import type { ReviewParticipant } from '@/lib/vfs/adapters/review-database';

/**
 * Room for a paragraph of feedback with a quoted snippet, not for using another tenant's review
 * database as file storage. Every accepted comment is durable rows plus a line in an email digest.
 */
export const MAX_COMMENT_BODY = 4000;

/** A path on the reviewed site; longer than this is not one. */
export const MAX_PAGE_PATH = 512;

/** A CSS path deep enough to address any element the overlay can pick. */
export const MAX_SELECTOR = 512;

/** The snippet the comment was anchored to, kept for when the element later moves or is edited. */
export const MAX_ANCHOR_TEXT = 512;

/**
 * Anything that cannot appear in a value this server stores and later hands to a renderer, a
 * mailer or a navigation. Nothing the widget produces contains one, so a control character is
 * always a caller doing something other than commenting on a page.
 */
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

/**
 * Whether a value is a path on the reviewed site rather than a string that merely fits in the
 * column.
 *
 * The value is stored, rendered in the digest and the studio inbox, and interpolated into the link
 * the studio opens, so its shape is settled at the boundary.
 *
 * Rejected rather than repaired: the widget sends `location.pathname`, so anything else is a client
 * bug or a hand-rolled request, and rewriting it would hide both. A leading `//` is refused too,
 * being a protocol-relative URL rather than a path.
 */
export function isValidReviewPagePath(value: string): boolean {
  if (typeof value !== 'string') return false;
  if (value.length === 0 || value.length > MAX_PAGE_PATH) return false;
  if (value[0] !== '/' || value.startsWith('//')) return false;
  if (CONTROL_CHARACTERS.test(value)) return false;
  // A backslash is not a separator here, and treating it as one is how a traversal gets past a
  // check that only looks at forward-slash segments.
  if (value.includes('\\')) return false;
  // A query or a fragment is not part of a page path. The widget derives this from
  // `window.location.pathname`, which carries neither, so anything holding one was hand-posted 
  // and it would corrupt the URLs this value is later interpolated into, including the studio's
  // link to a single comment.
  if (value.includes('?') || value.includes('#')) return false;
  return !value.split('/').includes('..');
}

/**
 * A cheap sanity check on a stored CSS selector.
 *
 * Not a parse: there is no DOM here, and the widget already treats an unparseable selector as
 * matching nothing. This refuses only the two shapes the overlay cannot have produced, a control
 * character and pure whitespace.
 */
function isPlausibleSelector(value: string): boolean {
  return value.trim().length > 0 && !CONTROL_CHARACTERS.test(value);
}

/** Shown when someone comments before naming themselves; replaced as soon as they do. */
const FALLBACK_AUTHOR_NAME = { participant: 'Guest', team: 'Team' } as const;

/**
 * The content half of a comment. There is no author, participant or team field on this type, and
 * that absence is the point, see the module comment.
 */
export interface ReviewCommentInput {
  body: string;
  pagePath: string;
  selector: string | undefined;
  anchorText: string | undefined;
  parentId: string | undefined;
}

export type CommentInputResult =
  | { ok: true; value: ReviewCommentInput }
  | { ok: false; error: string };

function asRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
}

/**
 * Read one optional string field, capped.
 *
 * A non-string is refused rather than coerced: `String({})` would store "[object Object]" and
 * `String(12)` would quietly accept a number as a selector, both of which hide a client bug in the
 * database instead of reporting it.
 */
function optionalString(
  value: unknown,
  max: number,
  field: string
): { ok: true; value: string | undefined } | { ok: false; error: string } {
  if (value === undefined || value === null || value === '') return { ok: true, value: undefined };
  if (typeof value !== 'string') return { ok: false, error: `${field} must be a string` };
  if (value.length > max) return { ok: false, error: `${field} exceeds ${max} characters` };
  return { ok: true, value };
}

/**
 * Validate a comment POST body into the fields that may be written.
 *
 * The result is built field by field rather than by spreading and deleting, so a field nobody
 * thought about cannot arrive at `createComment` by default.
 */
export function validateCommentInput(raw: unknown): CommentInputResult {
  const input = asRecord(raw);

  const body = input.body;
  if (typeof body !== 'string' || body.trim().length === 0) {
    return { ok: false, error: 'body is required' };
  }
  if (body.length > MAX_COMMENT_BODY) {
    return { ok: false, error: `body exceeds ${MAX_COMMENT_BODY} characters` };
  }

  const pagePath = input.page_path;
  if (typeof pagePath !== 'string' || pagePath.length === 0) {
    return { ok: false, error: 'page_path is required' };
  }
  if (pagePath.length > MAX_PAGE_PATH) {
    return { ok: false, error: `page_path exceeds ${MAX_PAGE_PATH} characters` };
  }
  if (!isValidReviewPagePath(pagePath)) {
    return { ok: false, error: 'page_path must be a path on the reviewed site' };
  }

  const selector = optionalString(input.selector, MAX_SELECTOR, 'selector');
  if (!selector.ok) return selector;
  if (selector.value !== undefined && !isPlausibleSelector(selector.value)) {
    return { ok: false, error: 'selector is not a usable CSS selector' };
  }

  const anchorText = optionalString(input.anchor_text, MAX_ANCHOR_TEXT, 'anchor_text');
  if (!anchorText.ok) return anchorText;

  // Capped at the selector length for want of a better bound; a parent id is a UUID, and anything
  // longer is not one. Existence is checked separately, against this deployment's database.
  const parentId = optionalString(input.parent_id, MAX_SELECTOR, 'parent_id');
  if (!parentId.ok) return parentId;

  return {
    ok: true,
    value: {
      body: body.trim(),
      // Stored exactly as validated. Trimming afterwards would mean accepting a value that failed
      // the shape check and then making it pass, the repair isValidReviewPagePath refuses.
      pagePath,
      selector: selector.value,
      anchorText: anchorText.value,
      parentId: parentId.value,
    },
  };
}

export interface CommentAuthorship {
  participantId: string;
  authorName: string;
  isTeam: boolean;
}

/**
 * Decide who a comment is from.
 *
 * The participant id is the one the access layer verified out of a signed cookie or an account
 * session, never the id on the row that came back, so a lookup returning the wrong row cannot
 * redirect attribution.
 *
 * `isTeam` comes from the access result, not the stored row: the row's flag is a cached copy of what
 * the session re-establishes on every request.
 *
 * It means "may act as the agency", not "has an account here". A viewer-level member may comment,
 * but it is stored as an ordinary participant's, with no team badge, since the badge tells the client
 * they are reading the agency's answer.
 */
export function resolveCommentAuthorship(
  access: ReviewAccess,
  participant: ReviewParticipant | null
): CommentAuthorship {
  const isTeam = actsAsTeam(access);
  const participantId = access.kind === 'denied' ? '' : access.participantId;

  return {
    participantId,
    authorName:
      participant?.displayName?.trim() ||
      (isTeam ? FALLBACK_AUTHOR_NAME.team : FALLBACK_AUTHOR_NAME.participant),
    isTeam,
  };
}

/** Just enough of ReviewDatabase to look a parent up; keeps this testable against a temp database. */
export interface ParentCommentLookup {
  getComment(id: string): { id: string } | null;
}

export type ParentCommentResult =
  | { ok: true; parentId: string | undefined }
  | { ok: false; error: string };

/**
 * Confirm a reply's parent exists in *this* deployment's review database.
 *
 * Review data is per-deployment, so an id from another deployment is simply absent here. Writing it
 * through unchecked would leave a dangling reference that renders as an orphan thread, and, since
 * ids are guessable in bulk, would let one review copy be used to probe which ids exist elsewhere.
 */
export function resolveParentComment(
  parentId: string | undefined,
  lookup: ParentCommentLookup
): ParentCommentResult {
  if (!parentId) return { ok: true, parentId: undefined };

  const parent = lookup.getComment(parentId);
  if (!parent) return { ok: false, error: 'parent_id does not exist in this deployment' };

  return { ok: true, parentId: parent.id };
}
