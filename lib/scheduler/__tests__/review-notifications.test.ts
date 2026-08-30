import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';

/**
 * The sweep that turns owed digests into queued mail.
 *
 * Four properties are worth more than the rest. It must not create a review database for a
 * deployment that has no review — opening one creates the file, and a task that ran over every
 * deployment would litter the instance. The watermark must not move unless the message was queued,
 * or a crash between the two silently drops somebody's notification. One broken deployment must not
 * stop the others.
 *
 * And a workspace whose mail is switched off must compose nothing *and* keep its recipients up to
 * date, so that switching it back on starts from that moment. That one is only provable by running
 * the sweep twice across the switch, which is what the tests below do: the assertion that matters is
 * the second sweep, with mail on, still queueing nothing for the comments written while it was off.
 */

const mocks = vi.hoisted(() => ({
  resolveDeployment: vi.fn(),
  listDeploymentIds: vi.fn(),
  listWorkspaceMembers: vi.fn(),
  enqueueEmail: vi.fn(),
  realEnqueueEmail: null as null | ((email: unknown) => number),
}));

vi.mock('server-only', () => ({}));

vi.mock('@/lib/vfs/adapters/deployment-adapter', () => ({
  resolveDeployment: mocks.resolveDeployment,
}));

// Only the directory listing is stubbed; the review database underneath is real, because whether a
// file gets created is the thing under test.
vi.mock('@/lib/vfs/adapters/sqlite-connection', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/vfs/adapters/sqlite-connection')>();
  return { ...actual, listDeploymentIds: mocks.listDeploymentIds };
});

vi.mock('@/lib/auth/system-database', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/system-database')>();
  return { ...actual, listWorkspaceMembers: mocks.listWorkspaceMembers };
});

// Wraps the real outbox rather than replacing it, so the default path writes a real row and only
// the failure test substitutes a throw.
vi.mock('@/lib/mail/outbox', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/mail/outbox')>();
  mocks.realEnqueueEmail = actual.enqueueEmail as unknown as (email: unknown) => number;
  return { ...actual, enqueueEmail: (email: unknown) => mocks.enqueueEmail(email) };
});

import { createReviewNotificationTask } from '../review-notifications';
import { ReviewDatabase } from '@/lib/vfs/adapters/review-database';
import {
  closeReviewDatabase,
  getReviewDatabaseConnection,
} from '@/lib/vfs/adapters/sqlite-connection';
import { getPendingEmails } from '@/lib/mail/outbox';
import { writeInstanceMail, writeWorkspaceMail } from '@/lib/mail/settings';
import { closeSystemDatabase, createUser, createWorkspace } from '@/lib/auth/system-database';

const TEAM_EMAIL = 'otto@agency.example';

let dir: string;
let deploymentId: string;
let workspaceId: string;

function reviewDatabasePath(id = deploymentId): string {
  return path.join(dir, 'deployments', id, 'review.sqlite');
}

function openDatabase(id = deploymentId): ReviewDatabase {
  const db = new ReviewDatabase(id);
  db.init();
  return db;
}

function minutesAgo(minutes: number): string {
  return `${new Date(Date.now() - minutes * 60_000).toISOString().slice(0, 19)}Z`;
}

/** Write a comment and back-date it, which is the only way to reach the quiet period in a test. */
function seedComment(fields: {
  participantId: string;
  authorName: string;
  minutesOld: number;
  isTeam?: boolean;
  parentId?: string;
  body?: string;
}): string {
  const db = openDatabase();
  const comment = db.createComment({
    participantId: fields.participantId,
    authorName: fields.authorName,
    isTeam: fields.isTeam,
    parentId: fields.parentId,
    pagePath: '/index.html',
    body: fields.body ?? 'The hero image is too small.',
  });

  getReviewDatabaseConnection(deploymentId)
    .prepare('UPDATE comments SET created_at = ? WHERE id = ?')
    .run(minutesAgo(fields.minutesOld), comment.id);

  return comment.id;
}

