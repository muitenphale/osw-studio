import { describe, it, expect, vi } from 'vitest';

// `server-only` is a bundler guard, not behaviour; these modules reach it through access.ts.
vi.mock('server-only', () => ({}));

import { authorizeStatusChange } from '../comment-status';

/**
 * Resolving a comment is the team saying "handled". A client who could do it would be able to
 * close their own feedback out of the agency's queue, so the verb is team-only — and the answer is
 * 403 rather than 404 because this caller has already proven access to the review copy.
 */

const PARTICIPANT = { kind: 'participant', participantId: 'p-1' } as const;
const TEAM = { kind: 'team', participantId: 'user:u-9', userId: 'u-9', canModerate: true } as const;
const VIEWER = { kind: 'team', participantId: 'user:u-4', userId: 'u-4', canModerate: false } as const;

describe('authorizeStatusChange', () => {
  it('refuses a participant caller with 403', () => {
    const result = authorizeStatusChange(PARTICIPANT, { status: 'resolved' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.httpStatus).toBe(403);
  });

  it('refuses a participant even when reopening', () => {
    const result = authorizeStatusChange(PARTICIPANT, { status: 'open' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.httpStatus).toBe(403);
  });

  it('lets a team caller resolve, stamping the session user', () => {
    const result = authorizeStatusChange(TEAM, { status: 'resolved' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.status).toBe('resolved');
    expect(result.resolvedBy).toBe('u-9');
  });

  it('takes resolved_by from the session, not from the body', () => {
    const result = authorizeStatusChange(TEAM, { status: 'resolved', resolved_by: 'someone-else' });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.resolvedBy).toBe('u-9');
  });

  it('lets a team caller reopen, carrying no resolver', () => {
    const result = authorizeStatusChange(TEAM, { status: 'open' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.status).toBe('open');
    expect(result.resolvedBy).toBeUndefined();
  });

  it('rejects a status that is neither open nor resolved', () => {
    for (const status of ['deleted', '', 'RESOLVED', 1, null, undefined]) {
      const result = authorizeStatusChange(TEAM, { status });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.httpStatus).toBe(400);
    }
  });

  it('checks authorisation before the body, so a participant learns nothing from a bad status', () => {
    // Answering 400 here would tell a client their status value was the only problem.
    const result = authorizeStatusChange(PARTICIPANT, { status: 'nonsense' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.httpStatus).toBe(403);
  });

  it('refuses a workspace member who may only view, with 403', () => {
    // Viewer is the right bar for seeing the review copy and the wrong one for closing a client's
    // comment out of the agency's queue; resolving is a moderation verb, not a reading one.
    for (const status of ['resolved', 'open']) {
      const result = authorizeStatusChange(VIEWER, { status });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.httpStatus).toBe(403);
    }
  });

  it('refuses a denied access result outright', () => {
    const result = authorizeStatusChange({ kind: 'denied' }, { status: 'resolved' });

    expect(result.ok).toBe(false);
  });
});
