/**
 * Mail settings, in two tiers.
 *
 * The instance tier belongs to whoever runs the server and is stored in `instance_settings`, a
 * key/value table. It also reads the SMTP_* environment variables as a fallback, because a hosted
 * instance is provisioned from its container definition and nobody is going to open a settings page
 * on it. A stored value always wins: an operator who edits a field in the UI has overridden what the
 * container was started with, and the next restart must not undo that.
 *
 * The workspace tier belongs to an agency and is stored in `workspace_mail`, one row per workspace.
 * It has no environment fallback, an agency's own relay is something a person types in.
 *
 * The rule that outranks both: a stored SMTP password is never handed back out, not to an admin and
 * not to a workspace owner. Reading one is the job of the transport, which runs on the server; a
 * settings page only ever needs to know whether one exists. The `*Config` readers are the internal
 * shape and carry the password; the `*Settings` readers are the shape that may be serialised, and
 * they carry `smtpPasswordSet` instead. Same split as `toPublicDeployment` in lib/api.
 *
 * What that rule does not do is encrypt anything. Both tiers write the SMTP password to system.sqlite
 * in plaintext, and that is a decision rather than an oversight: the transport needs the password
 * itself to authenticate, so a hash is useless and any encryption here would be reversible with
 * a key sitting on the same disk, which protects against a stolen database file and nothing else.
 * The hosted instances run on encrypted volumes, which is where that threat is actually answered. A
 * self-hosted install has no such volume unless the operator arranged one, so on those the file
 * permissions on `data/system.sqlite` are the whole of the protection, and a backup copied off the
 * box carries working relay credentials. Written down in docs/VPS_DEPLOYMENT.md as well, because it
 * is an operator's decision to make and they cannot make it from here.
 */

import 'server-only';

import { getSystemDatabase } from '../auth/system-database';

/**
 * How the connection is protected.
 *
 * `ssl` is implicit TLS from the first byte (usually port 465), `starttls` is a plaintext
 * connection upgraded before authentication (usually 587), `none` is neither and exists for a relay
 * on localhost. Kept as three named states rather than nodemailer's `secure` boolean because
 * "secure: false" reads as "insecure" while it is in fact the STARTTLS case.
 */
export type SmtpSecurity = 'starttls' | 'ssl' | 'none';

const SECURITY_VALUES: readonly SmtpSecurity[] = ['starttls', 'ssl', 'none'];

export function isSmtpSecurity(value: unknown): value is SmtpSecurity {
  return typeof value === 'string' && (SECURITY_VALUES as readonly string[]).includes(value);
}

/** What the transport needs. Never serialised, it carries the password. */
export interface InstanceMailConfig {
  /** Whether workspaces may relay through it. See `parseEnabled` for what an absent setting means. */
  enabled: boolean;
  host: string | null;
  port: number | null;
  secure: SmtpSecurity;
  user: string | null;
  password: string | null;
  from: string | null;
}

/** What a settings page may be given. */
export interface InstanceMailSettings {
  /** The operator's switch, as stored: whether workspaces may relay through this server. */
  enabled: boolean;
  host: string | null;
  port: number | null;
  secure: SmtpSecurity;
  user: string | null;
  from: string | null;
  smtpPasswordSet: boolean;
  /**
   * Whether there is a working server here: a host and a From address both resolving.
   *
   * Not "may a workspace use it", that is this and `enabled` together, which is what
   * `isInstanceMailOffered` answers. An admin's page asks both questions and has both fields.
   */
  configured: boolean;
}

export interface WorkspaceMailConfig {
  workspaceId: string;
  /**
   * Whether this workspace sends at all. Off is off: no digest is composed for it and no queue
   * builds up behind the switch, see lib/scheduler/review-notifications.ts.
   *
   * A stored boolean with no environment fallback and no absent case to interpret, which is what
   * lets it default off where the instance tier's cannot: nothing provisions a workspace from a
   * container definition, so every row here was written by an owner looking at the switch.
   */
  enabled: boolean;
  /** `instance` relays through the instance's server; `own` uses the fields below. */
  mode: 'instance' | 'own';
  displayName: string | null;
  host: string | null;
  port: number | null;
  secure: SmtpSecurity;
  user: string | null;
  password: string | null;
  from: string | null;
}

export type WorkspaceMailSettings = Omit<WorkspaceMailConfig, 'password'> & {
  smtpPasswordSet: boolean;
};

