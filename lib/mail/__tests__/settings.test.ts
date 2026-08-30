import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Mail settings live in two tiers with different jobs.
 *
 * The instance tier is what an operator provisions, and it has to be settable without anyone
 * opening a UI — a hosted instance is built from environment variables, so those are read as a
 * fallback and a stored value overrides them. The workspace tier has no environment fallback at
 * all: an agency's own relay is something a person types in.
 *
 * The invariant that outranks both: a stored SMTP password is never handed back out. Everything a
 * settings page needs to render is "is one set", which is what the …PasswordSet flags answer.
 */

vi.mock('server-only', () => ({}));

let dir: string;
/** A real workspace row: workspace_mail is a foreign key onto workspaces. */
let WORKSPACE: string;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'osws-mail-settings-'));
  vi.resetModules();
  vi.stubEnv('DATA_DIR', path.join(dir, 'data'));
  for (const key of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM']) {
    vi.stubEnv(key, '');
  }

  const { createUser, createWorkspace } = await import('@/lib/auth/system-database');
  WORKSPACE = createWorkspace('Agency', createUser('owner@agency.test', 'hash'));
});

afterEach(async () => {
  const { closeSystemDatabase } = await import('@/lib/auth/system-database');
  closeSystemDatabase();
  vi.unstubAllEnvs();
  fs.rmSync(dir, { recursive: true, force: true });
});

function settings() {
  return import('@/lib/mail/settings');
}

// ---------------------------------------------------------------------------
// 4. A stored instance value beats the environment; the environment fills the gap
// ---------------------------------------------------------------------------

