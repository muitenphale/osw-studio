import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { InstanceMailConfig, WorkspaceMailConfig } from '@/lib/mail/settings';

/**
 * Which SMTP server carries a given workspace's mail.
 *
 * The order is workspace override → instance → environment → nothing, and the last of those is a
 * real answer rather than an error: an instance with no mail configured is the normal state of a
 * fresh install, and the queue is designed to sit still until one appears.
 *
 * Resolution is a pure function over two config records, so every case below is decided without a
 * socket, a nodemailer import, or a system database.
 */

vi.mock('server-only', () => ({}));

const WORKSPACE = '11111111-1111-1111-1111-111111111111';

const UNCONFIGURED_INSTANCE: InstanceMailConfig = {
  enabled: true,
  host: null,
  port: null,
  secure: 'starttls',
  user: null,
  password: null,
  from: null,
};

const INSTANCE: InstanceMailConfig = {
  enabled: true,
  host: 'smtp.instance.test',
  port: 587,
  secure: 'starttls',
  user: 'instance-user',
  password: 'instance-secret',
  from: 'OSW Studio <noreply@instance.test>',
};

function workspaceMail(overrides: Partial<WorkspaceMailConfig> = {}): WorkspaceMailConfig {
  return {
    workspaceId: WORKSPACE,
    // Switched on unless a case says otherwise: every case below is about which server carries the
    // mail, which is only asked once the workspace has said it wants mail carried at all.
    enabled: true,
    mode: 'instance',
    displayName: null,
    host: null,
    port: null,
    secure: 'starttls',
    user: null,
    password: null,
    from: null,
    ...overrides,
  };
}

function transport() {
  return import('@/lib/mail/transport');
}

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'osws-mail-transport-'));
  vi.resetModules();
  vi.stubEnv('DATA_DIR', path.join(dir, 'data'));
  for (const key of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM']) {
    vi.stubEnv(key, '');
  }
});