/**
 * What a workspace owner is told, which is their own tier plus one fact about the tier above it.
 *
 * `instanceConfigured` is the whole of what leaks upwards, and deliberately: an owner has to know
 * whether `mode: 'instance'` is a mode they can save, because offering it when it is not produces an
 * error whose cause is not theirs to fix. The instance's host, credentials and address are the
 * operator's, and on a hosted instance the owner is a tenant.
 */
export type WorkspaceMailResponse = WorkspaceMailSettings & {
  instanceConfigured: boolean;
};

export interface InstanceMailInput {
  enabled?: boolean;
  host?: string | null;
  port?: number | null;
  secure?: SmtpSecurity;
  user?: string | null;
  password?: string | null;
  from?: string | null;
}

export interface WorkspaceMailInput {
  enabled?: boolean;
  mode?: 'instance' | 'own';
  displayName?: string | null;
  host?: string | null;
  port?: number | null;
  secure?: SmtpSecurity;
  user?: string | null;
  password?: string | null;
  from?: string | null;
}

const DEFAULT_SECURITY: SmtpSecurity = 'starttls';

type InstanceField = 'host' | 'port' | 'secure' | 'user' | 'password' | 'from';

/** Namespaced so `instance_settings` stays usable for anything else that wants a key. */
const SETTING_KEYS: Record<InstanceField, string> = {
  host: 'mail.smtp.host',
  port: 'mail.smtp.port',
  secure: 'mail.smtp.secure',
  user: 'mail.smtp.user',
  password: 'mail.smtp.password',
  from: 'mail.smtp.from',
};

/**
 * The switch, kept out of `InstanceField` because it is a boolean and has no environment fallback.
 *
 * An operator provisioning from a container declares a server; whether that server is offered to the
 * tenants on it is a decision made afterwards, against a running instance, and it belongs in the
 * database where it can be changed without a redeploy.
 */
const ENABLED_KEY = 'mail.smtp.enabled';

const ENV_KEYS: Record<InstanceField, string> = {
  host: 'SMTP_HOST',
  port: 'SMTP_PORT',
  secure: 'SMTP_SECURE',
  user: 'SMTP_USER',
  password: 'SMTP_PASSWORD',
  from: 'SMTP_FROM',
};

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * An empty string counts as absent, not as a value.
 *
 * A container that declares `SMTP_HOST=`, or a compose file interpolating a variable that was
 * never set, would otherwise resolve to a host of "", and the difference between "unset" and
 * "set to nothing" is the difference between holding the queue and failing every message on it.
 */
function present(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function firstPresent(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const found = present(value);
    if (found !== null) return found;
  }
  return null;
}

function parsePort(value: string | null): number | null {
  if (value === null) return null;
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : null;
}

/**
 * Accepts the operator's spelling as well as our own.
 *
 * `SMTP_SECURE` is a boolean in most other tools' documentation, so somebody provisioning an
 * instance will write `true`, and meaning implicit TLS by it.
 */
function parseSecurity(value: string | null): SmtpSecurity | null {
  if (value === null) return null;
  const normalised = value.toLowerCase();
  if (normalised === 'ssl' || normalised === 'tls' || normalised === 'true') return 'ssl';
  if (normalised === 'starttls' || normalised === 'false') return 'starttls';
  if (normalised === 'none' || normalised === 'plain') return 'none';
  return null;
}

// ---------------------------------------------------------------------------
// Instance tier
// ---------------------------------------------------------------------------

/** The `mail.smtp.*` rows as they are stored, before any of them mean anything. */
type StoredInstanceMail = Partial<Record<InstanceField, string | null>> & {
  /** The raw `mail.smtp.enabled` row, absent on every install that predates the switch. */
  enabled?: string | null;
};

/**
 * Absent means enabled, and that is the load-bearing part of this whole setting.
 *
 * No install written before the switch existed has a row for it, and an instance provisioned from
 * SMTP_* will never write one, there is nothing to make it. Reading absence as "off" would stop
 * every workspace's mail at the moment they upgraded, and the symptom is digests quietly
 * accumulating in the outbox, which is indistinguishable from the correct behaviour of an instance
 * with no mail server. Nobody would report it as a regression; they would report that mail had never
 * worked. So only an explicit stored "false" withdraws the offer.
 */
function parseEnabled(value: string | null): boolean {
  return value !== 'false';
}

