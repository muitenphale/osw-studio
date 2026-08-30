/**
 * Who is owed a review digest, and what is in it.
 *
 * Pure: the clock arrives as `now`, comments and recipients arrive as arrays, and the result is a
 * list of messages the scheduler queues. Deciding who gets mailed about someone else's private
 * feedback fails expensively and silently, so it is settled from arguments rather than from whatever
 * state a database happens to be in.
 */

import type { ReviewComment, ReviewParticipant } from '@/lib/vfs/adapters/review-database';

/**
 * How long the newest unsent comment must have been sitting before a digest goes out.
 *
 * A client working through a page leaves five comments in four minutes. Mailed one at a time that
 * is five notifications about one sitting, which is how a review tool earns a filter rule. Waiting
 * for the burst to end turns it into one message.
 */
export const QUIET_PERIOD_MINUTES = 15;

/**
 * How long the *oldest* unsent comment may wait, whatever else is arriving.
 *
 * The quiet period alone has a hole: a thread with someone commenting every ten minutes never goes
 * quiet, so it would never notify at all, the one case where the team most needs to know. Past
 * this the digest goes out mid-burst and the rest follows in the next one.
 */
export const MAX_HOLD_MINUTES = 120;

/**
 * Not settings. A recipient tuning these would be tuning how loud their colleagues' mail is, and
 * every value is a behaviour someone would then have to reason about in a support thread. Muting
 * and unsubscribing are the knobs; these two are the behaviour.
 */
const QUIET_PERIOD_MS = QUIET_PERIOD_MINUTES * 60_000;
const MAX_HOLD_MS = MAX_HOLD_MINUTES * 60_000;

/**
 * The participant id a signed-in workspace member's comments carry, minted in lib/review/access.ts
 * so a team attribution can never collide with a generated participant id. Repeated rather than
 * imported because that module is `server-only` and this one has no business being.
 */
const TEAM_PARTICIPANT_PREFIX = 'user:';

export interface DigestInput {
  /** Epoch milliseconds. A parameter so the quiet period and the cap are testable without a clock. */
  now: number;
  /**
   * The comments in play. At minimum everything newer than every recipient's watermark; a wider
   * set is safe because each recipient is filtered against their own watermark below, and the
   * scheduler passes the deployment's whole comment list so that a reply to a month-old comment can
   * still find out who else is in its thread.
   */
  comments: ReviewComment[];
  /** The participant rows behind those comments. A participant not listed here is never mailed. */
  participants: ReviewParticipant[];
  /** Workspace members who should hear about client feedback: the `editor` and `owner` roles. */
  teamRecipients: Array<{ userId: string; email: string; muted: boolean }>;
  /** Keyed `${recipientKind}:${recipientId}`. Absent means nothing has ever been sent. */
  watermarks: Map<string, { at: string; muted: boolean }>;
}

export interface OwedMessage {
  recipientKind: 'participant' | 'user';
  recipientId: string;
  toEmail: string;
  commentIds: string[];
  /** The last comment in this message; its timestamp becomes the recipient's new watermark. */
  throughCommentId: string;
}

/**
 * A recipient whose watermark moves without a message being written for them.
 *
 * The result of `skipDigests`, and deliberately not an `OwedMessage` with a flag on it: there is no
 * address, no comment list and nothing to render, because nothing is being said to anybody.
 */
export interface SkippedDigest {
  recipientKind: 'participant' | 'user';
  recipientId: string;
  /** The newest comment they would have been told about; its timestamp becomes their watermark. */
  throughCommentId: string;
}

interface Candidate {
  kind: 'participant' | 'user';
  id: string;
  email: string;
  /**
   * The participant id this recipient's *own* comments carry. Separate from `id` because a team
   * recipient is keyed by user id but writes comments under the `user:` form.
   */
  authorId: string;
  watermark: string;
}

const ISO_SECONDS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

