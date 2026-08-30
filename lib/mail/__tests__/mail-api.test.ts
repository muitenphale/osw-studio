import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { NextRequest } from 'next/server';

/**
 * Who may read and change mail settings, and what comes back when they do.
 *
 * The session is stubbed because it reads a cookie; access control is not — `verifyWorkspaceAccess`
 * runs against a real system database with real users and grants, which is the only way the "an
 * instance admin passes unconditionally" branch gets exercised rather than described.
 *
 * Two things are load-bearing beyond the role checks. A stored SMTP password must not come back out
 * of either tier, and `mode: 'instance'` must be refused while no instance server exists: the UI
 * disables that option, but a stale client holding an older page must not be able to write a mode
 * that can never send.
 */

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({ requireAuth: vi.fn() }));

// The session reads a cookie; access control below it does not, and is left real.
vi.mock('@/lib/auth/session', () => ({ requireAuth: mocks.requireAuth }));

let dir: string;
let workspaceId: string;
let ownerId: string;
let editorId: string;
let adminId: string;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'osws-mail-api-'));
  vi.resetModules();
  vi.clearAllMocks();

  vi.stubEnv('DATA_DIR', path.join(dir, 'data'));
  for (const key of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM']) {
    vi.stubEnv(key, '');
  }

  const { createUser, createWorkspace, grantWorkspaceAccess, getSystemDatabase } =
    await import('@/lib/auth/system-database');

  ownerId = createUser('owner@agency.test', 'hash');
  editorId = createUser('editor@agency.test', 'hash');
  adminId = createUser('admin@instance.test', 'hash');
  getSystemDatabase().prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(adminId);

  workspaceId = createWorkspace('Agency', ownerId);
  grantWorkspaceAccess(editorId, workspaceId, 'editor');
});

afterEach(async () => {
  const { closeSystemDatabase } = await import('@/lib/auth/system-database');
  closeSystemDatabase();
  vi.unstubAllEnvs();
  fs.rmSync(dir, { recursive: true, force: true });
});

function signedInAs(userId: string, email: string, isAdmin: boolean): void {
  mocks.requireAuth.mockResolvedValue({ userId, email, isAdmin, exp: 0 });
}

function request(body?: unknown): NextRequest {
  return { json: async () => body, headers: { get: () => null } } as unknown as NextRequest;
}

function params() {
  return { params: Promise.resolve({ workspaceId }) };
}

// ---------------------------------------------------------------------------
// 10. Role guards
// ---------------------------------------------------------------------------

describe('instance mail settings guard', () => {
  it('refuses a signed-in non-admin', async () => {
    signedInAs(ownerId, 'owner@agency.test', false);

    const { GET } = await import('@/app/api/admin/mail/route');
    const response = await GET(request());

    expect(response.status).toBe(403);
  });

  it('refuses a non-admin trying to write', async () => {
    signedInAs(ownerId, 'owner@agency.test', false);

    const { PUT } = await import('@/app/api/admin/mail/route');
    const response = await PUT(request({ host: 'smtp.attacker.test' }));

    expect(response.status).toBe(403);

    const { readInstanceMailConfig } = await import('@/lib/mail/settings');
    expect(readInstanceMailConfig().host).toBeNull();
  });

  it('allows an instance admin', async () => {
    signedInAs(adminId, 'admin@instance.test', true);

    const { GET } = await import('@/app/api/admin/mail/route');
    const response = await GET(request());

    expect(response.status).toBe(200);
  });

  it('refuses an unauthenticated caller', async () => {
    mocks.requireAuth.mockRejectedValue(new Error('Unauthorized'));

    const { GET } = await import('@/app/api/admin/mail/route');
    expect((await GET(request())).status).toBe(401);
  });
});

