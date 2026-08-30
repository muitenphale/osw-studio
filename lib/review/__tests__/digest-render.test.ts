import { describe, it, expect } from 'vitest';

import { renderDigest } from '../digest-render';
import type { OwedMessage } from '../digest';
import type { ReviewComment } from '@/lib/vfs/adapters/review-database';

/**
 * What a digest actually says.
 *
 * Two properties matter more than the wording. Everything a reader needs is in the plain-text part,
 * because the HTML part is generated from it and cannot therefore carry anything the text does not.
 * And every string that came from a comment or a display name is escaped, because a review copy is
 * open to anyone holding its link and its contents land in somebody's mail client.
 */

const DEPLOYMENT = 'Acme site';
const REVIEW_URL = 'https://osw.example/review/dep-1';
const TEAM_URL = 'https://osw.example/w/ws-1/deployments';
const OPT_OUT = 'https://osw.example/review/dep-1/unsubscribe?id=p1&token=abc';

function comment(fields: {
  id: string;
  authorName: string;
  body: string;
  participantId?: string;
  pagePath?: string;
  parentId?: string;
  isTeam?: boolean;
}): ReviewComment {
  return {
    id: fields.id,
    parentId: fields.parentId ?? null,
    participantId: fields.participantId ?? fields.authorName,
    authorName: fields.authorName,
    isTeam: fields.isTeam ?? false,
    pagePath: fields.pagePath ?? '/index.html',
    selector: null,
    anchorText: null,
    body: fields.body,
    status: 'open',
    createdAt: '2026-01-01T11:00:00Z',
    resolvedAt: null,
    resolvedBy: null,
  };
}

function teamMessage(commentIds: string[]): OwedMessage {
  return {
    recipientKind: 'user',
    recipientId: 'u1',
    toEmail: 'otto@agency.example',
    commentIds,
    throughCommentId: commentIds[commentIds.length - 1],
  };
}

function participantMessage(commentIds: string[]): OwedMessage {
  return {
    recipientKind: 'participant',
    recipientId: 'p1',
    toEmail: 'sam@client.example',
    commentIds,
    throughCommentId: commentIds[commentIds.length - 1],
  };
}

describe('subject', () => {
  it('counts the comments for a team digest', () => {
    const rendered = renderDigest({
      message: teamMessage(['c1', 'c2']),
      deploymentName: DEPLOYMENT,
      comments: [
        comment({ id: 'c1', authorName: 'Sam', body: 'The hero image is too small.' }),
        comment({ id: 'c2', authorName: 'Sam', body: 'Typo in the second column.' }),
      ],
      destinationUrl: TEAM_URL,
      optOutUrl: OPT_OUT,
    });

    expect(rendered.subject).toBe('2 new comments on Acme site');
  });

  it('reads as one comment when there is one', () => {
    const rendered = renderDigest({
      message: teamMessage(['c1']),
      deploymentName: DEPLOYMENT,
      comments: [comment({ id: 'c1', authorName: 'Sam', body: 'Too small.' })],
      destinationUrl: TEAM_URL,
      optOutUrl: OPT_OUT,
    });

    expect(rendered.subject).toBe('1 new comment on Acme site');
  });

  it('names the replier for a participant digest', () => {
    const rendered = renderDigest({
      message: participantMessage(['r1']),
      deploymentName: DEPLOYMENT,
      comments: [
        comment({ id: 'r1', authorName: 'Otto', body: 'Done.', isTeam: true, parentId: 'c1' }),
      ],
      destinationUrl: REVIEW_URL,
      optOutUrl: OPT_OUT,
    });

    expect(rendered.subject).toBe('Otto replied to your comment on Acme site');
  });

  it('keeps a deployment name that spans lines to a single header line', () => {
    // The name is workspace-member-controlled and reaches a header. Nodemailer encodes headers, but
    // a subject is one line by construction here as well.
    const rendered = renderDigest({
      message: teamMessage(['c1']),
      deploymentName: 'Acme\r\nBcc: someone@example.test',
      comments: [comment({ id: 'c1', authorName: 'Sam', body: 'Hi.' })],
      destinationUrl: TEAM_URL,
      optOutUrl: OPT_OUT,
    });

    expect(rendered.subject).not.toMatch(/[\r\n]/);
    expect(rendered.subject).toContain('Acme Bcc: someone@example.test');
  });
});

