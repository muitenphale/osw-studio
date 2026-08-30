/**
 * Turning an owed digest into a message.
 *
 * The plain-text part is the message. The HTML part is generated from it, line for line, so a
 * recipient reading in a text-only client, or a client that strips HTML, which several corporate
 * gateways do, loses nothing but the formatting. Written the other way round, the two parts drift
 * the first time someone adds a link to only one of them.
 *
 * That construction also gives the escaping a single point. Everything reaching this module that a
 * reviewer could have typed, a comment body, a display name, a deployment name, is assembled into
 * text, and the one function that turns text into HTML escapes all of it. There is no branch where
 * an author forgot.
 */

import { escapeHtml } from '@/lib/publishing/escape-html';
import type { OwedMessage } from './digest';
import type { ReviewComment } from '@/lib/vfs/adapters/review-database';

export interface DigestRenderInput {
  message: OwedMessage;
  /** Workspace-member-controlled, and it reaches the subject line. See `subjectLine`. */
  deploymentName: string;
  /** The owed comments, oldest first. */
  comments: ReviewComment[];
  /** Parents of those comments, for the quote above a reply. Only used for participant digests. */
  parents?: ReviewComment[];
  /** The review copy for a participant, the deployment's Review page for the team. */
  destinationUrl: string;
  /** Unsubscribe for a participant, mute for the team. */
  optOutUrl: string;
}

export interface RenderedDigest {
  subject: string;
  text: string;
  html: string;
}

/**
 * Collapse a value to one line for use in a header.
 *
 * The subject carries the deployment name, which a workspace member chose and which is therefore
 * only as well-formed as they made it. Header *encoding*, non-ASCII names, folding, the RFC 2047
 * word wrapping, is nodemailer's job at send time, and this module deliberately relies on it
 * rather than reimplementing it. What is not delegated is line structure: a CR or LF in a header
 * value is how a second header gets injected, and refusing it here costs nothing and does not
 * depend on which mailer eventually picks the message up.
 */
function headerSafe(value: string): string {
  return value.replace(/[\r\n\t]+/g, ' ').trim();
}

function subjectLine(input: DigestRenderInput): string {
  const name = headerSafe(input.deploymentName);

  if (input.message.recipientKind === 'user') {
    const count = input.comments.length;
    return `${count} new comment${count === 1 ? '' : 's'} on ${name}`;
  }

  const authors = [...new Set(input.comments.map((comment) => comment.authorName))];
  if (authors.length === 1) {
    return headerSafe(`${authors[0]} replied to your comment on ${name}`);
  }
  return `${input.comments.length} new replies on ${name}`;
}

/** Quote a body the way mail has quoted for forty years, so a text client shows it as a quote. */
function quote(body: string): string {
  return body
    .split('\n')
    .map((line) => `> ${line}`.trimEnd())
    .join('\n');
}

function textBody(input: DigestRenderInput): string {
  const isTeam = input.message.recipientKind === 'user';
  const parents = new Map((input.parents ?? []).map((parent) => [parent.id, parent]));

  const blocks: string[] = [];
  blocks.push(`${subjectLine(input)}.`);

  for (const comment of input.comments) {
    // Only a participant digest quotes: it is a reply to a thread they are in, and the quote is
    // what tells them which of their comments it answers. A team digest is a list of new feedback,
    // where the same quote would just be the previous entry repeated.
    if (!isTeam && comment.parentId) {
      const parent = parents.get(comment.parentId);
      if (parent) {
        // Its own block, so the HTML derivation sees a run of quote lines and can mark it up as a
        // quotation rather than as another paragraph.
        blocks.push(`In reply to ${parent.authorName}:`);
        blocks.push(quote(parent.body));
      }
    }
    blocks.push(`${comment.authorName} — ${comment.pagePath}\n${comment.body.trimEnd()}`);
  }

  blocks.push(`${isTeam ? 'Open the review:' : 'Open the review copy:'}\n${input.destinationUrl}`);
  blocks.push(
    `${
      isTeam
        ? 'To mute notifications for this review:'
        : 'To stop receiving these emails:'
    }\n${input.optOutUrl}`
  );

  return blocks.join('\n\n');
}

/**
 * A URL on a line of its own becomes a link; anything else stays text.
 *
 * Deliberately not a general linkifier over the whole body. A comment body is attacker-authorable,
 * and scanning it for anything URL-shaped would let a reviewer place a clickable link, with text of
 * their choosing around it, into a message the agency's own tooling sent. A line this module wrote
 * is a link; a line somebody typed is not, unless it is nothing but a URL, which is what every mail
 * client would do with it anyway.
 */
function linkify(escapedLine: string): string {
  if (!/^https?:\/\/\S+$/.test(escapedLine)) return escapedLine;
  return `<a href="${escapedLine}">${escapedLine}</a>`;
}

/**
 * The HTML part, derived from the finished text so the two cannot say different things.
 *
 * Escaping happens once, over the whole text, before any markup is added, so every comment body
 * and display name in it is escaped by construction rather than by a call somebody has to remember.
 */
function htmlFromText(text: string): string {
  const blocks = escapeHtml(text).split(/\n{2,}/);

  return blocks
    .map((block) => {
      const lines = block.split('\n').map(linkify);
      const quoted = lines.every((line) => line.startsWith('&gt;'));
      const inner = lines.map((line) => (quoted ? line.replace(/^&gt;\s?/, '') : line)).join('<br>');
      return quoted ? `<blockquote>${inner}</blockquote>` : `<p>${inner}</p>`;
    })
    .join('\n');
}

export function renderDigest(input: DigestRenderInput): RenderedDigest {
  const text = textBody(input);
  return {
    subject: subjectLine(input),
    text,
    html: htmlFromText(text),
  };
}