/**
 * The stored/environment merge, as a pure function so the precedence is testable on its own.
 *
 * Merged field by field rather than "all stored or all environment": an operator who sets only a
 * host in the UI still wants the provisioned credentials underneath it.
 */
function mergeInstanceMail(
  stored: StoredInstanceMail,
  env: Record<string, string | undefined>
): InstanceMailConfig {
  const pick = (field: InstanceField): string | null =>
    firstPresent(stored[field], env[ENV_KEYS[field]]);

  return {
    enabled: parseEnabled(present(stored.enabled)),
    host: pick('host'),
    port: parsePort(pick('port')),
    secure: parseSecurity(pick('secure')) ?? DEFAULT_SECURITY,
    user: pick('user'),
    password: pick('password'),
    from: pick('from'),
  };
}

function readStoredInstanceMail(): StoredInstanceMail {
  const db = getSystemDatabase();
  const rows = db
    .prepare('SELECT key, value FROM instance_settings WHERE key LIKE ?')
    .all('mail.smtp.%') as Array<{ key: string; value: string }>;

  const byKey = new Map(rows.map((row) => [row.key, row.value]));
  const stored: StoredInstanceMail = { enabled: byKey.get(ENABLED_KEY) ?? null };
  for (const [field, key] of Object.entries(SETTING_KEYS) as Array<[InstanceField, string]>) {
    stored[field] = byKey.get(key) ?? null;
  }
  return stored;
}

/** Server-side only: this carries the password. */
export function readInstanceMailConfig(): InstanceMailConfig {
  return mergeInstanceMail(readStoredInstanceMail(), process.env);
}

export function readInstanceMailSettings(): InstanceMailSettings {
  const config = readInstanceMailConfig();
  return {
    enabled: config.enabled,
    host: config.host,
    port: config.port,
    secure: config.secure,
    user: config.user,
    from: config.from,
    smtpPasswordSet: config.password !== null,
    configured: canSendInstanceMail(config),
  };
}

/**
 * Whether there is a working server here at all.
 *
 * Both a host and a From address are required, because a message with no envelope sender is
 * rejected by every relay worth using, so a host on its own is not a working configuration.
 *
 * The switch is deliberately not weighed here. It says whether the server is *offered*, which is a
 * different question from whether it works, and the instance's own mail, the admin test send, and
 * any outbox row with no workspace behind it, depends on this one. Weighing the switch here made
 * an operator who withdrew the offer unable to test the server they had just configured.
 */
export function canSendInstanceMail(config: Pick<InstanceMailConfig, 'host' | 'from'>): boolean {
  return config.host !== null && config.from !== null;
}

/**
 * Whether a workspace may relay through the instance's server.
 *
 * The offer question, and the only one the switch decides. Answered in one place so that the two
 * things depending on it cannot drift: which mode the workspace PUT accepts, and what a workspace
 * owner's page is allowed to present. Drift there shows up as an owner choosing a mode the server
 * then refuses.
 */
export function isInstanceMailOffered(): boolean {
  const config = readInstanceMailConfig();
  return config.enabled && canSendInstanceMail(config);
}

/**
 * Write the instance tier. An omitted field is left alone; an explicitly empty one is deleted.
 *
 * Deleting rather than storing an empty string is what makes "clear this field" mean "go back to
 * whatever the environment says", which is the only way an operator can undo an edit and return to
 * the provisioned configuration.
 */
export function writeInstanceMail(input: InstanceMailInput): void {
  const db = getSystemDatabase();
  const upsert = db.prepare(`
    INSERT INTO instance_settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `);
  const remove = db.prepare('DELETE FROM instance_settings WHERE key = ?');

  const write = db.transaction((rows: Array<[string, string | null]>) => {
    for (const [key, value] of rows) {
      if (value === null) remove.run(key);
      else upsert.run(key, value);
    }
  });

  const rows: Array<[string, string | null]> = [];
  const stage = (field: InstanceField, value: string | number | null | undefined): void => {
    if (value === undefined) return;
    rows.push([SETTING_KEYS[field], value === null ? null : present(String(value))]);
  };

  stage('host', input.host);
  stage('port', input.port);
  stage('secure', input.secure);
  stage('user', input.user);
  stage('password', input.password);
  stage('from', input.from);

  // Written as a literal in both directions rather than deleted when true. Absence already means
  // enabled, so a delete would work, but a row an operator can read is better than an inference,
  // and this is the one setting whose absence is not the same as never having been touched.
  if (input.enabled !== undefined) rows.push([ENABLED_KEY, String(input.enabled)]);

  write(rows);
}

