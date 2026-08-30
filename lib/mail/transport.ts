/**
 * Which SMTP server carries a given workspace's mail, and the connection to it.
 *
 * Resolution order is workspace override, instance, environment, nothing. That last step returns
 * null rather than throwing: the outbox holds in that state, and a transport pointed at an empty
 * host would instead spend a delivery attempt off every queued message.
 *
 * `nodemailer` is imported dynamically, once a config resolves, to keep it out of client bundles.
 */

import 'server-only';

import { assertPublicHost, type Resolver } from '@/lib/web/ssrf-guard';
import {
  defaultWorkspaceMail,
  readInstanceMailConfig,
  readWorkspaceMailConfig,
  type InstanceMailConfig,
  type SmtpSecurity,
  type WorkspaceMailConfig,
} from './settings';

/** A resolved server plus the identity it sends as. */
export interface MailSource {
  /** Who chose this host, see `assertMailHostAllowed`. */
  tier: MailTier;
  host: string;
  port: number;
  secure: SmtpSecurity;
  user: string | null;
  password: string | null;
  fromAddress: string;
  fromName: string | null;
}

/**
 * Who chose the SMTP host, which is not the same question as which tier's settings it came from.
 *
 * A workspace relaying in `instance` mode sends through a host the operator chose, so it is
 * `instance` here even though a workspace row was read on the way to it.
 */
export type MailTier = 'instance' | 'workspace';

export interface OutboundMessage {
  to: string;
  subject: string;
  text: string;
  html?: string | null;
}

/**
 * The narrow surface delivery uses. Nodemailer's own transporter is far wider, and keeping the
 * boundary this small is what lets the drain loop be tested without a mail server in reach.
 */
export interface ResolvedTransport {
  /** The formatted From header this transport will send as. */
  from: string;
  sendMail(message: OutboundMessage): Promise<void>;
  close(): void;
}

export interface SmtpTransportOptions {
  host: string;
  port: number;
  secure: boolean;
  requireTLS: boolean;
  auth?: { user: string; pass: string };
  /**
   * The name to validate the TLS certificate against, set only when `host` is a pinned address.
   * Without it a pinned connection would be checked against the IP and every certificate would fail.
   */
  servername?: string;
}

/** The conventional port for each mode, used when nobody has specified one. */
function defaultPort(secure: SmtpSecurity): number {
  if (secure === 'ssl') return 465;
  if (secure === 'none') return 25;
  return 587;
}

/**
 * Split `Name <address>` into its parts, tolerating a bare address.
 *
 * SMTP_FROM is written by hand and both forms are common, so the display name has to be separable
 * from the address, a workspace may override the one without touching the other.
 */
function parseAddress(from: string): { address: string; name: string | null } {
  const match = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(from);
  if (!match) return { address: from.trim(), name: null };

  const name = match[1].replace(/^"(.*)"$/, '$1').trim();
  return { address: match[2].trim(), name: name === '' ? null : name };
}

/**
 * Decide which server sends, given the two tiers of settings. Pure: no database, no socket.
 *
 * A null `workspace` means instance mail, not a workspace with no settings: a workspace that never
 * opened its mail page still gets its default config passed in.
 *
 * An instance-mode workspace may set the display name but not the From address. Relaying its own
 * domain through the instance's server fails SPF and DKIM alignment, so the mail lands in spam or is
 * rejected. Keeping the instance address is aligned by construction, which is why there are two
 * modes rather than one free-text From field.
 */
export function resolveMailSource(
  instance: InstanceMailConfig,
  workspace: WorkspaceMailConfig | null
): MailSource | null {
  // A workspace switched off sends through neither tier, so this is answered before the mode is. A
  // null workspace is the instance's own mail and has no workspace switch to consult.
  //
  // Nothing is composed for a workspace in this state, `isMailSending` is this same answer, asked
  // by the notification sweep, so the rows this holds are the ones written before the switch moved
  // and not yet discarded. Holding rather than failing is still the right treatment of them: they
  // were never handed to a server, so they have not failed at anything.
  if (workspace !== null && !workspace.enabled) return null;

  if (workspace?.mode === 'own') {
    // An own-mode workspace that has not finished filling in its server cannot send. Falling back
    // to the instance here would quietly send an agency's client mail from the wrong identity.
    if (!workspace.host || !workspace.from) return null;

    const parsed = parseAddress(workspace.from);
    return {
      tier: 'workspace',
      host: workspace.host,
      port: workspace.port ?? defaultPort(workspace.secure),
      secure: workspace.secure,
      user: workspace.user,
      password: workspace.password,
      fromAddress: parsed.address,
      fromName: workspace.displayName ?? parsed.name,
    };
  }

  // The switch withdraws the offer to workspaces, so it is weighed only when there is a workspace
  // to withdraw it from. A null workspace is the instance's own mail, an admin's test send, or an
  // outbox row attributed to no workspace, and that keeps flowing: an operator has to be able to
  // verify the server they just configured, and gating it would make the switch a roundabout way
  // of clearing the host.
  if (workspace !== null && !instance.enabled) return null;
  if (!instance.host || !instance.from) return null;

  const parsed = parseAddress(instance.from);
  return {
    tier: 'instance',
    host: instance.host,
    port: instance.port ?? defaultPort(instance.secure),
    secure: instance.secure,
    user: instance.user,
    password: instance.password,
    fromAddress: parsed.address,
    fromName: workspace?.displayName ?? parsed.name,
  };
}