describe('offering the instance server', () => {
  it('carries the switch through a write and back out of a read', async () => {
    signedInAs(adminId, 'admin@instance.test', true);

    const { GET, PUT } = await import('@/app/api/admin/mail/route');

    const saved = await (
      await PUT(request({ host: 'smtp.instance.test', from: 'noreply@instance.test', enabled: false }))
    ).json();
    // `configured` stays true: the server is complete and the instance still sends its own mail on
    // it. The switch is the separate `enabled`, and it is what the workspace tier is gated on.
    expect(saved).toMatchObject({ enabled: false, configured: true });

    expect(await (await GET(request())).json()).toMatchObject({ enabled: false });

    const reoffered = await (await PUT(request({ enabled: true }))).json();
    expect(reoffered).toMatchObject({ enabled: true, configured: true });
  });

  it('reports an incomplete server as unconfigured whichever way the switch is set', async () => {
    signedInAs(adminId, 'admin@instance.test', true);

    const { PUT } = await import('@/app/api/admin/mail/route');
    const body = await (await PUT(request({ host: 'smtp.instance.test', enabled: true }))).json();

    // A host with no From is not a working server: every relay worth using rejects a message with
    // no envelope sender.
    expect(body).toMatchObject({ enabled: true, configured: false });
  });

  it('refuses a switch that is not a boolean', async () => {
    signedInAs(adminId, 'admin@instance.test', true);

    const { PUT } = await import('@/app/api/admin/mail/route');
    const response = await PUT(request({ enabled: 'no' }));

    expect(response.status).toBe(400);
  });
});

describe('workspace mail settings guard', () => {
  it('refuses a workspace editor', async () => {
    // An editor can act on feedback; changing where a client's mail comes from is an owner decision.
    signedInAs(editorId, 'editor@agency.test', false);

    const { GET } = await import('@/app/api/w/[workspaceId]/mail/route');
    const response = await GET(request(), params());

    expect(response.status).toBe(403);
  });

  it('allows the workspace owner', async () => {
    signedInAs(ownerId, 'owner@agency.test', false);

    const { GET } = await import('@/app/api/w/[workspaceId]/mail/route');
    const response = await GET(request(), params());

    expect(response.status).toBe(200);
  });

  it('allows an instance admin who is not a member of the workspace', async () => {
    signedInAs(adminId, 'admin@instance.test', true);

    const { GET } = await import('@/app/api/w/[workspaceId]/mail/route');
    const response = await GET(request(), params());

    expect(response.status).toBe(200);
  });

  it('refuses a user with no grant at all', async () => {
    const { createUser } = await import('@/lib/auth/system-database');
    const strangerId = createUser('stranger@elsewhere.test', 'hash');
    signedInAs(strangerId, 'stranger@elsewhere.test', false);

    const { GET } = await import('@/app/api/w/[workspaceId]/mail/route');
    expect((await GET(request(), params())).status).toBe(403);
  });

  it('refuses an editor on the workspace queue view', async () => {
    signedInAs(editorId, 'editor@agency.test', false);

    const { GET } = await import('@/app/api/w/[workspaceId]/mail/queue/route');
    expect((await GET(request(), params())).status).toBe(403);
  });
});

