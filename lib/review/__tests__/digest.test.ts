import { describe, it, expect } from 'vitest';

import { composeDigests, skipDigests, QUIET_PERIOD_MINUTES, MAX_HOLD_MINUTES } from '../digest';
import type { DigestInput } from '../digest';
import type { ReviewComment, ReviewParticipant } from '@/lib/vfs/adapters/review-database';

/**
 * Who is owed a digest, and when.
 *
 * Everything here runs without a database, a clock or a network: `now` is a parameter and the
 * comments are literals. That is the point of the split — the half that decides who gets mailed is
 * the half where a mistake is expensive and invisible, so it is the half that has to be provable
 * from a table of inputs.
 */

const NOW = Date.parse('2026-01-01T12:00:00Z');

/** Stored review timestamps are ISO at second resolution; nothing here may carry milliseconds. */
function minutesAgo(minutes: number): string {
  return `${new Date(NOW - minutes * 60_000).toISOString().slice(0, 19)}Z`;
}

function comment(fields: {
  id: string;
  participantId: string;
  minutesOld: number;
  isTeam?: boolean;
  parentId?: string;
  body?: string;
  authorName?: string;
}): ReviewComment {
  return {
    id: fields.id,
    parentId: fields.parentId ?? null,
    participantId: fields.participantId,
    authorName: fields.authorName ?? fields.participantId,
    isTeam: fields.isTeam ?? false,
    pagePath: '/index.html',
    selector: null,
    anchorText: null,
    body: fields.body ?? 'Some feedback.',
    status: 'open',
    createdAt: minutesAgo(fields.minutesOld),
    resolvedAt: null,
    resolvedBy: null,
  };
}

function participant(fields: {
  id: string;
  email?: string | null;
  notify?: boolean;
  isTeam?: boolean;
}): ReviewParticipant {
  return {
    id: fields.id,
    displayName: fields.id,
    email: fields.email === undefined ? `${fields.id}@client.example` : fields.email,
    notify: fields.notify ?? true,
    isTeam: fields.isTeam ?? false,
    createdAt: minutesAgo(1000),
    lastSeenAt: null,
  };
}

function input(overrides: Partial<DigestInput> = {}): DigestInput {
  return {
    now: NOW,
    comments: [],
    participants: [],
    teamRecipients: [],
    watermarks: new Map(),
    ...overrides,
  };
}

const TEAM = [{ userId: 'u1', email: 'otto@agency.example', muted: false }];

describe('quiet period', () => {
  it('holds a burst while comments are still arriving', () => {
    // Three comments in three minutes is one person working through a page. Mailing each one is how
    // a review tool earns a filter rule.
    const messages = composeDigests(
      input({
        comments: [
          comment({ id: 'c1', participantId: 'p1', minutesOld: QUIET_PERIOD_MINUTES + 2 }),
          comment({ id: 'c2', participantId: 'p1', minutesOld: QUIET_PERIOD_MINUTES + 1 }),
          comment({ id: 'c3', participantId: 'p1', minutesOld: QUIET_PERIOD_MINUTES - 1 }),
        ],
        participants: [participant({ id: 'p1' })],
        teamRecipients: TEAM,
      })
    );

    expect(messages).toEqual([]);
  });

  it('sends the moment the newest comment has been quiet for the full period', () => {
    // Exactly on the boundary, because the boundary is where an off-by-one hides: with a strict
    // comparison a burst that lands on the period stays queued until the next comment moves it.
    const messages = composeDigests(
      input({
        comments: [
          comment({ id: 'c1', participantId: 'p1', minutesOld: QUIET_PERIOD_MINUTES + 5 }),
          comment({ id: 'c2', participantId: 'p1', minutesOld: QUIET_PERIOD_MINUTES }),
        ],
        participants: [participant({ id: 'p1' })],
        teamRecipients: TEAM,
      })
    );

    expect(messages).toHaveLength(1);
    expect(messages[0].commentIds).toEqual(['c1', 'c2']);
    expect(messages[0].throughCommentId).toBe('c2');
  });
});