/**
 * The From header.
 *
 * The display name is quoted and its quotes and backslashes escaped: an unquoted name containing a
 * comma parses as two addresses, which is a header-injection shaped bug in a field a workspace
 * owner controls.
 */
export function formatFrom(source: MailSource): string {
  if (!source.fromName) return source.fromAddress;

  const escaped = source.fromName.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"${escaped}" <${source.fromAddress}>`;
}

/**
 * Map a resolved source onto nodemailer's connection options.
 *
 * `secure` means implicit TLS, so STARTTLS is `secure: false` plus `requireTLS`, which refuses to
 * continue in plaintext if the server does not offer the upgrade. Tested directly because the
 * delivery tests stub the send path.
 */
export function buildTransportOptions(
  source: MailSource,
  pinnedAddress?: string | null
): SmtpTransportOptions {
  return {
    host: source.host,
    port: source.port,
    secure: source.secure === 'ssl',
    requireTLS: source.secure === 'starttls',
    // Pinning replaces the host with the address the guard checked and moves the name to
    // `servername`. nodemailer resolves `host` itself rather than going through net.connect's
    // `lookup`, and short-circuits when it is already an IP, so this is the point where the choice
    // of address is actually made. `servername` then drives SNI and certificate validation in both
    // the implicit-TLS and STARTTLS paths, so the certificate is still checked against the name the
    // owner configured.
    //
    // The cost is nodemailer's retry across a host's other addresses: it collects those from its own
    // resolution, which no longer happens. The address kept is the one the resolver put first, which
    // is already the one the machine's own routing prefers, so this loses a fallback rather than a
    // preference.
    ...(pinnedAddress ? { host: pinnedAddress, servername: source.host } : {}),
    // Omitted entirely when there are no credentials: an auth block with empty values makes
    // nodemailer attempt AUTH against a relay that does not want it.
    ...(source.user ? { auth: { user: source.user, pass: source.password ?? '' } } : {}),
  };
}

/**
 * Refuse a workspace-chosen SMTP host that points back into the instance's own networks.
 *
 * The two tiers are different trust decisions. An instance host is set by whoever runs the machine,
 * where `localhost:1025` (Mailhog) and an RFC1918 relay are both documented setups. A workspace host
 * is typed by a tenant, for whom 127.0.0.1 or a neighbour's subnet is not theirs to reach.
 *
 * Throws `BlockedHostError` specifically, so callers can answer "not allowed" without also answering
 * "and here is what happened when we tried".
 */
export async function assertMailHostAllowed(
  source: Pick<MailSource, 'tier' | 'host'>,
  opts: { resolve?: Resolver } = {}
): Promise<string[] | null> {
  if (source.tier === 'instance') return null;
  return assertPublicHost(source.host, opts);
}

/**
 * Both tiers of stored settings, resolved for one workspace. `null` workspace is instance mail.
 *
 * A workspace with no stored row falls back to its default rather than to null: null is reserved
 * for "no workspace at all", and the default is instance mode, which the switch gates.
 */
function readMailSource(workspaceId: string | null): MailSource | null {
  const instance = readInstanceMailConfig();
  const workspace = workspaceId
    ? readWorkspaceMailConfig(workspaceId) ?? defaultWorkspaceMail(workspaceId)
    : null;

  return resolveMailSource(instance, workspace);
}

/**
 * Whether mail composed for this workspace has anywhere to go: both switches on, and a server
 * behind them.
 *
 * Asked before anything is composed, see lib/scheduler/review-notifications.ts, so that a channel
 * nobody can send through does not accumulate a backlog to release later. It is the same question
 * `resolveTransport` answers by returning null, asked without building a connection or resolving a
 * name, because composition happens on a timer and must not depend on DNS.
 */
export function isMailSending(workspaceId: string | null): boolean {
  return readMailSource(workspaceId) !== null;
}

/**
 * The transport for a workspace's mail, or null when nothing is configured.
 *
 * `workspaceId` is null for instance mail, an admin's test send, which goes out on the instance's
 * own server.
 *
 * The host guard runs here rather than where the host is saved, because this is the only point every
 * send passes through. Validating on write would leave rows written before the guard existed, and
 * would decide once against a DNS answer that the owner of the name can change afterwards, a host
 * that resolved publicly on Tuesday can resolve to 127.0.0.1 on Wednesday, and nothing would look at
 * it again. The cost that buys is one lookup per transport, and a transport is already built once
 * per workspace per drain pass rather than once per message, so a queue of a thousand messages for
 * one workspace still resolves once.
 *
 * `resolve` exists so tests can decide what a name resolves to without touching DNS.
 */
export async function resolveTransport(
  workspaceId: string | null,
  opts: { resolve?: Resolver } = {}
): Promise<ResolvedTransport | null> {
  const source = readMailSource(workspaceId);
  if (!source) return null;

  // The addresses that passed the guard, or null for an instance host, which is not guarded.
  const allowed = await assertMailHostAllowed(source, opts);

  const { createTransport } = await import('nodemailer');
  const transporter = createTransport(buildTransportOptions(source, allowed?.[0]));
  const from = formatFrom(source);

  return {
    from,
    async sendMail(message: OutboundMessage): Promise<void> {
      await transporter.sendMail({
        from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html ?? undefined,
      });
    },
    close(): void {
      transporter.close();
    },
  };
}
