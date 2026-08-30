/**
 * The shape review data takes on the wire.
 *
 * The GET response is rendered by a page that any holder of the review URL can open, so the
 * question is not "may this caller see the comments", they may, that is the feature, but "what
 * else comes along with them". A participant who could read the other participants out of the
 * response would be harvesting an agency's entire client list from a link they were forwarded.
 *
 * Redaction is therefore unconditional rather than branched on the caller. `WireParticipant` has no
 * email field for anyone, team included: nothing in a comment thread renders an address, a team
 * member who needs one has it in the workspace-authorised deployment settings, and a shape with no
 * branch cannot be got wrong by a caller that resolves access slightly differently. The addresses
 * exist for the digest mailer, which reads them server-side and never through this.
 */

import type { ReviewComment, ReviewParticipant } from '@/lib/vfs/adapters/review-database';

/**
 * The most comments one response will carry.
 *
 * Nothing caps how many a deployment accumulates: the write gate paces one caller at 60 writes per
 * ten minutes, and every one of them is a permanent row that every later list returns in full. A
 * review round on a real site is tens of comments including replies, so 500 is roughly ten rounds
 * of a large multi-page site, past any genuine use, and short of the point where the response is
 * the largest thing the instance sends. Typical comments are a sentence, so 500 of them is a few
 * hundred kilobytes; the 4000-character ceiling on a body puts the worst case near two megabytes,
 * which is bounded rather than open-ended.
 *
 * Whoever reads a capped list is told so, and reads the *most recent* comments, see the route.
 * Truncating silently would present a partial thread as the whole conversation, which on a page
 * whose entire purpose is "here is what the client said" is worse than a slow response.
 */
export const MAX_LISTED_COMMENTS = 500;

export interface WireParticipant {
  id: string;
  display_name: string;
  is_team: boolean;
}

export interface WireComment {
  id: string;
  parent_id: string | null;
  participant_id: string;
  author_name: string;
  is_team: boolean;
  page_path: string;
  selector: string | null;
  anchor_text: string | null;
  body: string;
  status: string;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
}

/** Everything a comment attribution renders, and nothing that identifies the person off-site. */
export function toWireParticipant(participant: ReviewParticipant): WireParticipant {
  return {
    id: participant.id,
    display_name: participant.displayName,
    is_team: participant.isTeam,
  };
}

export function toWireParticipants(participants: ReviewParticipant[]): WireParticipant[] {
  return participants.map(toWireParticipant);
}

export function toWireComment(comment: ReviewComment): WireComment {
  return {
    id: comment.id,
    parent_id: comment.parentId,
    participant_id: comment.participantId,
    author_name: comment.authorName,
    is_team: comment.isTeam,
    page_path: comment.pagePath,
    selector: comment.selector,
    anchor_text: comment.anchorText,
    body: comment.body,
    status: comment.status,
    created_at: comment.createdAt,
    resolved_at: comment.resolvedAt,
    resolved_by: comment.resolvedBy,
  };
}

export function toWireComments(comments: ReviewComment[]): WireComment[] {
  return comments.map(toWireComment);
}
