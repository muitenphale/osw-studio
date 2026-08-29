import { describe, it, expect } from 'vitest';

import { toWireComment, toWireParticipant, toWireParticipants } from '../comment-view';

/**
 * The GET response is rendered by a page any holder of the review URL can open. A participant who
 * could read the other participants out of it would be harvesting an agency's whole client list,
 * so the wire shape carries what a comment thread needs to draw and nothing else.
 */

const participants = [
  {
    id: 'p-1',
    displayName: 'Dana',
    email: 'dana@example.com',
    notify: true,
    isTeam: false,
    createdAt: '2026-01-01T00:00:00Z',
    lastSeenAt: '2026-01-02T00:00:00Z',
  },
  {
    id: 'user:u-9',
    displayName: 'Otto',
    email: 'otto@agency.example',
    notify: true,
    isTeam: true,
    createdAt: '2026-01-01T00:00:00Z',
    lastSeenAt: null,
  },
];

describe('toWireParticipant', () => {
  it('carries only the fields needed to render an attribution', () => {
    expect(toWireParticipant(participants[0])).toEqual({
      id: 'p-1',
      display_name: 'Dana',
      is_team: false,
    });
  });

  it('never carries an email, for any participant', () => {
    const serialised = JSON.stringify(toWireParticipants(participants));

    expect(serialised).not.toContain('dana@example.com');
    expect(serialised).not.toContain('otto@agency.example');
    expect(serialised).not.toContain('email');
  });
});

describe('toWireComment', () => {
  it('carries the anchor and status fields the thread renders', () => {
    const wire = toWireComment({
      id: 'c-1',
      parentId: null,
      participantId: 'p-1',
      authorName: 'Dana',
      isTeam: false,
      pagePath: '/pricing.html',
      selector: 'main h2',
      anchorText: 'Enterprise plan',
      body: 'Can this say "Teams"?',
      status: 'open',
      createdAt: '2026-01-01T00:00:00Z',
      resolvedAt: null,
      resolvedBy: null,
    });

    expect(wire).toEqual({
      id: 'c-1',
      parent_id: null,
      participant_id: 'p-1',
      author_name: 'Dana',
      is_team: false,
      page_path: '/pricing.html',
      selector: 'main h2',
      anchor_text: 'Enterprise plan',
      body: 'Can this say "Teams"?',
      status: 'open',
      created_at: '2026-01-01T00:00:00Z',
      resolved_at: null,
      resolved_by: null,
    });
  });
});