function deploymentRecord(review: Record<string, unknown> | undefined) {
  return {
    adapter: {},
    workspaceId,
    deployment: { id: deploymentId, name: 'Acme site', review },
  };
}

/** The workspace's own switch, which is one of the two ways the channel closes. */
function setWorkspaceMail(enabled: boolean): void {
  writeWorkspaceMail(workspaceId, { enabled, mode: 'instance' });
}

async function sweep() {
  await createReviewNotificationTask().execute();
}

let errorLog: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'osws-review-notify-'));
  deploymentId = randomUUID();

  vi.stubEnv('DATA_DIR', path.join(dir, 'data'));
  vi.stubEnv('DEPLOYMENTS_DIR', path.join(dir, 'deployments'));
  vi.stubEnv('SESSION_SECRET', 'test-session-secret-for-review-notifications');
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://osw.example');
  // The developer's own relay must not decide whether this suite composes anything.
  for (const key of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM']) {
    vi.stubEnv(key, '');
  }

  // A real workspace, because the mail settings that gate composition are keyed by one and
  // `workspace_mail` will not take a row for a workspace that does not exist.
  workspaceId = createWorkspace('Agency', createUser('otto@agency.example', 'hash'));
  writeInstanceMail({ host: 'smtp.instance.test', from: 'OSW <review@instance.test>' });
  setWorkspaceMail(true);

  mocks.listDeploymentIds.mockReturnValue([deploymentId]);
  mocks.resolveDeployment.mockResolvedValue(
    deploymentRecord({ enabled: true, notifyByEmail: true })
  );
  mocks.listWorkspaceMembers.mockReturnValue([
    { userId: 'u1', email: TEAM_EMAIL, role: 'owner' },
  ]);
  mocks.enqueueEmail.mockImplementation((email: unknown) => mocks.realEnqueueEmail!(email));

  errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  errorLog.mockRestore();
  closeReviewDatabase(deploymentId);
  closeSystemDatabase();
  vi.unstubAllEnvs();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('the gate', () => {
  it('creates no review database for a deployment with review off', async () => {
    mocks.resolveDeployment.mockResolvedValue(deploymentRecord({ enabled: false }));

    await sweep();

    expect(fs.existsSync(reviewDatabasePath())).toBe(false);
  });

  it('creates no review database when review has no email notifications', async () => {
    mocks.resolveDeployment.mockResolvedValue(deploymentRecord({ enabled: true }));

    await sweep();

    expect(fs.existsSync(reviewDatabasePath())).toBe(false);
  });

  it('creates no review database for a deployment with no review settings at all', async () => {
    mocks.resolveDeployment.mockResolvedValue(deploymentRecord(undefined));

    await sweep();

    expect(fs.existsSync(reviewDatabasePath())).toBe(false);
  });

  it('does open the review database when review notifications are on', async () => {
    // The positive control: without it the assertions above would also pass if the task never ran.
    await sweep();

    expect(fs.existsSync(reviewDatabasePath())).toBe(true);
  });
});

