import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

// `server-only` is a bundler guard, not behaviour; these modules reach it through access.ts.
vi.mock('server-only', () => ({}));

import {
  MAX_COMMENT_BODY,
  MAX_PAGE_PATH,
  MAX_SELECTOR,
  resolveCommentAuthorship,
  resolveParentComment,
  validateCommentInput,
} from '../comment-input';
import type { ReviewDatabase } from '@/lib/vfs/adapters/review-database';

/**
 * A review copy is reachable by anyone holding its URL, so the body of a POST is the least trusted
 * input in the feature. These are the decisions that keep it from naming its own author, borrowing
 * the team's badge, or hanging a reply off another client's thread.
 */

describe('validateCommentInput', () => {
  const base = { body: 'Looks good', page_path: '/index.html' };

  it('accepts a body exactly at the cap and rejects one over it', () => {
    const atCap = validateCommentInput({ ...base, body: 'x'.repeat(MAX_COMMENT_BODY) });
    expect(atCap.ok).toBe(true);

    const overCap = validateCommentInput({ ...base, body: 'x'.repeat(MAX_COMMENT_BODY + 1) });
    expect(overCap.ok).toBe(false);
  });

  it('rejects an empty or non-string body', () => {
    expect(validateCommentInput({ ...base, body: '' }).ok).toBe(false);
    expect(validateCommentInput({ ...base, body: '   ' }).ok).toBe(false);
    expect(validateCommentInput({ ...base, body: 42 }).ok).toBe(false);
    expect(validateCommentInput({ ...base, body: undefined }).ok).toBe(false);
  });

  it('requires a page path and caps its length', () => {
    expect(validateCommentInput({ body: 'hi' }).ok).toBe(false);
    expect(validateCommentInput({ ...base, page_path: '/' + 'a'.repeat(MAX_PAGE_PATH) }).ok).toBe(false);
    expect(validateCommentInput({ ...base, page_path: '/a'.repeat(4) }).ok).toBe(true);
  });

  it('accepts the page paths the widget actually sends', () => {
    for (const pagePath of ['/', '/index.html', '/articles/a-b_c.html', '/a%20b/page.html']) {
      expect(validateCommentInput({ ...base, page_path: pagePath }).ok).toBe(true);
    }
  });

  it('rejects a page path that is not a path', () => {
    // Length was the only constraint, so any string reached storage, the digest, the inbox and the
    // studio's "open in editor" navigation. Refused rather than rewritten: a value that does not
    // look like a path is a client bug or an attack, and silently repairing it hides both.
    for (const pagePath of [
      'https://evil.com',
      'javascript:alert(1)',
      '//evil.com/index.html',
      '../../etc/passwd',
      '/articles/../../etc/passwd',
      'no-leading-slash',
      '/page.html\r\nX-Injected: 1',
      // Neither belongs in a page path — window.location.pathname carries neither — and either
      // would swallow the `osw-comment` parameter the studio appends when linking to one comment.
      '/page.html?a=b',
      '/page.html#frag',
      '/page.html\r',
      ' /index.html',
      '\\windows\\path',
      '/dir\\..\\..\\secret',
    ]) {
      const result = validateCommentInput({ ...base, page_path: pagePath });
      expect(result.ok, `expected ${JSON.stringify(pagePath)} to be rejected`).toBe(false);
    }
  });

  it('caps the selector length', () => {
    const ok = validateCommentInput({ ...base, selector: 'a'.repeat(MAX_SELECTOR) });
    expect(ok.ok).toBe(true);

    const tooLong = validateCommentInput({ ...base, selector: 'a'.repeat(MAX_SELECTOR + 1) });
    expect(tooLong.ok).toBe(false);
  });

  it('rejects a selector carrying a control character', () => {
    // The selector is handed to querySelector in the widget and stored for the life of the round;
    // a newline in one is never something the overlay produced.
    expect(validateCommentInput({ ...base, selector: 'body > p\u0000' }).ok).toBe(false);
    expect(validateCommentInput({ ...base, selector: 'body\n> p' }).ok).toBe(false);
    expect(validateCommentInput({ ...base, selector: '   ' }).ok).toBe(false);

    // Control: the shape the overlay does produce still passes.
    expect(validateCommentInput({ ...base, selector: 'body > div:nth-child(2) > #hero' }).ok).toBe(true);
  });

  it('never carries is_team or author_name out of the body', () => {
    // The impersonation attempt: a participant POSTing a comment that claims the team badge and a
    // name of its choosing. Neither field may survive validation in any form.
    const result = validateCommentInput({
      ...base,
      is_team: true,
      isTeam: true,
      author_name: 'Admin',
      authorName: 'Admin',
      participant_id: 'someone-else',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // An exhaustive key set, not a spot check: anything the body smuggles in shows up here.
    const carried = result.value as unknown as Record<string, unknown>;
    expect(Object.keys(carried).sort()).toEqual([
      'anchorText',
      'body',
      'pagePath',
      'parentId',
      'selector',
    ]);
    expect(carried.isTeam).toBeUndefined();
    expect(carried.is_team).toBeUndefined();
    expect(carried.authorName).toBeUndefined();
    expect(carried.author_name).toBeUndefined();
    expect(carried.participantId).toBeUndefined();
    expect(JSON.stringify(result.value)).not.toContain('Admin');
  });

  it('rejects a non-string parent id rather than coercing it', () => {
    expect(validateCommentInput({ ...base, parent_id: 12 }).ok).toBe(false);
    expect(validateCommentInput({ ...base, parent_id: { $ne: null } }).ok).toBe(false);
  });
});

describe('resolveCommentAuthorship', () => {
  const stored = {
    id: 'p-1',
    displayName: 'Dana',
    email: 'dana@example.com',
    notify: true,
    isTeam: false,
    createdAt: '2026-01-01T00:00:00Z',
    lastSeenAt: null,
  };

  it('takes the name from the stored participant, not from anything a caller sent', () => {
    const authorship = resolveCommentAuthorship({ kind: 'participant', participantId: 'p-1' }, stored);

    expect(authorship).toEqual({ participantId: 'p-1', authorName: 'Dana', isTeam: false });
  });

  it('derives is_team from the access result, never from the stored row', () => {
    // A stored row claiming the badge is not evidence of anything: only the account session that
    // access.ts re-derives each request decides who is team.
    const liar = { ...stored, isTeam: true };
    const asParticipant = resolveCommentAuthorship({ kind: 'participant', participantId: 'p-1' }, liar);
    expect(asParticipant.isTeam).toBe(false);

    const asTeam = resolveCommentAuthorship(
      { kind: 'team', participantId: 'user:u-9', userId: 'u-9', canModerate: true },
      { ...stored, id: 'user:u-9', displayName: 'Otto', isTeam: false }
    );
    expect(asTeam).toEqual({ participantId: 'user:u-9', authorName: 'Otto', isTeam: true });
  });

  it('withholds the team badge from a workspace member who may only view', () => {
    // A viewer is read-only everywhere else in the app. Commenting is still legitimate for them,
    // but a comment badged as the team reads to the client as the agency answering, and a viewer
    // has no authority to answer on the agency's behalf.
    const viewer = resolveCommentAuthorship(
      { kind: 'team', participantId: 'user:u-3', userId: 'u-3', canModerate: false },
      { ...stored, id: 'user:u-3', displayName: 'Sam' }
    );

    expect(viewer).toEqual({ participantId: 'user:u-3', authorName: 'Sam', isTeam: false });

    // Control: the same call from an editor is badged, so the refusal above is the role.
    const editor = resolveCommentAuthorship(
      { kind: 'team', participantId: 'user:u-3', userId: 'u-3', canModerate: true },
      { ...stored, id: 'user:u-3', displayName: 'Sam' }
    );
    expect(editor.isTeam).toBe(true);
  });

  it('attributes to the verified participant id even when the stored row is a different one', () => {
    // Defensive: the id written to the comment must be the one the cookie proved, so a lookup that
    // somehow returned the wrong row cannot redirect attribution.
    const authorship = resolveCommentAuthorship(
      { kind: 'participant', participantId: 'p-verified' },
      { ...stored, id: 'p-other' }
    );

    expect(authorship.participantId).toBe('p-verified');
  });

  it('falls back to a placeholder name when the participant has not named themselves', () => {
    const anonymous = resolveCommentAuthorship({ kind: 'participant', participantId: 'p-2' }, null);
    expect(anonymous.authorName).toBeTruthy();
    expect(anonymous.isTeam).toBe(false);

    const team = resolveCommentAuthorship(
      { kind: 'team', participantId: 'user:u-1', userId: 'u-1', canModerate: true },
      null
    );
    expect(team.authorName).toBeTruthy();
    expect(team.isTeam).toBe(true);
  });
});

describe('resolveParentComment', () => {
  const DEPLOYMENT_A = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
  const DEPLOYMENT_B = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';

  let dir: string;
  let opened: ReviewDatabase[];

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'osws-review-parent-'));
    opened = [];
    vi.resetModules();
    vi.stubEnv('DEPLOYMENTS_DIR', dir);
  });

  afterEach(() => {
    for (const db of opened) db.close();
    vi.unstubAllEnvs();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  async function open(deploymentId: string): Promise<ReviewDatabase> {
    const { ReviewDatabase } = await import('@/lib/vfs/adapters/review-database');
    const db = new ReviewDatabase(deploymentId);
    db.init();
    opened.push(db);
    return db;
  }

  it('accepts a parent that lives in this deployment', async () => {
    const dbA = await open(DEPLOYMENT_A);
    const parent = dbA.createComment({
      participantId: 'p-1',
      authorName: 'Dana',
      pagePath: '/index.html',
      body: 'Original',
    });

    const result = resolveParentComment(parent.id, dbA);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.parentId).toBe(parent.id);
  });

  it('rejects a parent that belongs to a different deployment', async () => {
    const dbA = await open(DEPLOYMENT_A);
    const dbB = await open(DEPLOYMENT_B);

    const foreign = dbB.createComment({
      participantId: 'p-2',
      authorName: 'Someone else',
      pagePath: '/index.html',
      body: "Another agency's client",
    });

    // Each deployment carries its own review database, so a foreign id is simply absent here — and
    // must read as "no such parent" rather than being written through as a dangling reference.
    const result = resolveParentComment(foreign.id, dbA);

    expect(result.ok).toBe(false);
    expect(dbA.getComment(foreign.id)).toBeNull();
  });

  it('rejects an id that names nothing at all', async () => {
    const dbA = await open(DEPLOYMENT_A);

    expect(resolveParentComment('00000000-0000-4000-8000-000000000000', dbA).ok).toBe(false);
  });

  it('treats an absent parent id as a top-level comment', async () => {
    const dbA = await open(DEPLOYMENT_A);

    const result = resolveParentComment(undefined, dbA);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.parentId).toBeUndefined();
  });
});