describe('switching a workspace on', () => {
  it('starts off and carries the switch through a write and back out of a read', async () => {
    const { writeInstanceMail } = await import('@/lib/mail/settings');
    writeInstanceMail({ host: 'smtp.instance.test', from: 'noreply@instance.test' });

    signedInAs(ownerId, 'owner@agency.test', false);

    const { GET, PUT } = await import('@/app/api/w/[workspaceId]/mail/route');

    expect((await (await GET(request(), params())).json()).enabled).toBe(false);

    const saved = await (await PUT(request({ enabled: true, mode: 'instance' }), params())).json();
    expect(saved).toMatchObject({ enabled: true, mode: 'instance' });

    expect((await (await GET(request(), params())).json()).enabled).toBe(true);
  });

  it('switches a workspace off without being told its mode or its server again', async () => {
    // The page hides the form behind the switch, so a save made with it off carries only the
    // switch. An omitted field is unchanged, which is what keeps the stored server intact.
    const { writeWorkspaceMail } = await import('@/lib/mail/settings');
    writeWorkspaceMail(workspaceId, {
      enabled: true,
      mode: 'own',
      host: 'smtp.agency.test',
      from: 'hello@agency.test',
    });

    signedInAs(ownerId, 'owner@agency.test', false);

    const { PUT } = await import('@/app/api/w/[workspaceId]/mail/route');
    const response = await PUT(request({ enabled: false }), params());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      enabled: false,
      mode: 'own',
      host: 'smtp.agency.test',
    });
  });

  it('refuses a switch that is not a boolean', async () => {
    signedInAs(ownerId, 'owner@agency.test', false);

    const { PUT } = await import('@/app/api/w/[workspaceId]/mail/route');
    expect((await PUT(request({ enabled: 'yes' }), params())).status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// 11. PUT workspace mail rejects `mode: 'instance'` with no instance server
// ---------------------------------------------------------------------------

describe('choosing instance mode', () => {
  it('is refused while the instance has no mail server', async () => {
    signedInAs(ownerId, 'owner@agency.test', false);

    const { PUT } = await import('@/app/api/w/[workspaceId]/mail/route');
    const response = await PUT(request({ mode: 'instance', displayName: 'Agency' }), params());

    expect(response.status).toBe(400);

    const { readWorkspaceMailSettings } = await import('@/lib/mail/settings');
    expect(readWorkspaceMailSettings(workspaceId).displayName).toBeNull();
  });

  it('is allowed once an instance server exists', async () => {
    const { writeInstanceMail } = await import('@/lib/mail/settings');
    writeInstanceMail({ host: 'smtp.instance.test', from: 'noreply@instance.test' });

    signedInAs(ownerId, 'owner@agency.test', false);

    const { PUT } = await import('@/app/api/w/[workspaceId]/mail/route');
    const response = await PUT(request({ mode: 'instance', displayName: 'Agency' }), params());

    expect(response.status).toBe(200);

    const { readWorkspaceMailSettings } = await import('@/lib/mail/settings');
    expect(readWorkspaceMailSettings(workspaceId)).toMatchObject({ mode: 'instance', displayName: 'Agency' });
  });

  it('is allowed when the instance server comes only from the environment', async () => {
    vi.stubEnv('SMTP_HOST', 'smtp.provisioned.test');
    vi.stubEnv('SMTP_FROM', 'noreply@provisioned.test');
    signedInAs(ownerId, 'owner@agency.test', false);

    const { PUT } = await import('@/app/api/w/[workspaceId]/mail/route');
    expect((await PUT(request({ mode: 'instance' }), params())).status).toBe(200);
  });

  it('is refused while the instance server is switched off', async () => {
    // A complete instance configuration that the operator has chosen not to offer is not a server a
    // workspace may point itself at. Same dead end as having none, and refused in the same place.
    const { writeInstanceMail } = await import('@/lib/mail/settings');
    writeInstanceMail({ host: 'smtp.instance.test', from: 'noreply@instance.test', enabled: false });

    signedInAs(ownerId, 'owner@agency.test', false);

    const { PUT } = await import('@/app/api/w/[workspaceId]/mail/route');
    const response = await PUT(request({ mode: 'instance', displayName: 'Agency' }), params());

    expect(response.status).toBe(400);

    const { readWorkspaceMailSettings } = await import('@/lib/mail/settings');
    expect(readWorkspaceMailSettings(workspaceId).displayName).toBeNull();
  });

  it('still accepts own mode with no instance server', async () => {
    signedInAs(ownerId, 'owner@agency.test', false);

    const { PUT } = await import('@/app/api/w/[workspaceId]/mail/route');
    const response = await PUT(
      request({ mode: 'own', host: 'smtp.agency.test', port: 587, secure: 'starttls', user: 'agency', password: 'agency-secret', from: 'hello@agency.test' }),
      params()
    );

    expect(response.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// 12. Neither response carries a password; both carry the …Set flag
// ---------------------------------------------------------------------------

describe('passwords never leave the server', () => {
  it('omits the instance password and reports only that one is set', async () => {
    const { writeInstanceMail } = await import('@/lib/mail/settings');
    writeInstanceMail({ host: 'smtp.instance.test', user: 'ops', password: 'instance-secret', from: 'noreply@instance.test' });

    signedInAs(adminId, 'admin@instance.test', true);

    const { GET } = await import('@/app/api/admin/mail/route');
    const response = await GET(request());
    const body = await response.json();

    expect(JSON.stringify(body)).not.toContain('instance-secret');
    expect(body.smtpPasswordSet).toBe(true);
    expect(body.host).toBe('smtp.instance.test');
  });

  it('omits the workspace password and reports only that one is set', async () => {
    const { writeWorkspaceMail } = await import('@/lib/mail/settings');
    writeWorkspaceMail(workspaceId, {
      mode: 'own',
      host: 'smtp.agency.test',
      user: 'agency',
      password: 'agency-secret',
      from: 'hello@agency.test',
    });

    signedInAs(ownerId, 'owner@agency.test', false);

    const { GET } = await import('@/app/api/w/[workspaceId]/mail/route');
    const response = await GET(request(), params());
    const body = await response.json();

    expect(JSON.stringify(body)).not.toContain('agency-secret');
    expect(body.smtpPasswordSet).toBe(true);
    expect(body.host).toBe('smtp.agency.test');
  });

  it('does not echo a password back out of the write that set it', async () => {
    signedInAs(adminId, 'admin@instance.test', true);

    const { PUT } = await import('@/app/api/admin/mail/route');
    const response = await PUT(request({ host: 'smtp.instance.test', password: 'instance-secret', from: 'noreply@instance.test' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(JSON.stringify(body)).not.toContain('instance-secret');
    expect(body.smtpPasswordSet).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// What a workspace owner is told about the tier above them
// ---------------------------------------------------------------------------

describe('the instance tier as seen from a workspace', () => {
  it('reports that there is a server to relay through', async () => {
    const { writeInstanceMail } = await import('@/lib/mail/settings');
    writeInstanceMail({ host: 'smtp.instance.test', from: 'noreply@instance.test' });

    signedInAs(ownerId, 'owner@agency.test', false);

    const { GET } = await import('@/app/api/w/[workspaceId]/mail/route');
    const body = await (await GET(request(), params())).json();

    expect(body.instanceConfigured).toBe(true);
  });

  it('reports that there is not, both when there is no server and when it is switched off', async () => {
    // Without this an owner is offered a mode the PUT will refuse, which is an error they have no
    // way to act on: the thing that would fix it is not theirs to change.
    signedInAs(ownerId, 'owner@agency.test', false);

    const { GET } = await import('@/app/api/w/[workspaceId]/mail/route');
    expect((await (await GET(request(), params())).json()).instanceConfigured).toBe(false);

    const { writeInstanceMail } = await import('@/lib/mail/settings');
    writeInstanceMail({ host: 'smtp.instance.test', from: 'noreply@instance.test', enabled: false });

    expect((await (await GET(request(), params())).json()).instanceConfigured).toBe(false);
  });

  it('reports it as one boolean and nothing else about the instance', async () => {
    // A workspace owner on a hosted instance is a tenant. Whether they can relay is theirs to know;
    // the operator's relay, credentials and address are not.
    const { writeInstanceMail } = await import('@/lib/mail/settings');
    writeInstanceMail({
      host: 'smtp.instance.test',
      user: 'ops',
      password: 'instance-secret',
      from: 'noreply@instance.test',
    });

    signedInAs(ownerId, 'owner@agency.test', false);

    const { GET } = await import('@/app/api/w/[workspaceId]/mail/route');
    const body = await (await GET(request(), params())).json();
    const serialised = JSON.stringify(body);

    expect(body.instanceConfigured).toBe(true);
    for (const secret of ['smtp.instance.test', 'ops', 'instance-secret', 'noreply@instance.test']) {
      expect(serialised).not.toContain(secret);
    }
  });
});

// ---------------------------------------------------------------------------
// What happens to the queue when a tier is switched off
// ---------------------------------------------------------------------------

/**
 * Off means off, in both halves.
 *
 * Composition stops writing for a closed channel (lib/scheduler/review-notifications.ts) and every
 * recipient is brought up to date, so that switching it back on starts from that moment. Rows
 * queued in the moments before the switch moved would undo exactly that: delivery holds them rather
 * than failing them, and they would go out together when the switch came back.
 */
describe('switching a workspace off', () => {
  async function switchOff() {
    const { PUT } = await import('@/app/api/w/[workspaceId]/mail/route');
    return PUT(request({ enabled: false }), params());
  }

  it('discards what that workspace had queued', async () => {
    const { writeWorkspaceMail } = await import('@/lib/mail/settings');
    const { enqueueEmail, getPendingEmails } = await import('@/lib/mail/outbox');

    writeWorkspaceMail(workspaceId, {
      enabled: true,
      mode: 'own',
      host: 'smtp.agency.test',
      from: 'hello@agency.test',
    });
    enqueueEmail({ workspaceId, to: 'sam@client.example', subject: 'A', bodyText: 'x' });
    const elsewhere = enqueueEmail({ workspaceId: 'another-workspace', to: 'b@client.example', subject: 'B', bodyText: 'x' });

    signedInAs(ownerId, 'owner@agency.test', false);
    expect((await switchOff()).status).toBe(200);

    expect(getPendingEmails().map((e) => e.id)).toEqual([elsewhere]);
  });

  it('leaves the queue alone when it was already off', async () => {
    // Nothing has been composed for it since it went off, so anything here belongs to a state this
    // save did not change. Only the transition discards.
    const { enqueueEmail, getPendingEmails } = await import('@/lib/mail/outbox');
    const queued = enqueueEmail({ workspaceId, to: 'sam@client.example', subject: 'A', bodyText: 'x' });

    signedInAs(ownerId, 'owner@agency.test', false);
    expect((await switchOff()).status).toBe(200);

    expect(getPendingEmails().map((e) => e.id)).toEqual([queued]);
  });
});

describe('withdrawing the instance offer', () => {
  it('discards what the relaying workspaces had queued, and keeps the instance’s own', async () => {
    const { writeInstanceMail, writeWorkspaceMail } = await import('@/lib/mail/settings');
    const { enqueueEmail, getPendingEmails } = await import('@/lib/mail/outbox');

    writeInstanceMail({ host: 'smtp.instance.test', from: 'noreply@instance.test' });
    writeWorkspaceMail(workspaceId, { enabled: true, mode: 'instance' });

    enqueueEmail({ workspaceId, to: 'sam@client.example', subject: 'A', bodyText: 'x' });
    const own = enqueueEmail({ to: 'admin@instance.test', subject: 'B', bodyText: 'x' });

    signedInAs(adminId, 'admin@instance.test', true);
    const { PUT } = await import('@/app/api/admin/mail/route');
    expect((await PUT(request({ enabled: false }))).status).toBe(200);

    // The instance still has a server and still sends its own mail on it; the offer is what was
    // withdrawn.
    expect(getPendingEmails().map((e) => e.id)).toEqual([own]);
  });

  it('leaves a workspace sending through its own server untouched', async () => {
    // The withdrawal says nothing about a server the operator does not own.
    const { writeInstanceMail, writeWorkspaceMail } = await import('@/lib/mail/settings');
    const { enqueueEmail, getPendingEmails } = await import('@/lib/mail/outbox');

    writeInstanceMail({ host: 'smtp.instance.test', from: 'noreply@instance.test' });
    writeWorkspaceMail(workspaceId, {
      enabled: true,
      mode: 'own',
      host: 'smtp.agency.test',
      from: 'hello@agency.test',
    });
    const theirs = enqueueEmail({ workspaceId, to: 'sam@client.example', subject: 'A', bodyText: 'x' });

    signedInAs(adminId, 'admin@instance.test', true);
    const { PUT } = await import('@/app/api/admin/mail/route');
    await PUT(request({ enabled: false }));

    expect(getPendingEmails().map((e) => e.id)).toEqual([theirs]);
  });

  it('does the same when the server is emptied rather than switched off', async () => {
    // Clearing the host withdraws the offer just as completely, and the two have to be treated
    // alike or the queue's fate would depend on which control the operator reached for.
    const { writeInstanceMail, writeWorkspaceMail } = await import('@/lib/mail/settings');
    const { enqueueEmail, getPendingEmails } = await import('@/lib/mail/outbox');

    writeInstanceMail({ host: 'smtp.instance.test', from: 'noreply@instance.test' });
    writeWorkspaceMail(workspaceId, { enabled: true, mode: 'instance' });
    enqueueEmail({ workspaceId, to: 'sam@client.example', subject: 'A', bodyText: 'x' });

    signedInAs(adminId, 'admin@instance.test', true);
    const { PUT } = await import('@/app/api/admin/mail/route');
    await PUT(request({ host: null }));

    expect(getPendingEmails()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Queue visibility and the test send
// ---------------------------------------------------------------------------

describe('queue view', () => {
  it('counts what is waiting and how long the oldest has waited', async () => {
    const { enqueueEmail, markFailed } = await import('@/lib/mail/outbox');
    const { getSystemDatabase } = await import('@/lib/auth/system-database');

    const old = enqueueEmail({ workspaceId, to: 'a@client.example', subject: 'A', bodyText: 'x' });
    const failing = enqueueEmail({ workspaceId, to: 'b@client.example', subject: 'B', bodyText: 'x' });
    markFailed(failing);
    getSystemDatabase()
      .prepare("UPDATE email_outbox SET created_at = datetime('now', '-2 hours') WHERE id = ?")
      .run(old);

    signedInAs(adminId, 'admin@instance.test', true);

    const { GET } = await import('@/app/api/admin/mail/queue/route');
    const body = await (await GET(request())).json();

    expect(body.pending).toBe(2);
    expect(body.failing).toBe(1);
    expect(body.oldestPendingAgeSeconds).toBeGreaterThanOrEqual(7000);
  });

  it('shows a workspace owner only their own workspace queue', async () => {
    const { enqueueEmail } = await import('@/lib/mail/outbox');
    enqueueEmail({ workspaceId, to: 'a@client.example', subject: 'A', bodyText: 'x' });
    enqueueEmail({ workspaceId: 'someone-else', to: 'b@client.example', subject: 'B', bodyText: 'x' });
    enqueueEmail({ to: 'admin@localhost', subject: 'C', bodyText: 'x' });

    signedInAs(ownerId, 'owner@agency.test', false);

    const { GET } = await import('@/app/api/w/[workspaceId]/mail/queue/route');
    const body = await (await GET(request(), params())).json();

    expect(body.pending).toBe(1);
  });

  it('never lists a recipient address', async () => {
    const { enqueueEmail } = await import('@/lib/mail/outbox');
    enqueueEmail({ workspaceId, to: 'private@client.example', subject: 'A', bodyText: 'x' });

    signedInAs(adminId, 'admin@instance.test', true);

    const { GET } = await import('@/app/api/admin/mail/queue/route');
    const body = await (await GET(request())).json();

    expect(JSON.stringify(body)).not.toContain('private@client.example');
  });
});

describe('the test send', () => {
  it('refuses a non-admin on the instance test route', async () => {
    signedInAs(ownerId, 'owner@agency.test', false);

    const { POST } = await import('@/app/api/admin/mail/test/route');
    expect((await POST(request())).status).toBe(403);
  });

  it('refuses a workspace editor on the workspace test route', async () => {
    signedInAs(editorId, 'editor@agency.test', false);

    const { POST } = await import('@/app/api/w/[workspaceId]/mail/test/route');
    expect((await POST(request(), params())).status).toBe(403);
  });

  it('says mail is not configured rather than pretending to send', async () => {
    signedInAs(adminId, 'admin@instance.test', true);

    const { POST } = await import('@/app/api/admin/mail/test/route');
    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/not configured/i);
  });

  it('returns the server error verbatim so a misconfiguration is legible', async () => {
    // A reworded summary is why a wrong password stays invisible until a client says they never
    // heard from anyone.
    vi.doMock('@/lib/mail/transport', () => ({
      resolveTransport: vi.fn(async () => ({
        from: 'noreply@instance.test',
        sendMail: async () => { throw new Error('535 5.7.8 Authentication credentials invalid'); },
        close: () => {},
      })),
    }));

    signedInAs(adminId, 'admin@instance.test', true);

    const { POST } = await import('@/app/api/admin/mail/test/route');
    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.error).toBe('535 5.7.8 Authentication credentials invalid');
  });

  it('sends to the signed-in admin and nobody else', async () => {
    const sent: string[] = [];
    vi.doMock('@/lib/mail/transport', () => ({
      resolveTransport: vi.fn(async () => ({
        from: 'noreply@instance.test',
        sendMail: async (message: { to: string }) => { sent.push(message.to); },
        close: () => {},
      })),
    }));

    signedInAs(adminId, 'admin@instance.test', true);

    const { POST } = await import('@/app/api/admin/mail/test/route');
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(sent).toEqual(['admin@instance.test']);
  });
});

describe('flushing the queue by hand', () => {
  it('refuses a non-admin', async () => {
    signedInAs(ownerId, 'owner@agency.test', false);

    const { POST } = await import('@/app/api/admin/mail/queue/flush/route');
    expect((await POST(request())).status).toBe(403);
  });

  it('runs a delivery pass and reports what it did', async () => {
    vi.doMock('@/lib/mail/delivery', () => ({
      deliverPendingEmails: vi.fn(async () => ({ accepted: 2, failed: 0, held: 1 })),
    }));

    signedInAs(adminId, 'admin@instance.test', true);

    const { POST } = await import('@/app/api/admin/mail/queue/flush/route');
    const body = await (await POST(request())).json();

    expect(body).toMatchObject({ accepted: 2, failed: 0, held: 1 });
  });
});