/**
 * Reduce a timestamp to the second, the resolution review comments are stored at.
 *
 * A watermark from `new Date().toISOString()` carries milliseconds, and as text '...:00.000Z' sorts
 * *below* the stored '...:00Z' because '.' precedes 'Z'. Left alone, the comment sitting exactly on
 * the watermark looks new on every run and the recipient is mailed about it for ever.
 *
 * Text comparison rather than Date.parse for the watermark, because that is what the database does
 * and two comparisons of the same pair of values must not disagree.
 */
function toSeconds(value: string): string {
  if (!value) return '';
  if (ISO_SECONDS.test(value)) return value;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return `${new Date(parsed).toISOString().slice(0, 19)}Z`;
}

function key(kind: 'participant' | 'user', id: string): string {
  return `${kind}:${id}`;
}

/**
 * The candidates in a stable order, with everyone who cannot or should not be mailed already gone:
 * no address, notifications off, or muted.
 *
 * A muted recipient is dropped here rather than filtered later, so no code path further down can
 * compose them a message, and because a message is the only thing that moves a watermark, muting
 * cannot advance one. That is the difference between "mute" and "mark everything read": unmuting
 * shows the backlog instead of a hole.
 */
function candidates(input: DigestInput): Candidate[] {
  const result: Candidate[] = [];

  for (const participant of input.participants) {
    if (!participant.notify) continue;
    if (!participant.email) continue;

    const state = input.watermarks.get(key('participant', participant.id));
    if (state?.muted) continue;

    result.push({
      kind: 'participant',
      id: participant.id,
      email: participant.email,
      authorId: participant.id,
      watermark: toSeconds(state?.at ?? ''),
    });
  }

  for (const member of input.teamRecipients) {
    if (!member.email) continue;

    const state = input.watermarks.get(key('user', member.userId));
    // Either flag is enough. They are two records of the same intent, the one the caller already
    // had and the one stored against this deployment, and silence is not a thing to get wrong in
    // the permissive direction.
    if (member.muted || state?.muted) continue;

    result.push({
      kind: 'user',
      id: member.userId,
      email: member.email,
      authorId: `${TEAM_PARTICIPANT_PREFIX}${member.userId}`,
      watermark: toSeconds(state?.at ?? ''),
    });
  }

  return result;
}

/**
 * For every comment, the id of the comment its thread hangs off.
 *
 * A chain that runs out, a reply whose parent is not in `comments`, roots at the last id it could
 * name rather than at the reply itself, so siblings hanging off that same absent parent still group
 * together.
 */
function threadRoots(comments: ReviewComment[]): Map<string, string> {
  const byId = new Map(comments.map((comment) => [comment.id, comment]));
  const roots = new Map<string, string>();

  for (const comment of comments) {
    let current = comment;
    // Bounded by the comment count: a cycle cannot outlast visiting every node once.
    const seen = new Set<string>([current.id]);
    while (current.parentId) {
      const cached = roots.get(current.id);
      if (cached) {
        current = { ...current, id: cached, parentId: null };
        break;
      }
      const parent = byId.get(current.parentId);
      if (!parent) {
        current = { ...current, id: current.parentId, parentId: null };
        break;
      }
      if (seen.has(parent.id)) break;
      seen.add(parent.id);
      current = parent;
    }
    roots.set(comment.id, current.id);
  }

  return roots;
}

/** Everyone who has written in each thread, used to decide who a team reply concerns. */
function threadMembers(
  comments: ReviewComment[],
  roots: Map<string, string>
): Map<string, Set<string>> {
  const members = new Map<string, Set<string>>();

  for (const comment of comments) {
    const root = roots.get(comment.id) ?? comment.id;
    const existing = members.get(root);
    if (existing) existing.add(comment.participantId);
    else members.set(root, new Set([comment.participantId]));
  }

  return members;
}

/**
 * Whether this recipient should hear about this comment.
 *
 * Two rules with different shapes, on purpose. Client feedback is what the team subscribed to, so a
 * reviewer's comment goes to all of them. A team reply is a reply, it goes to the thread it is in
 * and nowhere else. Broadcasting every reply to everyone who ever commented on the deployment is
 * the failure mode that gets a review tool filtered into a folder.
 */