describe('hard cap', () => {
  it('sends a continuously active thread once the oldest unsent comment reaches the cap', () => {
    // Without this a busy review never notifies at all: something new always lands inside the quiet
    // period, so the quiet period never elapses.
    const messages = composeDigests(
      input({
        comments: [
          comment({ id: 'c1', participantId: 'p1', minutesOld: MAX_HOLD_MINUTES }),
          comment({ id: 'c2', participantId: 'p1', minutesOld: 40 }),
          comment({ id: 'c3', participantId: 'p1', minutesOld: 1 }),
        ],
        participants: [participant({ id: 'p1' })],
        teamRecipients: TEAM,
      })
    );

    expect(messages).toHaveLength(1);
    expect(messages[0].commentIds).toEqual(['c1', 'c2', 'c3']);
  });

  it('keeps holding an active thread that has not reached the cap yet', () => {
    const messages = composeDigests(
      input({
        comments: [
          comment({ id: 'c1', participantId: 'p1', minutesOld: MAX_HOLD_MINUTES - 1 }),
          comment({ id: 'c2', participantId: 'p1', minutesOld: 1 }),
        ],
        participants: [participant({ id: 'p1' })],
        teamRecipients: TEAM,
      })
    );

    expect(messages).toEqual([]);
  });
});

describe('never the author', () => {
  it('does not mail a team member about their own reply', () => {
    // A team member who names themselves in the review sidebar has a participant row of their own,
    // with an address on it, and their reply puts them in the thread they just replied to.
    const messages = composeDigests(
      input({
        comments: [
          comment({ id: 'root', participantId: 'p1', minutesOld: 300 }),
          comment({
            id: 'reply',
            participantId: 'user:u1',
            parentId: 'root',
            isTeam: true,
            minutesOld: 30,
          }),
        ],
        participants: [
          participant({ id: 'p1' }),
          participant({ id: 'user:u1', email: 'otto@agency.example', isTeam: true }),
        ],
        teamRecipients: TEAM,
        watermarks: new Map([['user:u1', { at: minutesAgo(299), muted: false }]]),
      })
    );

    expect(messages.map((m) => m.recipientId)).toEqual(['p1']);
  });

  it('does not mail a reviewer about their own comment', () => {
    const messages = composeDigests(
      input({
        comments: [
          comment({ id: 'root', participantId: 'p1', minutesOld: 300 }),
          comment({ id: 'reply', participantId: 'p1', parentId: 'root', minutesOld: 30 }),
        ],
        participants: [participant({ id: 'p1' })],
        teamRecipients: [],
      })
    );

    expect(messages).toEqual([]);
  });
});

describe('routing', () => {
  it("sends a reviewer's comment to the team", () => {
    const messages = composeDigests(
      input({
        comments: [comment({ id: 'c1', participantId: 'p1', minutesOld: 30 })],
        participants: [participant({ id: 'p1' })],
        teamRecipients: [
          { userId: 'u1', email: 'otto@agency.example', muted: false },
          { userId: 'u2', email: 'mira@agency.example', muted: false },
        ],
      })
    );

    expect(messages.map((m) => m.toEmail).sort()).toEqual([
      'mira@agency.example',
      'otto@agency.example',
    ]);
    expect(messages.every((m) => m.recipientKind === 'user')).toBe(true);
  });

  it('sends a team comment to the participants in that thread only', () => {
    // p2 commented on the same deployment but on a different thread. Telling them about a reply
    // they are not part of is the behaviour that turns a review tool into noise.
    const messages = composeDigests(
      input({
        comments: [
          comment({ id: 'root1', participantId: 'p1', minutesOld: 300 }),
          comment({ id: 'root2', participantId: 'p2', minutesOld: 300 }),
          comment({
            id: 'reply',
            participantId: 'user:u1',
            parentId: 'root1',
            isTeam: true,
            minutesOld: 30,
          }),
        ],
        participants: [participant({ id: 'p1' }), participant({ id: 'p2' })],
        teamRecipients: TEAM,
        watermarks: new Map([['user:u1', { at: minutesAgo(299), muted: false }]]),
      })
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      recipientKind: 'participant',
      recipientId: 'p1',
      commentIds: ['reply'],
    });
  });

  it('reaches everyone in a thread, not just the person replied to', () => {
    const messages = composeDigests(
      input({
        comments: [
          comment({ id: 'root', participantId: 'p1', minutesOld: 300 }),
          comment({ id: 'me-too', participantId: 'p2', parentId: 'root', minutesOld: 290 }),
          comment({
            id: 'reply',
            participantId: 'user:u1',
            parentId: 'me-too',
            isTeam: true,
            minutesOld: 30,
          }),
        ],
        participants: [participant({ id: 'p1' }), participant({ id: 'p2' })],
        teamRecipients: TEAM,
        // The team has already been told about both client comments; only the reply is in play.
        watermarks: new Map([['user:u1', { at: minutesAgo(289), muted: false }]]),
      })
    );

    expect(messages.map((m) => m.recipientId).sort()).toEqual(['p1', 'p2']);
  });
});