afterEach(async () => {
  const { closeSystemDatabase } = await import('@/lib/auth/system-database');
  closeSystemDatabase();
  vi.unstubAllEnvs();
  fs.rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// 1. Workspace `own` uses its own config; `instance` uses the instance's
// ---------------------------------------------------------------------------

describe('resolveMailSource', () => {
  it('sends a workspace in own mode through its own server', async () => {
    const { resolveMailSource } = await transport();

    const source = resolveMailSource(
      INSTANCE,
      workspaceMail({
        mode: 'own',
        host: 'smtp.agency.test',
        port: 465,
        secure: 'ssl',
        user: 'agency',
        password: 'agency-secret',
        from: 'hello@agency.test',
        displayName: 'Agency',
      })
    );

    expect(source).toMatchObject({
      host: 'smtp.agency.test',
      port: 465,
      secure: 'ssl',
      user: 'agency',
      password: 'agency-secret',
      fromAddress: 'hello@agency.test',
    });
  });

  it('sends a workspace in instance mode through the instance server', async () => {
    const { resolveMailSource } = await transport();

    const source = resolveMailSource(INSTANCE, workspaceMail({ mode: 'instance' }));

    expect(source).toMatchObject({
      host: 'smtp.instance.test',
      user: 'instance-user',
      password: 'instance-secret',
      fromAddress: 'noreply@instance.test',
    });
  });

  it('lets an instance-mode workspace rename the sender but not readdress it', async () => {
    // A workspace address relayed through the instance's server fails SPF and DKIM alignment. The
    // display name is the only part that can change and stay aligned.
    const { resolveMailSource, formatFrom } = await transport();

    const source = resolveMailSource(INSTANCE, workspaceMail({ mode: 'instance', displayName: 'Bright Agency' }));

    expect(source?.fromAddress).toBe('noreply@instance.test');
    expect(source?.fromName).toBe('Bright Agency');
    expect(formatFrom(source!)).toBe('"Bright Agency" <noreply@instance.test>');
  });

  it('uses the instance server for mail with no workspace behind it', async () => {
    const { resolveMailSource } = await transport();

    expect(resolveMailSource(INSTANCE, null)).toMatchObject({ host: 'smtp.instance.test' });
  });

  // -------------------------------------------------------------------------
  // 2. No instance server and no workspace row → null
  // -------------------------------------------------------------------------

  it('returns null when there is no instance server and no workspace row', async () => {
    const { resolveMailSource } = await transport();

    expect(resolveMailSource(UNCONFIGURED_INSTANCE, null)).toBeNull();
  });

  // -------------------------------------------------------------------------
  // 3. `instance` mode with no instance server → null, not a broken transport
  // -------------------------------------------------------------------------

  it('returns null for an instance-mode workspace when no instance server exists', async () => {
    // Handing back a transport with an empty host would turn "not configured yet" into a stream of
    // connection failures, and every one of those would burn an attempt off a real message.
    const { resolveMailSource } = await transport();

    expect(resolveMailSource(UNCONFIGURED_INSTANCE, workspaceMail({ mode: 'instance' }))).toBeNull();
  });

  // -------------------------------------------------------------------------
  // The switch, as the pure resolver sees it: `workspace === null` is the instance's own mail
  // -------------------------------------------------------------------------

  it('still sends the instance’s own mail when the server is not offered', async () => {
    const { resolveMailSource } = await transport();

    expect(resolveMailSource({ ...INSTANCE, enabled: false }, null)).toMatchObject({
      host: 'smtp.instance.test',
    });
  });

  it('returns null for an instance-mode workspace when the server is not offered', async () => {
    const { resolveMailSource } = await transport();

    expect(
      resolveMailSource({ ...INSTANCE, enabled: false }, workspaceMail({ mode: 'instance' }))
    ).toBeNull();
  });

  it('leaves an own-mode workspace alone when the server is not offered', async () => {
    const { resolveMailSource } = await transport();

    expect(
      resolveMailSource(
        { ...INSTANCE, enabled: false },
        workspaceMail({ mode: 'own', host: 'smtp.agency.test', from: 'hello@agency.test' })
      )
    ).toMatchObject({ host: 'smtp.agency.test' });
  });

  it('returns null for an own-mode workspace that is missing its server', async () => {
    const { resolveMailSource } = await transport();

    expect(resolveMailSource(INSTANCE, workspaceMail({ mode: 'own', from: 'hello@agency.test' }))).toBeNull();
    expect(resolveMailSource(INSTANCE, workspaceMail({ mode: 'own', host: 'smtp.agency.test' }))).toBeNull();
  });

  // -------------------------------------------------------------------------
  // The workspace's own switch, which outranks both modes
  // -------------------------------------------------------------------------

  it('returns null for a switched-off workspace in either mode', async () => {
    // Null rather than a transport, so the drain loop holds these rows instead of spending an
    // attempt each on a server the workspace has just said not to use.
    const { resolveMailSource } = await transport();

    expect(resolveMailSource(INSTANCE, workspaceMail({ enabled: false, mode: 'instance' }))).toBeNull();
    expect(
      resolveMailSource(
        INSTANCE,
        workspaceMail({
          enabled: false,
          mode: 'own',
          host: 'smtp.agency.test',
          from: 'hello@agency.test',
        })
      )
    ).toBeNull();
  });

  it('still sends the instance’s own mail while a workspace is switched off', async () => {
    // There is no workspace switch to consult for mail with no workspace behind it.
    const { resolveMailSource } = await transport();

    expect(resolveMailSource(INSTANCE, null)).toMatchObject({ host: 'smtp.instance.test' });
  });

  it('falls back to a default port for the chosen security', async () => {
    const { resolveMailSource } = await transport();

    const implicitTls = resolveMailSource(
      UNCONFIGURED_INSTANCE,
      workspaceMail({ mode: 'own', host: 'smtp.agency.test', secure: 'ssl', from: 'hello@agency.test' })
    );
    const startTls = resolveMailSource(
      UNCONFIGURED_INSTANCE,
      workspaceMail({ mode: 'own', host: 'smtp.agency.test', secure: 'starttls', from: 'hello@agency.test' })
    );

    expect(implicitTls?.port).toBe(465);
    expect(startTls?.port).toBe(587);
  });
});

describe('resolveTransport', () => {
  it('holds rather than building a transport when nothing is configured', async () => {
    // Reached through the real settings readers, so this covers the wiring the pure cases above do
    // not: an empty database plus an empty environment still resolves to nothing.
    const { resolveTransport } = await transport();

    expect(await resolveTransport(WORKSPACE)).toBeNull();
    expect(await resolveTransport(null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The instance switch: an operator may run a mail server without offering it
// ---------------------------------------------------------------------------

/**
 * These go through the real settings store and the real transport rather than the pure resolver,
 * because what is being pinned is a stored value's *absence*. A config literal written in a test
 * cannot be missing a field the type requires, so only a database with no `mail.smtp.enabled` row in
 * it can show what an existing install resolves to.
 */
describe('the instance mail switch', () => {
  async function workspace(): Promise<string> {
    const { createUser, createWorkspace } = await import('@/lib/auth/system-database');
    return createWorkspace('Agency', createUser('owner@agency.test', 'hash'));
  }

  it('resolves a transport for a store that has never heard of the switch', async () => {
    // The migration guard, and the reason absent has to mean enabled. Every install that predates
    // this setting has a host and a From and no row for it, and the ones provisioned from SMTP_*
    // will never write one. If absent read as off, mail would stop everywhere at once — and the
    // symptom, digests accumulating in the outbox, is also what a correctly unconfigured instance
    // looks like, so nobody would recognise it as a regression.
    const { writeInstanceMail } = await import('@/lib/mail/settings');
    writeInstanceMail({ host: 'smtp.instance.test', from: 'noreply@instance.test' });

    const { getSystemDatabase } = await import('@/lib/auth/system-database');
    const keys = (
      getSystemDatabase().prepare('SELECT key FROM instance_settings').all() as Array<{ key: string }>
    ).map((row) => row.key);
    expect(keys).not.toContain('mail.smtp.enabled');

    const { resolveTransport } = await transport();
    const resolved = await resolveTransport(null);

    expect(resolved).not.toBeNull();
    resolved?.close();
  });

  it('keeps the instance’s own mail sending once it is switched off', async () => {
    // The switch decides who may relay through this server, not whether it runs. An admin who turns
    // it off still has to be able to send a test to the server they just configured — gating that
    // would leave the only way to verify a mail server behind the setting that offers it, and turn
    // the switch into a roundabout way of clearing the host.
    const { writeInstanceMail, isInstanceMailOffered } = await import('@/lib/mail/settings');
    writeInstanceMail({
      host: 'smtp.instance.test',
      from: 'noreply@instance.test',
      enabled: false,
    });

    expect(isInstanceMailOffered()).toBe(false);

    const { resolveTransport } = await transport();
    const resolved = await resolveTransport(null);

    expect(resolved?.from).toBe('noreply@instance.test');
    resolved?.close();
  });

  it('holds a workspace that has never opened its mail settings', async () => {
    // A workspace with no `workspace_mail` row is in instance mode — that is the default — so the
    // switch has to reach it. It is the case where the two meanings of "no workspace config" would
    // otherwise collapse into one another.
    const workspaceId = await workspace();

    const { writeInstanceMail } = await import('@/lib/mail/settings');
    writeInstanceMail({ host: 'smtp.instance.test', from: 'noreply@instance.test', enabled: false });

    const { readWorkspaceMailConfig } = await import('@/lib/mail/settings');
    expect(readWorkspaceMailConfig(workspaceId)).toBeNull();

    const { resolveTransport } = await transport();
    expect(await resolveTransport(workspaceId)).toBeNull();
  });

  it('holds an instance-mode workspace’s queue rather than failing it', async () => {
    // The whole point of returning null rather than a transport that cannot connect: the drain loop
    // already treats "nothing to send with" as hold, and switching the instance off has to land on
    // that branch rather than beside it. `attempts` is asserted directly — "still pending" alone
    // would pass while the counter walked to the cap and killed the queue.
    const workspaceId = await workspace();

    const { writeInstanceMail, writeWorkspaceMail } = await import('@/lib/mail/settings');
    writeInstanceMail({ host: 'smtp.instance.test', from: 'noreply@instance.test', enabled: false });
    writeWorkspaceMail(workspaceId, { enabled: true, mode: 'instance', displayName: 'Agency' });

    const { resolveTransport } = await transport();
    expect(await resolveTransport(workspaceId)).toBeNull();

    const { enqueueEmail } = await import('@/lib/mail/outbox');
    enqueueEmail({ workspaceId, to: 'sam@client.example', subject: 'A', bodyText: 'x' });

    const { deliverPendingEmails } = await import('@/lib/mail/delivery');
    const result = await deliverPendingEmails();

    expect(result).toMatchObject({ accepted: 0, failed: 0, held: 1 });

    const { getSystemDatabase } = await import('@/lib/auth/system-database');
    const row = getSystemDatabase()
      .prepare('SELECT delivered, attempts FROM email_outbox')
      .get() as { delivered: number; attempts: number };

    expect(row).toMatchObject({ delivered: 0, attempts: 0 });
  });

  it('leaves a workspace’s own server sending', async () => {
    // Switching the instance's server off is a decision about the instance's server. An agency that
    // brought its own relay has nothing to do with it.
    const workspaceId = await workspace();

    const { writeInstanceMail, writeWorkspaceMail } = await import('@/lib/mail/settings');
    writeInstanceMail({ host: 'smtp.instance.test', from: 'noreply@instance.test', enabled: false });
    writeWorkspaceMail(workspaceId, {
      enabled: true,
      mode: 'own',
      host: 'smtp.agency.test',
      from: 'hello@agency.test',
    });

    const { resolveTransport } = await transport();
    const resolved = await resolveTransport(workspaceId, { resolve: async () => ['93.184.216.34'] });

    expect(resolved?.from).toBe('hello@agency.test');
    resolved?.close();
  });
});

// ---------------------------------------------------------------------------
// The workspace switch, through the real store and the real drain loop
// ---------------------------------------------------------------------------

/**
 * The workspace tier's own switch, which is a stored boolean rather than an interpreted absence.
 * These go through the settings store because what is being pinned is what a row — or the lack of
 * one — resolves to, which a config literal written in a test cannot show.
 */
describe('the workspace mail switch', () => {
  async function workspace(): Promise<string> {
    const { createUser, createWorkspace } = await import('@/lib/auth/system-database');
    return createWorkspace('Agency', createUser('owner@agency.test', 'hash'));
  }

  async function instanceOffers(): Promise<void> {
    const { writeInstanceMail } = await import('@/lib/mail/settings');
    writeInstanceMail({ host: 'smtp.instance.test', from: 'noreply@instance.test', enabled: true });
  }

  it('holds a workspace that has never opened its mail settings, however ready the instance is', async () => {
    // The observable half of "off by default": no row means off, and off means the digests wait.
    const workspaceId = await workspace();
    await instanceOffers();

    const { readWorkspaceMailConfig } = await import('@/lib/mail/settings');
    expect(readWorkspaceMailConfig(workspaceId)).toBeNull();

    const { resolveTransport } = await transport();
    expect(await resolveTransport(workspaceId)).toBeNull();
  });

  it('holds a switched-off workspace’s queue rather than failing it', async () => {
    // The load-bearing branch, reached from the workspace tier this time: no transport means hold.
    // `attempts` is asserted directly — "still pending" alone would pass while the counter walked to
    // the cap and killed the queue.
    const workspaceId = await workspace();
    await instanceOffers();

    const { writeWorkspaceMail } = await import('@/lib/mail/settings');
    writeWorkspaceMail(workspaceId, {
      enabled: false,
      mode: 'own',
      host: 'smtp.agency.test',
      from: 'hello@agency.test',
    });

    const { resolveTransport } = await transport();
    expect(await resolveTransport(workspaceId, { resolve: async () => ['93.184.216.34'] })).toBeNull();

    const { enqueueEmail } = await import('@/lib/mail/outbox');
    enqueueEmail({ workspaceId, to: 'sam@client.example', subject: 'A', bodyText: 'x' });

    const { deliverPendingEmails } = await import('@/lib/mail/delivery');
    expect(await deliverPendingEmails()).toMatchObject({ accepted: 0, failed: 0, held: 1 });

    const { getSystemDatabase } = await import('@/lib/auth/system-database');
    const row = getSystemDatabase()
      .prepare('SELECT delivered, attempts FROM email_outbox')
      .get() as { delivered: number; attempts: number };

    expect(row).toMatchObject({ delivered: 0, attempts: 0 });
  });

  it('sends once the workspace is switched on', async () => {
    const workspaceId = await workspace();
    await instanceOffers();

    const { writeWorkspaceMail } = await import('@/lib/mail/settings');
    writeWorkspaceMail(workspaceId, { enabled: true, mode: 'instance', displayName: 'Agency' });

    const { resolveTransport } = await transport();
    const resolved = await resolveTransport(workspaceId);

    expect(resolved?.from).toBe('"Agency" <noreply@instance.test>');
    resolved?.close();
  });

  it('does not touch the instance’s own mail', async () => {
    // A row with no workspace behind it is an admin's test send. There is no workspace switch to
    // consult for it, and gating it would leave an operator unable to verify their own server.
    const workspaceId = await workspace();
    await instanceOffers();

    const { writeWorkspaceMail } = await import('@/lib/mail/settings');
    writeWorkspaceMail(workspaceId, { enabled: false, mode: 'instance' });

    const { resolveTransport } = await transport();
    const resolved = await resolveTransport(null);

    expect(resolved?.from).toBe('noreply@instance.test');
    resolved?.close();
  });
});

// ---------------------------------------------------------------------------
// The nodemailer option mapping, tested directly so the send-path stub used by the delivery
// tests is not the only description of it.
// ---------------------------------------------------------------------------

describe('buildTransportOptions', () => {
  it('maps implicit TLS to a secure connection', async () => {
    const { buildTransportOptions } = await transport();

    expect(buildTransportOptions({
      tier: 'workspace',
      host: 'smtp.agency.test',
      port: 465,
      secure: 'ssl',
      user: 'agency',
      password: 'agency-secret',
      fromAddress: 'hello@agency.test',
      fromName: null,
    })).toMatchObject({
      host: 'smtp.agency.test',
      port: 465,
      secure: true,
      auth: { user: 'agency', pass: 'agency-secret' },
    });
  });

  it('maps STARTTLS to an upgraded plaintext connection and requires the upgrade', async () => {
    const { buildTransportOptions } = await transport();

    const options = buildTransportOptions({
      tier: 'workspace',
      host: 'smtp.agency.test',
      port: 587,
      secure: 'starttls',
      user: null,
      password: null,
      fromAddress: 'hello@agency.test',
      fromName: null,
    });

    expect(options).toMatchObject({ secure: false, requireTLS: true });
    // No credentials means no auth block at all — nodemailer would otherwise try to authenticate
    // with undefined and fail against a relay that wants none.
    expect(options.auth).toBeUndefined();
  });

  it('leaves an unencrypted connection unencrypted', async () => {
    const { buildTransportOptions } = await transport();

    expect(buildTransportOptions({
      tier: 'instance',
      host: 'localhost',
      port: 1025,
      secure: 'none',
      user: null,
      password: null,
      fromAddress: 'dev@localhost',
      fromName: null,
    })).toMatchObject({ secure: false, requireTLS: false });
  });
});

describe('formatFrom', () => {
  it('passes a bare address through', async () => {
    const { formatFrom } = await transport();

    expect(formatFrom({
      tier: 'instance', host: 'h', port: 1, secure: 'none', user: null, password: null,
      fromAddress: 'noreply@instance.test', fromName: null,
    })).toBe('noreply@instance.test');
  });

  it('quotes a display name so a comma cannot split the header into two recipients', async () => {
    const { formatFrom } = await transport();

    expect(formatFrom({
      tier: 'instance', host: 'h', port: 1, secure: 'none', user: null, password: null,
      fromAddress: 'noreply@instance.test', fromName: 'Bright, Agency "B"',
    })).toBe('"Bright, Agency \\"B\\"" <noreply@instance.test>');
  });
});

// ---------------------------------------------------------------------------
// The address a connection uses is the address the guard checked
// ---------------------------------------------------------------------------

describe('pinning the checked address', () => {
  const SOURCE = {
    tier: 'workspace' as const,
    host: 'smtp.agency.test',
    port: 587,
    secure: 'starttls' as const,
    user: null,
    password: null,
    fromAddress: 'hello@agency.test',
    fromName: null,
  };

  /**
   * The guard resolves the name and approves the answers, then nodemailer resolves the same name
   * again to open the socket. The owner of the name decides what it answers, and a short TTL lets it
   * answer publicly for the check and 127.0.0.1 for the connection.
   *
   * The pin has to be expressed as `host` rather than a net.connect `lookup` hook: nodemailer does
   * its own resolution in `_resolveAndConnect` and never consults `lookup`, so a hook is accepted
   * and ignored. It short-circuits on an IP, which is what makes this the deciding value.
   */
  it('dials the checked address instead of the name', async () => {
    const { buildTransportOptions } = await transport();

    expect(buildTransportOptions(SOURCE, '93.184.216.34')).toMatchObject({
      host: '93.184.216.34',
      port: 587,
    });
  });

  /**
   * Certificates name hosts, not addresses. Pinning without this would check the certificate against
   * '93.184.216.34', fail every time, and take every workspace's mail down with it.
   */
  it('still validates the certificate against the configured name', async () => {
    const { buildTransportOptions } = await transport();

    expect(buildTransportOptions(SOURCE, '93.184.216.34').servername).toBe('smtp.agency.test');
  });

  it('leaves an unpinned host to resolve itself, which is how the instance tier sends', async () => {
    const { buildTransportOptions } = await transport();

    for (const options of [
      buildTransportOptions({ ...SOURCE, tier: 'instance' }),
      buildTransportOptions(SOURCE, null),
    ]) {
      expect(options.host).toBe('smtp.agency.test');
      expect(options.servername).toBeUndefined();
    }
  });
});
