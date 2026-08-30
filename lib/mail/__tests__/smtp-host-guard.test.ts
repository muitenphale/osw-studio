import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { NextRequest } from 'next/server';

/**
 * Where a workspace is allowed to point its SMTP server.
 *
 * A workspace owner on a hosted instance is a tenant, not the operator of the box, so a host they
 * type is an address the instance will open a connection to on their behalf. Left unchecked that is
 * a request forgery with a readable answer: the test-send route hands back the SMTP error verbatim,
 * which is exactly what turns "connect to 169.254.169.254" into a port scan of the host's own
 * network.
 *
 * The instance tier is the opposite case and must stay the opposite case. An admin who sets
 * `localhost:1025` is pointing the instance at their own Mailhog, which is the documented way to
 * develop against this, and at an internal relay in production. Test 4 below is the regression guard
 * for that: the fix must not become a blanket ban on private hosts.
 *
 * No test here touches DNS or a socket. The resolver is injected wherever a name has to resolve, and
 * every other case uses an IP literal, which the guard decides without a lookup.
 */

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({ requireAuth: vi.fn() }));

vi.mock('@/lib/auth/session', () => ({ requireAuth: mocks.requireAuth }));

let dir: string;
let workspaceId: string;
let ownerId: string;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'osws-mail-host-guard-'));
  vi.resetModules();
  vi.clearAllMocks();

  vi.stubEnv('DATA_DIR', path.join(dir, 'data'));
  for (const key of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM']) {
    vi.stubEnv(key, '');
  }

  const { createUser, createWorkspace } = await import('@/lib/auth/system-database');
  ownerId = createUser('owner@agency.test', 'hash');
  workspaceId = createWorkspace('Agency', ownerId);
});

afterEach(async () => {
  const { closeSystemDatabase } = await import('@/lib/auth/system-database');
  closeSystemDatabase();
  vi.unstubAllEnvs();
  fs.rmSync(dir, { recursive: true, force: true });
});

/** An own-mode workspace pointed at `host`. `secure: 'none'` so nothing here needs a certificate. */
async function workspaceSends(host: string): Promise<void> {
  const { writeWorkspaceMail } = await import('@/lib/mail/settings');
  writeWorkspaceMail(workspaceId, {
    enabled: true,
    mode: 'own',
    host,
    port: 1025,
    secure: 'none',
    from: 'hello@agency.test',
  });
}

async function instanceSends(host: string): Promise<void> {
  const { writeInstanceMail } = await import('@/lib/mail/settings');
  writeInstanceMail({ host, port: 1025, secure: 'none', from: 'dev@instance.test' });
}

// ---------------------------------------------------------------------------
// 1. A workspace cannot point the instance at the instance's own network
// ---------------------------------------------------------------------------

describe('a workspace SMTP host', () => {
  it('is refused when it is loopback, link-local, metadata or private', async () => {
    const { resolveTransport } = await import('@/lib/mail/transport');
    const { BlockedHostError } = await import('@/lib/web/ssrf-guard');

    for (const host of ['127.0.0.1', 'localhost', '169.254.169.254', '10.0.0.5']) {
      await workspaceSends(host);
      await expect(resolveTransport(workspaceId)).rejects.toBeInstanceOf(BlockedHostError);
    }
  });

  // -------------------------------------------------------------------------
  // 2. A name is not a defence: the guard has to look at what it resolves to
  // -------------------------------------------------------------------------

  it('is refused when a public-looking name resolves to a private address', async () => {
    const { resolveTransport } = await import('@/lib/mail/transport');
    const { BlockedHostError } = await import('@/lib/web/ssrf-guard');

    await workspaceSends('smtp.agency.test');

    await expect(
      resolveTransport(workspaceId, { resolve: async () => ['10.0.0.5'] })
    ).rejects.toBeInstanceOf(BlockedHostError);
  });

  it('is refused when only one of several answers is private', async () => {
    const { resolveTransport } = await import('@/lib/mail/transport');
    const { BlockedHostError } = await import('@/lib/web/ssrf-guard');

    await workspaceSends('smtp.agency.test');

    await expect(
      resolveTransport(workspaceId, { resolve: async () => ['93.184.216.34', '127.0.0.1'] })
    ).rejects.toBeInstanceOf(BlockedHostError);
  });

  // -------------------------------------------------------------------------
  // 3. The guard has to still let real mail servers through
  // -------------------------------------------------------------------------

  it('is accepted when it resolves to a public address', async () => {
    const { resolveTransport } = await import('@/lib/mail/transport');

    await workspaceSends('smtp.agency.test');

    const transport = await resolveTransport(workspaceId, { resolve: async () => ['93.184.216.34'] });

    expect(transport).not.toBeNull();
    expect(transport?.from).toBe('hello@agency.test');
    transport?.close();
  });

  it('is accepted as a public IP literal', async () => {
    const { resolveTransport } = await import('@/lib/mail/transport');

    await workspaceSends('93.184.216.34');

    const transport = await resolveTransport(workspaceId);

    expect(transport).not.toBeNull();
    transport?.close();
  });
});