describe('queueing a digest', () => {
  it('queues one message for the team and advances their watermark', async () => {
    const commentId = seedComment({ participantId: 'p1', authorName: 'Sam', minutesOld: 30 });

    await sweep();

    const queued = getPendingEmails();
    expect(queued).toHaveLength(1);
    expect(queued[0].to_email).toBe(TEAM_EMAIL);
    expect(queued[0].subject).toBe('1 new comment on Acme site');
    expect(queued[0].body_text).toContain('The hero image is too small.');
    expect(queued[0].body_html).toContain('<p>');
    expect(queued[0].workspace_id).toBe(workspaceId);

    const state = openDatabase().getNotificationState('user', 'u1');
    expect(state?.lastNotifiedCommentId).toBe(commentId);
  });

  it('puts an opt-out link a recipient can use without an account in the body', async () => {
    seedComment({ participantId: 'p1', authorName: 'Sam', minutesOld: 30 });

    await sweep();

    expect(getPendingEmails()[0].body_text).toContain(
      `https://osw.example/review/${deploymentId}/unsubscribe`
    );
  });

  it('queues nothing on a second run when nothing new has been written', async () => {
    seedComment({ participantId: 'p1', authorName: 'Sam', minutesOld: 30 });

    await sweep();
    await sweep();

    expect(getPendingEmails()).toHaveLength(1);
  });

  it('holds a comment that is still inside the quiet period', async () => {
    seedComment({ participantId: 'p1', authorName: 'Sam', minutesOld: 1 });

    await sweep();

    expect(getPendingEmails()).toHaveLength(0);
    expect(openDatabase().getNotificationState('user', 'u1')).toBeNull();
  });

  it('sends a team reply to the client whose thread it is', async () => {
    const db = openDatabase();
    db.upsertParticipant({ id: 'p1', displayName: 'Sam', email: 'sam@client.example' });
    const root = seedComment({ participantId: 'p1', authorName: 'Sam', minutesOld: 300 });
    seedComment({
      participantId: 'user:u1',
      authorName: 'Otto',
      isTeam: true,
      parentId: root,
      minutesOld: 30,
      body: 'Fixed — take a look.',
    });

    await sweep();

    const toClient = getPendingEmails().find((email) => email.to_email === 'sam@client.example');
    expect(toClient?.subject).toBe('Otto replied to your comment on Acme site');
    expect(toClient?.body_text).toContain('> The hero image is too small.');
  });

  it('sends nothing to a muted team member and leaves their watermark alone', async () => {
    openDatabase().setMuted('user', 'u1', true);
    seedComment({ participantId: 'p1', authorName: 'Sam', minutesOld: 30 });

    await sweep();

    expect(getPendingEmails()).toHaveLength(0);
    const state = openDatabase().getNotificationState('user', 'u1');
    expect(state?.muted).toBe(true);
    expect(state?.lastNotifiedAt).toBeNull();
  });
});