describe('body', () => {
  it('carries every comment, its author and its page in the text part', () => {
    const rendered = renderDigest({
      message: teamMessage(['c1', 'c2']),
      deploymentName: DEPLOYMENT,
      comments: [
        comment({ id: 'c1', authorName: 'Sam', body: 'The hero image is too small.' }),
        comment({
          id: 'c2',
          authorName: 'Mira',
          body: 'Typo in the second column.',
          pagePath: '/pricing.html',
        }),
      ],
      destinationUrl: TEAM_URL,
      optOutUrl: OPT_OUT,
    });

    expect(rendered.text).toContain('Sam');
    expect(rendered.text).toContain('The hero image is too small.');
    expect(rendered.text).toContain('Mira');
    expect(rendered.text).toContain('/pricing.html');
    expect(rendered.text).toContain('Typo in the second column.');
  });

  it('quotes the parent in a participant digest', () => {
    const rendered = renderDigest({
      message: participantMessage(['r1']),
      deploymentName: DEPLOYMENT,
      comments: [
        comment({ id: 'r1', authorName: 'Otto', body: 'Done.', isTeam: true, parentId: 'c1' }),
      ],
      parents: [comment({ id: 'c1', authorName: 'Sam', body: 'Can we make the hero bigger?' })],
      destinationUrl: REVIEW_URL,
      optOutUrl: OPT_OUT,
    });

    expect(rendered.text).toContain('> Can we make the hero bigger?');
  });

  it('sends a participant to the review copy and offers an unsubscribe', () => {
    const rendered = renderDigest({
      message: participantMessage(['r1']),
      deploymentName: DEPLOYMENT,
      comments: [comment({ id: 'r1', authorName: 'Otto', body: 'Done.', isTeam: true })],
      destinationUrl: REVIEW_URL,
      optOutUrl: OPT_OUT,
    });

    expect(rendered.text).toContain(REVIEW_URL);
    expect(rendered.text).toContain(OPT_OUT);
    expect(rendered.text.toLowerCase()).toContain('stop');
  });

  it('sends the team to the review page and offers a mute', () => {
    const rendered = renderDigest({
      message: teamMessage(['c1']),
      deploymentName: DEPLOYMENT,
      comments: [comment({ id: 'c1', authorName: 'Sam', body: 'Too small.' })],
      destinationUrl: TEAM_URL,
      optOutUrl: OPT_OUT,
    });

    expect(rendered.text).toContain(TEAM_URL);
    expect(rendered.text).toContain(OPT_OUT);
    expect(rendered.text.toLowerCase()).toContain('mute');
  });

  it('loses nothing in a text-only client', () => {
    // The HTML part is generated from the text part, so this is a property of the construction
    // rather than of anyone remembering to update both.
    const rendered = renderDigest({
      message: teamMessage(['c1']),
      deploymentName: DEPLOYMENT,
      comments: [comment({ id: 'c1', authorName: 'Sam', body: 'Two lines\nof feedback.' })],
      destinationUrl: TEAM_URL,
      optOutUrl: OPT_OUT,
    });

    const htmlText = rendered.html
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim();

    for (const line of rendered.text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      expect(htmlText).toContain(trimmed.replace(/^> /, '').replace(/\s+/g, ' '));
    }
  });
});

describe('escaping', () => {
  it('escapes a comment body in the HTML part and leaves the text part alone', () => {
    const body = '<script>alert(1)</script> & "quotes"';
    const rendered = renderDigest({
      message: teamMessage(['c1']),
      deploymentName: DEPLOYMENT,
      comments: [comment({ id: 'c1', authorName: 'Sam', body })],
      destinationUrl: TEAM_URL,
      optOutUrl: OPT_OUT,
    });

    expect(rendered.text).toContain(body);
    expect(rendered.html).not.toContain('<script>');
    expect(rendered.html).toContain('&lt;script&gt;');
  });

  it('escapes a display name', () => {
    const rendered = renderDigest({
      message: teamMessage(['c1']),
      deploymentName: DEPLOYMENT,
      comments: [comment({ id: 'c1', authorName: '<img src=x onerror=1>', body: 'Hi.' })],
      destinationUrl: TEAM_URL,
      optOutUrl: OPT_OUT,
    });

    expect(rendered.html).not.toContain('<img');
    expect(rendered.html).toContain('&lt;img');
  });

  it('escapes the deployment name where it appears in the body', () => {
    const rendered = renderDigest({
      message: teamMessage(['c1']),
      deploymentName: '<b>Acme</b>',
      comments: [comment({ id: 'c1', authorName: 'Sam', body: 'Hi.' })],
      destinationUrl: TEAM_URL,
      optOutUrl: OPT_OUT,
    });

    expect(rendered.html).not.toContain('<b>Acme</b>');
    expect(rendered.html).toContain('&lt;b&gt;Acme&lt;/b&gt;');
  });

  it('does not let a comment body forge a link', () => {
    const rendered = renderDigest({
      message: teamMessage(['c1']),
      deploymentName: DEPLOYMENT,
      comments: [
        comment({ id: 'c1', authorName: 'Sam', body: '<a href="https://evil.example">click</a>' }),
      ],
      destinationUrl: TEAM_URL,
      optOutUrl: OPT_OUT,
    });

    expect(rendered.html).not.toContain('<a href="https://evil.example"');
  });
});