// ---------------------------------------------------------------------------
// Workspace tier
// ---------------------------------------------------------------------------

interface WorkspaceMailRow {
  workspace_id: string;
  enabled: number;
  mode: string;
  display_name: string | null;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_secure: string | null;
  smtp_user: string | null;
  smtp_password: string | null;
  from_address: string | null;
}

/**
 * The state of a workspace that has never opened its mail settings.
 *
 * Exported because "no row" is not the same as "no workspace": a workspace with no row is in
 * instance mode, and the transport has to be able to tell that apart from mail with no workspace
 * behind it at all. Only the second of those is the instance's own.
 *
 * It is switched off, which is the whole of what "off by default" means here: a workspace nobody
 * has configured composes no digests at all, rather than accumulating mail for a server that has
 * never been named, and its settings page says so.
 */
export function defaultWorkspaceMail(workspaceId: string): WorkspaceMailConfig {
  return {
    workspaceId,
    enabled: false,
    mode: 'instance',
    displayName: null,
    host: null,
    port: null,
    secure: DEFAULT_SECURITY,
    user: null,
    password: null,
    from: null,
  };
}

/** Server-side only: this carries the password. Null when the workspace has no row. */
export function readWorkspaceMailConfig(workspaceId: string): WorkspaceMailConfig | null {
  const db = getSystemDatabase();
  const row = db
    .prepare('SELECT * FROM workspace_mail WHERE workspace_id = ?')
    .get(workspaceId) as WorkspaceMailRow | undefined;

  if (!row) return null;

  return {
    workspaceId,
    enabled: row.enabled === 1,
    mode: row.mode === 'own' ? 'own' : 'instance',
    displayName: present(row.display_name),
    host: present(row.smtp_host),
    port: row.smtp_port ?? null,
    secure: parseSecurity(present(row.smtp_secure)) ?? DEFAULT_SECURITY,
    user: present(row.smtp_user),
    password: present(row.smtp_password),
    from: present(row.from_address),
  };
}

export function readWorkspaceMailSettings(workspaceId: string): WorkspaceMailSettings {
  const config = readWorkspaceMailConfig(workspaceId) ?? defaultWorkspaceMail(workspaceId);
  const { password, ...rest } = config;
  return { ...rest, smtpPasswordSet: password !== null };
}

/**
 * Write the workspace tier. Same omitted/emptied distinction as the instance tier, for the same
 * reason: the UI cannot render a stored password back into the form it posts.
 */
export function writeWorkspaceMail(workspaceId: string, input: WorkspaceMailInput): void {
  const db = getSystemDatabase();
  const existing = readWorkspaceMailConfig(workspaceId) ?? defaultWorkspaceMail(workspaceId);

  const merged: WorkspaceMailConfig = {
    workspaceId,
    enabled: input.enabled ?? existing.enabled,
    mode: input.mode ?? existing.mode,
    displayName: input.displayName === undefined ? existing.displayName : present(input.displayName),
    host: input.host === undefined ? existing.host : present(input.host),
    port: input.port === undefined ? existing.port : input.port,
    secure: input.secure ?? existing.secure,
    user: input.user === undefined ? existing.user : present(input.user),
    password: input.password === undefined ? existing.password : present(input.password),
    from: input.from === undefined ? existing.from : present(input.from),
  };

  db.prepare(`
    INSERT INTO workspace_mail (
      workspace_id, enabled, mode, display_name, smtp_host, smtp_port, smtp_secure, smtp_user,
      smtp_password, from_address
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(workspace_id) DO UPDATE SET
      enabled = excluded.enabled,
      mode = excluded.mode,
      display_name = excluded.display_name,
      smtp_host = excluded.smtp_host,
      smtp_port = excluded.smtp_port,
      smtp_secure = excluded.smtp_secure,
      smtp_user = excluded.smtp_user,
      smtp_password = excluded.smtp_password,
      from_address = excluded.from_address,
      updated_at = datetime('now')
  `).run(
    workspaceId,
    merged.enabled ? 1 : 0,
    merged.mode,
    merged.displayName,
    merged.host,
    merged.port,
    merged.secure,
    merged.user,
    merged.password,
    merged.from
  );
}