function concerns(
  candidate: Candidate,
  comment: ReviewComment,
  roots: Map<string, string>,
  members: Map<string, Set<string>>
): boolean {
  // Nobody is told about their own comment. Load-bearing for a workspace member who has named
  // themselves in the review sidebar: their reply puts them in the very thread it lands in.
  if (comment.participantId === candidate.authorId) return false;

  if (candidate.kind === 'user') return !comment.isTeam;

  if (!comment.isTeam) return false;
  const root = roots.get(comment.id) ?? comment.id;
  return members.get(root)?.has(candidate.id) === true;
}

/**
 * What each candidate has not been told about yet, oldest first, with the empty ones dropped.
 *
 * Shared by both exits below so that "who is owed what" is decided once. The two exits differ only
 * in what they do with the answer, and a second copy of this filter is how they would start to
 * disagree about which comments a switched-off channel had covered.
 */
function owedByCandidate(input: DigestInput): Array<{ candidate: Candidate; owed: ReviewComment[] }> {
  // Oldest first, ties broken by the order they arrived, so the last comment in a message is the
  // newest one and the watermark it sets covers everything before it.
  const ordered = input.comments
    .map((comment, index) => ({ comment, index }))
    .sort((a, b) =>
      a.comment.createdAt === b.comment.createdAt
        ? a.index - b.index
        : a.comment.createdAt < b.comment.createdAt
          ? -1
          : 1
    )
    .map((entry) => entry.comment);

  const roots = threadRoots(ordered);
  const members = threadMembers(ordered, roots);

  return candidates(input)
    .map((candidate) => ({
      candidate,
      owed: ordered.filter(
        (comment) =>
          toSeconds(comment.createdAt) > candidate.watermark &&
          concerns(candidate, comment, roots, members)
      ),
    }))
    .filter((entry) => entry.owed.length > 0);
}

/**
 * Work out what each recipient is owed, and which of them are owed it *now*.
 *
 * A recipient with nothing owed produces no message, so a run over an unchanged deployment owes
 * nothing and no watermark moves.
 */
export function composeDigests(input: DigestInput): OwedMessage[] {
  const messages: OwedMessage[] = [];

  for (const { candidate, owed } of owedByCandidate(input)) {
    const oldest = Date.parse(owed[0].createdAt);
    const newest = Date.parse(owed[owed.length - 1].createdAt);

    const settled = input.now - newest >= QUIET_PERIOD_MS;
    const held = input.now - oldest >= MAX_HOLD_MS;
    if (!settled && !held) continue;

    messages.push({
      recipientKind: candidate.kind,
      recipientId: candidate.id,
      toEmail: candidate.email,
      commentIds: owed.map((comment) => comment.id),
      throughCommentId: owed[owed.length - 1].id,
    });
  }

  return messages;
}

/**
 * Where each recipient's watermark belongs when the channel is switched off: right up to date, with
 * nothing sent.
 *
 * The opposite of what `candidates` does for a muted recipient, and the difference is deliberate.
 * Muting is one person stepping out of a conversation that is still happening around them, so their
 * watermark stays put and unmuting shows them the backlog. A tier switched off is the whole channel
 * being closed, nobody is having the conversation by mail, and a channel that was off should not
 * have a memory. Without this, turning a workspace's mail back on after a quiet month would fire
 * every accumulated digest at a client in one volley.
 *
 * A muted recipient is still excluded, because `candidates` drops them before this can see them.
 * That is not an oversight: mute is theirs, the switch is the operator's, and neither may quietly
 * become the other.
 *
 * The quiet period and the hold cap are not weighed here. Both exist to decide when a *message* is
 * worth writing, by waiting for a burst to end; there is no message, so there is nothing to batch
 * and nothing to wait for. Anything already written is covered.
 */
export function skipDigests(input: DigestInput): SkippedDigest[] {
  return owedByCandidate(input).map(({ candidate, owed }) => ({
    recipientKind: candidate.kind,
    recipientId: candidate.id,
    throughCommentId: owed[owed.length - 1].id,
  }));
}