describe('opting out', () => {
  it('sends nothing to a participant who turned notifications off', () => {
    const messages = composeDigests(
      input({
        comments: [
          comment({ id: 'root', participantId: 'p1', minutesOld: 300 }),
          comment({
            id: 'reply',
            participantId: 'user:u1',
            parentId: 'root',
            isTeam: true,
            minutesOld: 30,
          }),
        ],
        participants: [participant({ id: 'p1', notify: false })],
        teamRecipients: [],
      })
    );

    expect(messages).toEqual([]);
  });

  it('sends nothing to a participant who never gave an address', () => {
    const messages = composeDigests(
      input({
        comments: [
          comment({ id: 'root', participantId: 'p1', minutesOld: 300 }),
          comment({
            id: 'reply',
            participantId: 'user:u1',
            parentId: 'root',
            isTeam: true,
            minutesOld: 30,
          }),
        ],
        participants: [participant({ id: 'p1', email: null })],
        teamRecipients: [],
      })
    );

    expect(messages).toEqual([]);
  });
});

describe('muting', () => {
  it('skips a muted team recipient', () => {
    const messages = composeDigests(
      input({
        comments: [comment({ id: 'c1', participantId: 'p1', minutesOld: 30 })],
        participants: [participant({ id: 'p1' })],
        teamRecipients: [{ userId: 'u1', email: 'otto@agency.example', muted: true }],
      })
    );

    expect(messages).toEqual([]);
  });

  it('skips a muted participant and leaves their backlog owed', () => {
    // Muting must not advance a watermark, which in this module means emitting no message at all:
    // the watermark only ever moves for a message that was composed. Unmuting then shows the
    // backlog rather than a hole.
    const muted = input({
      comments: [
        comment({ id: 'root', participantId: 'p1', minutesOld: 300 }),
        comment({
          id: 'reply',
          participantId: 'user:u1',
          parentId: 'root',
          isTeam: true,
          minutesOld: 30,
        }),
      ],
      participants: [participant({ id: 'p1' })],
      teamRecipients: [],
      watermarks: new Map([['participant:p1', { at: '', muted: true }]]),
    });

    expect(composeDigests(muted)).toEqual([]);

    const unmuted = {
      ...muted,
      watermarks: new Map([['participant:p1', { at: '', muted: false }]]),
    };
    expect(composeDigests(unmuted)[0].commentIds).toEqual(['reply']);
  });
});