// ---------------------------------------------------------------------------
// 4. The instance tier is the operator's own machine
// ---------------------------------------------------------------------------

describe('the instance SMTP host', () => {
  it('may be localhost, because the admin owns the box', async () => {
    // The documented development path is Mailhog on localhost:1025. Hardening this tier would break
    // it, and it is the operator's own network either way.
    const { resolveTransport } = await import('@/lib/mail/transport');

    await instanceSends('localhost');

    const transport = await resolveTransport(null);

    expect(transport).not.toBeNull();
    transport?.close();
  });

  it('may be a private address, because an internal relay is a normal production setup', async () => {
    const { resolveTransport } = await import('@/lib/mail/transport');

    await instanceSends('10.0.0.5');

    const transport = await resolveTransport(null);

    expect(transport).not.toBeNull();
    transport?.close();
  });

  it('still carries a workspace relaying through it', async () => {
    // The workspace never chose this host, so the workspace guard has nothing to say about it.
    const { resolveTransport } = await import('@/lib/mail/transport');
    const { writeWorkspaceMail } = await import('@/lib/mail/settings');

    await instanceSends('localhost');
    writeWorkspaceMail(workspaceId, { enabled: true, mode: 'instance', displayName: 'Agency' });

    const transport = await resolveTransport(workspaceId);

    expect(transport).not.toBeNull();
    transport?.close();
  });
});

// ---------------------------------------------------------------------------
// 5. The test endpoint must not leak through the door the guard just shut
// ---------------------------------------------------------------------------

describe('the workspace test-send endpoint', () => {
  function request(): NextRequest {
    return { json: async () => ({}), headers: { get: () => null } } as unknown as NextRequest;
  }

  it('answers a blocked host with a refusal, not with a connection error', async () => {
    mocks.requireAuth.mockResolvedValue({
      userId: ownerId,
      email: 'owner@agency.test',
      isAdmin: false,
      exp: 0,
    });

    await workspaceSends('127.0.0.1');

    const { POST } = await import('@/app/api/w/[workspaceId]/mail/test/route');
    const response = await POST(request(), { params: Promise.resolve({ workspaceId }) });
    const body = await response.json();

    // 400, not the 502 that carries the SMTP server's own words: a connection-level answer here
    // would still report whether something was listening, which is the finding itself.
    expect(response.status).toBe(400);
    expect(body.error).toMatch(/not allowed/i);
    expect(body.error).not.toMatch(/ECONN|ETIMEDOUT|EHOSTUNREACH|refused|connect/i);
    // Nothing about the address it would have dialled.
    expect(body.error).not.toContain('127.0.0.1');
  });

  it('reports an unconfigured workspace differently from a blocked one', async () => {
    mocks.requireAuth.mockResolvedValue({
      userId: ownerId,
      email: 'owner@agency.test',
      isAdmin: false,
      exp: 0,
    });

    const { POST } = await import('@/app/api/w/[workspaceId]/mail/test/route');
    const response = await POST(request(), { params: Promise.resolve({ workspaceId }) });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/no mail server is configured/i);
  });
});

// ---------------------------------------------------------------------------
// The guard itself, at the tier boundary, without the database in the way
// ---------------------------------------------------------------------------

describe('assertMailHostAllowed', () => {
  it('leaves the instance tier alone, and pins no address for it', async () => {
    const { assertMailHostAllowed } = await import('@/lib/mail/transport');

    // null rather than a list: an instance host is not checked, so there is no checked address to
    // connect to and the transport resolves the name itself, as it always has.
    await expect(
      assertMailHostAllowed({ tier: 'instance', host: '127.0.0.1' }, { resolve: async () => [] })
    ).resolves.toBeNull();
  });

  it('returns the checked addresses for a workspace host, so the connection can use them', async () => {
    const { assertMailHostAllowed } = await import('@/lib/mail/transport');

    await expect(
      assertMailHostAllowed(
        { tier: 'workspace', host: 'smtp.example.com' },
        { resolve: async () => ['93.184.216.34'] }
      )
    ).resolves.toEqual(['93.184.216.34']);
  });

  it('checks the workspace tier', async () => {
    const { assertMailHostAllowed } = await import('@/lib/mail/transport');
    const { BlockedHostError } = await import('@/lib/web/ssrf-guard');

    await expect(
      assertMailHostAllowed({ tier: 'workspace', host: '127.0.0.1' })
    ).rejects.toBeInstanceOf(BlockedHostError);
  });
});