describe('a channel that is switched off', () => {
  it('queues nothing and brings the recipient up to date instead', async () => {
    setWorkspaceMail(false);
    const commentId = seedComment({ participantId: 'p1', authorName: 'Sam', minutesOld: 30 });

    await sweep();

    expect(getPendingEmails()).toHaveLength(0);
    // Not the muted treatment: the watermark moves as though they had been told.
    expect(openDatabase().getNotificationState('user', 'u1')?.lastNotifiedCommentId).toBe(commentId);
  });

  it('does not send the missed comments when it is switched back on', async () => {
    // The whole point. Without the advance above, switching the workspace on would compose every
    // digest accumulated while it was off and fire them at a client in one volley.
    setWorkspaceMail(false);
    seedComment({ participantId: 'p1', authorName: 'Sam', minutesOld: 300 });
    seedComment({ participantId: 'p1', authorName: 'Sam', minutesOld: 200 });

    await sweep();

    setWorkspaceMail(true);
    await sweep();

    expect(getPendingEmails()).toHaveLength(0);
  });

  it('sends what is written after it comes back on', async () => {
    // The positive control for the test above: the silence has to end at the switch, or the
    // assertion there would also pass with notifications broken outright.
    setWorkspaceMail(false);
    seedComment({ participantId: 'p1', authorName: 'Sam', minutesOld: 300 });
    await sweep();

    setWorkspaceMail(true);
    const written = seedComment({ participantId: 'p1', authorName: 'Sam', minutesOld: 20 });
    await sweep();

    const queued = getPendingEmails();
    expect(queued).toHaveLength(1);
    expect(queued[0].subject).toBe('1 new comment on Acme site');
    const state = openDatabase().getNotificationState('user', 'u1');
    expect(state?.lastNotifiedCommentId).toBe(written);
  });

  it('does not wait out the quiet period before catching up', async () => {
    // The quiet period batches a message by waiting for a burst to end. There is no message, so
    // there is nothing to batch — and a comment left behind it would be the backlog, in miniature,
    // that this whole rule exists to prevent.
    setWorkspaceMail(false);
    const commentId = seedComment({ participantId: 'p1', authorName: 'Sam', minutesOld: 1 });

    await sweep();

    expect(getPendingEmails()).toHaveLength(0);
    expect(openDatabase().getNotificationState('user', 'u1')?.lastNotifiedCommentId).toBe(commentId);
  });

  it('leaves a muted recipient’s backlog where it is', async () => {
    // The two rules are opposites and must not become one. Muting is a person stepping out of a
    // conversation that is still happening, so unmuting shows them what they missed; the switch is
    // the channel being closed, and it has no memory. A muted recipient never reaches the catch-up
    // at all, so switching the workspace back on and unmuting still owes them the backlog.
    openDatabase().setMuted('user', 'u1', true);
    setWorkspaceMail(false);
    seedComment({ participantId: 'p1', authorName: 'Sam', minutesOld: 30 });

    await sweep();

    const state = openDatabase().getNotificationState('user', 'u1');
    expect(state?.muted).toBe(true);
    expect(state?.lastNotifiedAt).toBeNull();

    setWorkspaceMail(true);
    openDatabase().setMuted('user', 'u1', false);
    await sweep();

    expect(getPendingEmails()).toHaveLength(1);
  });

  it('is closed by the instance withdrawing its server as well as by the workspace switch', async () => {
    // A workspace relaying through the instance depends on both tiers, and either one closing is
    // the same closed channel.
    writeInstanceMail({ enabled: false });
    const commentId = seedComment({ participantId: 'p1', authorName: 'Sam', minutesOld: 30 });

    await sweep();

    expect(getPendingEmails()).toHaveLength(0);
    expect(openDatabase().getNotificationState('user', 'u1')?.lastNotifiedCommentId).toBe(commentId);
  });

  it('catches a client participant up too, not only the team', async () => {
    const db = openDatabase();
    db.upsertParticipant({ id: 'p1', displayName: 'Sam', email: 'sam@client.example' });
    const root = seedComment({ participantId: 'p1', authorName: 'Sam', minutesOld: 300 });
    const reply = seedComment({
      participantId: 'user:u1',
      authorName: 'Otto',
      isTeam: true,
      parentId: root,
      minutesOld: 30,
      body: 'Fixed — take a look.',
    });
    setWorkspaceMail(false);

    await sweep();

    expect(getPendingEmails()).toHaveLength(0);
    expect(openDatabase().getNotificationState('participant', 'p1')?.lastNotifiedCommentId).toBe(reply);
  });
});

describe('atomicity', () => {
  it('leaves the watermark where it was when the outbox insert fails', async () => {
    // Split into two writes, a crash here either double-sends or silently drops the digest.
    seedComment({ participantId: 'p1', authorName: 'Sam', minutesOld: 30 });
    mocks.enqueueEmail.mockImplementation(() => {
      throw new Error('outbox unavailable');
    });

    await sweep();

    expect(mocks.enqueueEmail).toHaveBeenCalled();
    expect(openDatabase().getNotificationState('user', 'u1')).toBeNull();
  });

  it('queues the digest on the next sweep once the outbox recovers', async () => {
    seedComment({ participantId: 'p1', authorName: 'Sam', minutesOld: 30 });
    mocks.enqueueEmail.mockImplementationOnce(() => {
      throw new Error('outbox unavailable');
    });

    await sweep();
    await sweep();

    expect(getPendingEmails()).toHaveLength(1);
  });
});

describe('failure containment', () => {
  it('keeps sweeping after one deployment throws', async () => {
    const broken = randomUUID();
    mocks.listDeploymentIds.mockReturnValue([broken, deploymentId]);
    mocks.resolveDeployment.mockImplementation(async (id: string) => {
      if (id === broken) throw new Error('workspace database unreadable');
      return deploymentRecord({ enabled: true, notifyByEmail: true });
    });
    seedComment({ participantId: 'p1', authorName: 'Sam', minutesOld: 30 });

    await sweep();

    expect(getPendingEmails()).toHaveLength(1);
  });

  it('does not throw out of the task when the whole listing fails', async () => {
    mocks.listDeploymentIds.mockImplementation(() => {
      throw new Error('deployments directory missing');
    });

    await expect(sweep()).resolves.toBeUndefined();
  });
});