describe('instance mail: stored values and the environment', () => {
  it('uses the environment when nothing is stored', async () => {
    vi.stubEnv('SMTP_HOST', 'smtp.provisioned.test');
    vi.stubEnv('SMTP_PORT', '2525');
    vi.stubEnv('SMTP_SECURE', 'starttls');
    vi.stubEnv('SMTP_USER', 'provisioned');
    vi.stubEnv('SMTP_PASSWORD', 'env-secret');
    vi.stubEnv('SMTP_FROM', 'noreply@provisioned.test');

    const { readInstanceMailConfig } = await settings();

    expect(readInstanceMailConfig()).toMatchObject({
      host: 'smtp.provisioned.test',
      port: 2525,
      secure: 'starttls',
      user: 'provisioned',
      password: 'env-secret',
      from: 'noreply@provisioned.test',
    });
  });

  it('prefers a stored value over the environment, field by field', async () => {
    // An operator who edits one field in the UI must not have the other fields silently revert to
    // whatever the container was started with.
    vi.stubEnv('SMTP_HOST', 'smtp.provisioned.test');
    vi.stubEnv('SMTP_PORT', '2525');
    vi.stubEnv('SMTP_PASSWORD', 'env-secret');
    vi.stubEnv('SMTP_FROM', 'noreply@provisioned.test');

    const { readInstanceMailConfig, writeInstanceMail } = await settings();
    writeInstanceMail({ host: 'smtp.chosen.test', password: 'stored-secret' });

    expect(readInstanceMailConfig()).toMatchObject({
      host: 'smtp.chosen.test',
      password: 'stored-secret',
      // Untouched fields still fall through to the environment.
      port: 2525,
      from: 'noreply@provisioned.test',
    });
  });

  it('reports whether a server is configured at all', async () => {
    const { readInstanceMailSettings, writeInstanceMail } = await settings();

    expect(readInstanceMailSettings().configured).toBe(false);

    writeInstanceMail({ host: 'smtp.chosen.test', from: 'noreply@chosen.test' });
    expect(readInstanceMailSettings().configured).toBe(true);
  });

  it('counts an environment-only server as configured', async () => {
    vi.stubEnv('SMTP_HOST', 'smtp.provisioned.test');
    vi.stubEnv('SMTP_FROM', 'noreply@provisioned.test');

    const { isInstanceMailOffered, readInstanceMailSettings } = await settings();
    expect(readInstanceMailSettings().configured).toBe(true);
    expect(isInstanceMailOffered()).toBe(true);
  });

  it('treats a store with no switch row as offering the server', async () => {
    // An install that predates the switch has no row for it and, if it was provisioned from
    // SMTP_*, never will. Absent has to read as on.
    const { readInstanceMailConfig, readInstanceMailSettings, writeInstanceMail } = await settings();
    writeInstanceMail({ host: 'smtp.chosen.test', from: 'noreply@chosen.test' });

    expect(readInstanceMailConfig().enabled).toBe(true);
    expect(readInstanceMailSettings().enabled).toBe(true);
  });

  it('stores the switch in both directions', async () => {
    const { readInstanceMailConfig, writeInstanceMail } = await settings();
    writeInstanceMail({ host: 'smtp.chosen.test', from: 'noreply@chosen.test' });

    writeInstanceMail({ enabled: false });
    expect(readInstanceMailConfig().enabled).toBe(false);
    // The connection fields are untouched by the switch: an operator turning the server off is not
    // asking to retype its credentials to turn it back on.
    expect(readInstanceMailConfig().host).toBe('smtp.chosen.test');

    writeInstanceMail({ enabled: true });
    expect(readInstanceMailConfig().enabled).toBe(true);
  });

  it('is not offered while the switch is off, however complete the settings are', async () => {
    const { isInstanceMailOffered, writeInstanceMail } = await settings();
    writeInstanceMail({ host: 'smtp.chosen.test', from: 'noreply@chosen.test', enabled: false });

    expect(isInstanceMailOffered()).toBe(false);
  });

  it('stays configured while the switch is off', async () => {
    // Two questions, and the switch only answers one of them. `configured` is "is there a working
    // server here", which an admin's own page asks of its own tier and which is still yes; whether
    // a workspace may relay through it is `isInstanceMailOffered`, and that is the one the switch
    // decides. Conflating them made an unoffered server look like an absent one, and the instance's
    // own mail — the admin's test send included — stopped with it.
    const { readInstanceMailSettings, writeInstanceMail } = await settings();
    writeInstanceMail({ host: 'smtp.chosen.test', from: 'noreply@chosen.test', enabled: false });

    expect(readInstanceMailSettings()).toMatchObject({ enabled: false, configured: true });
  });

  it('keeps the stored password when a write omits it', async () => {
    // The UI cannot render a password to send back, so an omitted field means "unchanged" and an
    // explicit empty string means "clear it".
    const { readInstanceMailConfig, writeInstanceMail } = await settings();

    writeInstanceMail({ host: 'smtp.chosen.test', password: 'stored-secret' });
    writeInstanceMail({ host: 'smtp.moved.test' });
    expect(readInstanceMailConfig().password).toBe('stored-secret');

    writeInstanceMail({ password: '' });
    expect(readInstanceMailConfig().password).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 5. Neither settings reader returns a password
// ---------------------------------------------------------------------------

describe('settings readers never return a password', () => {
  it('gives the instance password only as a boolean', async () => {
    const { writeInstanceMail, readInstanceMailSettings } = await settings();
    writeInstanceMail({ host: 'smtp.chosen.test', user: 'ops', password: 'stored-secret', from: 'a@b.test' });

    const view = readInstanceMailSettings();

    expect(JSON.stringify(view)).not.toContain('stored-secret');
    expect(view).not.toHaveProperty('password');
    expect(view.smtpPasswordSet).toBe(true);
  });

  it('counts an environment password as set without disclosing it', async () => {
    vi.stubEnv('SMTP_HOST', 'smtp.provisioned.test');
    vi.stubEnv('SMTP_PASSWORD', 'env-secret');

    const { readInstanceMailSettings } = await settings();
    const view = readInstanceMailSettings();

    expect(JSON.stringify(view)).not.toContain('env-secret');
    expect(view.smtpPasswordSet).toBe(true);
  });

  it('gives the workspace password only as a boolean', async () => {
    const { writeWorkspaceMail, readWorkspaceMailSettings } = await settings();
    writeWorkspaceMail(WORKSPACE, {
      mode: 'own',
      host: 'smtp.agency.test',
      user: 'agency',
      password: 'agency-secret',
      from: 'hello@agency.test',
    });

    const view = readWorkspaceMailSettings(WORKSPACE);

    expect(JSON.stringify(view)).not.toContain('agency-secret');
    expect(view).not.toHaveProperty('password');
    expect(view.smtpPasswordSet).toBe(true);
  });

  it('describes a workspace that has never been configured', async () => {
    const { readWorkspaceMailSettings } = await settings();
    const view = readWorkspaceMailSettings(WORKSPACE);

    expect(view.mode).toBe('instance');
    expect(view.smtpPasswordSet).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The workspace switch
// ---------------------------------------------------------------------------

/**
 * Where the two tiers' switches deliberately differ. The instance's cannot default off — an absent
 * row there means enabled, because an instance provisioned from SMTP_* never writes one. Nothing
 * provisions a workspace, so this one may default off and does.
 */
describe('the workspace mail switch', () => {
  it('starts off for a workspace with no row', async () => {
    const { readWorkspaceMailConfig, readWorkspaceMailSettings } = await settings();

    expect(readWorkspaceMailConfig(WORKSPACE)).toBeNull();
    expect(readWorkspaceMailSettings(WORKSPACE).enabled).toBe(false);
  });

  it('starts off for a workspace that has saved a server without turning it on', async () => {
    const { readWorkspaceMailConfig, writeWorkspaceMail } = await settings();
    writeWorkspaceMail(WORKSPACE, { mode: 'own', host: 'smtp.agency.test', from: 'hello@agency.test' });

    expect(readWorkspaceMailConfig(WORKSPACE)?.enabled).toBe(false);
  });

  it('stores the switch in both directions', async () => {
    const { readWorkspaceMailConfig, writeWorkspaceMail } = await settings();
    writeWorkspaceMail(WORKSPACE, {
      enabled: true,
      mode: 'own',
      host: 'smtp.agency.test',
      from: 'hello@agency.test',
    });

    expect(readWorkspaceMailConfig(WORKSPACE)?.enabled).toBe(true);

    writeWorkspaceMail(WORKSPACE, { enabled: false });
    expect(readWorkspaceMailConfig(WORKSPACE)).toMatchObject({
      enabled: false,
      // Switching a workspace off is not asking it to retype its relay to switch back on.
      mode: 'own',
      host: 'smtp.agency.test',
      from: 'hello@agency.test',
    });

    writeWorkspaceMail(WORKSPACE, { enabled: true });
    expect(readWorkspaceMailConfig(WORKSPACE)?.enabled).toBe(true);
  });

  it('leaves the switch alone when a write omits it', async () => {
    // The settings page saves the mode and the server on their own; neither is a decision about
    // whether the workspace sends.
    const { readWorkspaceMailConfig, writeWorkspaceMail } = await settings();
    writeWorkspaceMail(WORKSPACE, { enabled: true, mode: 'instance' });

    writeWorkspaceMail(WORKSPACE, { displayName: 'Agency' });

    expect(readWorkspaceMailConfig(WORKSPACE)).toMatchObject({ enabled: true, displayName: 'Agency' });
  });
});