describe('skipping while the channel is off', () => {
  /**
   * The other half of `muting` above, and deliberately the opposite of it.
   *
   * A muted recipient keeps their backlog because the conversation is still happening without them.
   * A switched-off tier has no conversation to be left out of, so everyone is brought up to date
   * with nothing sent — otherwise switching it back on empties months of digests at a client at
   * once.
   */
  it('names the newest comment each recipient would have been told about', () => {
    const state = input({
      comments: [
        comment({ id: 'c1', participantId: 'p1', minutesOld: 300 }),
        comment({ id: 'c2', participantId: 'p1', minutesOld: 200 }),
      ],
      participants: [participant({ id: 'p1' })],
      teamRecipients: TEAM,
    });

    expect(skipDigests(state)).toEqual([
      { recipientKind: 'user', recipientId: 'u1', throughCommentId: 'c2' },
    ]);
  });

  it('carries no address and no comment list, because nothing is being written', () => {
    const [skipped] = skipDigests(
      input({
        comments: [comment({ id: 'c1', participantId: 'p1', minutesOld: 30 })],
        participants: [participant({ id: 'p1' })],
        teamRecipients: TEAM,
      })
    );

    expect(Object.keys(skipped).sort()).toEqual([
      'recipientId',
      'recipientKind',
      'throughCommentId',
    ]);
  });

  it('catches up past the quiet period, which only exists to batch a message', () => {
    const fresh = input({
      comments: [comment({ id: 'c1', participantId: 'p1', minutesOld: 1 })],
      participants: [participant({ id: 'p1' })],
      teamRecipients: TEAM,
    });

    // composeDigests would hold this one, and holding it would leave a comment behind for the
    // moment the tier came back on.
    expect(composeDigests(fresh)).toEqual([]);
    expect(skipDigests(fresh)[0].throughCommentId).toBe('c1');
  });

  it('leaves a muted recipient out, so their watermark cannot move either', () => {
    const skipped = skipDigests(
      input({
        comments: [comment({ id: 'c1', participantId: 'p1', minutesOld: 30 })],
        participants: [participant({ id: 'p1' })],
        teamRecipients: [{ userId: 'u1', email: 'otto@agency.example', muted: true }],
      })
    );

    expect(skipped).toEqual([]);
  });

  it('has nothing to catch up once every recipient is level', () => {
    expect(
      skipDigests(
        input({
          comments: [comment({ id: 'c1', participantId: 'p1', minutesOld: 30 })],
          participants: [participant({ id: 'p1' })],
          teamRecipients: TEAM,
          watermarks: new Map([['user:u1', { at: minutesAgo(30), muted: false }]]),
        })
      )
    ).toEqual([]);
  });

  it('agrees with composition about who is owed what', () => {
    // Both exits read the same filter. If they ever disagreed, a tier switched off would advance
    // somebody past a comment a running tier would still have mailed them about.
    const state = input({
      comments: [
        comment({ id: 'root', participantId: 'p1', minutesOld: 300 }),
        comment({
          id: 'reply',
          participantId: 'user:u1',
          parentId: 'root',
          isTeam: true,
          minutesOld: 30,
        }),
      ],
      participants: [participant({ id: 'p1' })],
      teamRecipients: TEAM,
    });

    const composed = composeDigests(state).map((message) => [
      message.recipientKind,
      message.recipientId,
      message.throughCommentId,
    ]);
    const skipped = skipDigests(state).map((entry) => [
      entry.recipientKind,
      entry.recipientId,
      entry.throughCommentId,
    ]);

    expect(skipped).toEqual(composed);
  });
});

describe('watermarks', () => {
  it('owes nothing on a second run when no comment has been written since', () => {
    const base = input({
      comments: [comment({ id: 'c1', participantId: 'p1', minutesOld: 30 })],
      participants: [participant({ id: 'p1' })],
      teamRecipients: TEAM,
    });

    const first = composeDigests(base);
    expect(first).toHaveLength(1);

    const second = composeDigests({
      ...base,
      watermarks: new Map([['user:u1', { at: minutesAgo(30), muted: false }]]),
    });
    expect(second).toEqual([]);
  });

  it('owes only what arrived after the watermark', () => {
    const messages = composeDigests(
      input({
        comments: [
          comment({ id: 'old', participantId: 'p1', minutesOld: 300 }),
          comment({ id: 'new', participantId: 'p1', minutesOld: 30 }),
        ],
        participants: [participant({ id: 'p1' })],
        teamRecipients: TEAM,
        watermarks: new Map([['user:u1', { at: minutesAgo(299), muted: false }]]),
      })
    );

    expect(messages[0].commentIds).toEqual(['new']);
    expect(messages[0].throughCommentId).toBe('new');
  });

  it('treats a watermark carrying milliseconds as covering that second', () => {
    // Callers hold `new Date().toISOString()`; stored comments do not have milliseconds. Compared
    // as raw text, '...:00.000Z' sorts below '...:00Z' and the comment on the watermark comes back
    // as new for ever.
    const messages = composeDigests(
      input({
        comments: [comment({ id: 'c1', participantId: 'p1', minutesOld: 30 })],
        participants: [participant({ id: 'p1' })],
        teamRecipients: TEAM,
        watermarks: new Map([
          ['user:u1', { at: new Date(NOW - 30 * 60_000).toISOString(), muted: false }],
        ]),
      })
    );

    expect(messages).toEqual([]);
  });
});
