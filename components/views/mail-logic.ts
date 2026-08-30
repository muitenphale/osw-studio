/**
 * The Mail page's logic, as plain functions.
 *
 * Two rules hold across everything here.
 *
 * A test send has four outcomes, not four flavours of failure. `blocked` must never read as a
 * connection problem: the host guard refused the address before a socket was opened, so there is
 * nothing to report about what is listening on it.
 *
 * The queue counts messages a mail server *accepted* at hand-off. Bounces arrive later at a mailbox
 * nothing here reads, so nothing in this file may call a message delivered.
 */

import { QUIET_PERIOD_MINUTES } from '@/lib/review/digest';
import type { QueueStats } from '@/lib/mail/queue-stats';

// ---------------------------------------------------------------------------
// Test sends
// ---------------------------------------------------------------------------

export type TestOutcome =
  | 'sent'
  | 'unconfigured'
  | 'blocked'
  | 'refused'
  | 'unauthorized'
  | 'forbidden'
  | 'error';

export interface TestPresentation {
  outcome: TestOutcome;
  /** Drives the icon and the colour. `blocked` is its own tone because it is its own answer. */
  tone: 'success' | 'holding' | 'blocked' | 'failure';
  title: string;
  detail: string;
  /** The mail server's own words, shown verbatim. Only ever set for a refusal. */
  serverError: string | null;
}

/**
 * Which of the route's outcomes came back.
 *
 * `unconfigured` and `blocked` are both 400, so the message has to separate them. The sniff is
 * biased: an unrecognised 400 reads as `unconfigured`, never as a connection failure, so a drifting
 * message can at worst describe a refused host as a missing one.
 */
export function classifyTestResponse(status: number, error: string | null): TestOutcome {
  if (status === 200) return 'sent';
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  // 502 is the routes' chosen code for an upstream refusal, the failure is the mail server's.
  if (status === 502) return 'refused';
  if (status === 400) return error && /not allowed/i.test(error) ? 'blocked' : 'unconfigured';
  return 'error';
}

export function presentTestResult(input: {
  status: number;
  /** The `error` field of the response body, if there was one. */
  error: string | null;
  /** Where the test went, always the signed-in person's own address. */
  recipient: string | null;
}): TestPresentation {
  const outcome = classifyTestResponse(input.status, input.error);
  const to = input.recipient ?? 'your own address';

  switch (outcome) {
    case 'sent':
      return {
        outcome,
        tone: 'success',
        title: 'The mail server accepted it',
        detail: `A test message addressed to ${to} was handed over and accepted. Check that mailbox — a server accepting a message is not the same as it arriving.`,
        serverError: null,
      };
    case 'unconfigured':
      return {
        outcome,
        tone: 'holding',
        title: 'Nothing to send with',
        detail:
          input.error ??
          'No mail server is configured, so there was nothing to send the test with.',
        serverError: null,
      };
    case 'blocked':
      return {
        outcome,
        tone: 'blocked',
        title: 'That host is not allowed',
        detail:
          'A workspace mail server has to be reachable at a public address. Nothing was dialled, so this is not a connection failure — the address was refused before any connection was attempted.',
        serverError: null,
      };
    case 'refused':
      return {
        outcome,
        tone: 'failure',
        title: 'The mail server refused it',
        detail: 'Nothing was sent. The server gave its own reason:',
        serverError: input.error ?? 'The mail server gave no reason.',
      };
    case 'unauthorized':
      return {
        outcome,
        tone: 'failure',
        title: 'Your session has expired',
        detail: 'Sign in again, then send the test.',
        serverError: null,
      };
    case 'forbidden':
      return {
        outcome,
        tone: 'failure',
        title: 'Not yours to send',
        detail: input.error ?? 'You do not have permission to send a test from here.',
        serverError: null,
      };
    default:
      return {
        outcome,
        tone: 'failure',
        title: 'The test could not run',
        detail: input.error ?? 'Something went wrong before the message reached a mail server.',
        serverError: null,
      };
  }
}

// ---------------------------------------------------------------------------
// The queue
// ---------------------------------------------------------------------------

/** Whether mail is actually going out. `unknown` is for before the page has been told, see
 *  `InstanceAvailability`. */
/**
 * `not-sending` rather than a word about the queue: composition is gated on the same predicate this
 * state is derived from (lib/scheduler/review-notifications.ts asks isMailSending before writing
 * anything), and pending mail is discarded when a workspace stops sending. So in every branch that
 * is not `sending`, nothing is queued and nothing accumulates, a badge suggesting mail was being
 * held for later would contradict the switch's own description.
 */
export type SendingState = 'sending' | 'not-sending' | 'unknown';

export interface QueuePresentation {
  headline: string;
  /** Sentences under the headline, in the order they should be read. */
  lines: string[];
}

export function formatAge(seconds: number | null): string {
  if (seconds === null) return 'a moment';
  if (seconds < 60) return 'less than a minute';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'}`;
  const days = Math.floor(hours / 24);
  return `${days} days`;
}

/**
 * The queue in words.
 *
 * The closing line says "accepted by the mail server" because that is all the outbox ever learns.
 *
 * There is no "nothing is going out" state here: the queue is only shown beside a server that can
 * send (`instanceCanSend`, `workspaceCanSend`), and unsendable mail is never composed.
 */
export function presentQueue(
  stats: QueueStats,
  opts: { scope: 'workspace' | 'instance' }
): QueuePresentation {
  const parts: string[] = [];
  // "of them" because `failing` counts a subset of `pending`, reading the two as separate piles
  // would overstate the backlog.
  if (stats.pending > 0) parts.push(`${stats.pending} waiting`);
  if (stats.failing > 0) parts.push(`${stats.failing} of them failing`);
  if (stats.abandoned > 0) parts.push(`${stats.abandoned} given up`);

  const headline = parts.length === 0 ? 'Queue — empty' : `Queue — ${parts.join(', ')}`;

  const lines: string[] = [];

  if (opts.scope === 'instance') {
    lines.push('Across every workspace on this instance.');
  }

  if (stats.pending > 0) {
    lines.push(`The oldest has been waiting ${formatAge(stats.oldestPendingAgeSeconds)}.`);
  }

  if (stats.failing > 0) {
    lines.push(
      'A failing message is retried on a growing delay. Send a test to see the mail server’s own reason.'
    );
  }

  if (stats.abandoned > 0) {
    lines.push(
      `${stats.abandoned} ran out of attempts and will not be retried. They are kept as the record of what failed.`
    );
  }

  if (stats.pending === 0 && stats.abandoned === 0) {
    lines.push(
      `Nothing is waiting. Comments are held for ${QUIET_PERIOD_MINUTES} minutes of quiet before a digest is queued.`
    );
  }

  lines.push(
    'These are messages waiting to be handed to a mail server. Leaving the queue means a mail server accepted it, which is not the same as it reaching a person.'
  );

  return { headline, lines };
}

// ---------------------------------------------------------------------------
// Who this workspace sends as
// ---------------------------------------------------------------------------

/**
 * What the page knows about the instance tier: whether this workspace may relay through it, and 
 * for an admin only, the address it would send as.
 *
 * Separate because a non-admin owner is told the first and not the second. `unknown` means no answer
 * has arrived yet, not that the owner cannot read the instance tier: the workspace response carries
 * `instanceConfigured`. A wrong "unavailable" would push an agency into buying an SMTP account it
 * does not need.
 */
export interface InstanceAvailability {
  state: 'available' | 'unavailable' | 'unknown';
  /** The instance's From, when the page is allowed to know it. */
  from: string | null;
}

/**
 * What the instance switch reads as when the page opens.
 *
 * The stored setting cannot default off. An instance provisioned from SMTP_* never writes a row for
 * it and never will, so absence has to mean enabled, `parseEnabled` in lib/mail/settings.ts is
 * where that is argued, and the symptom of getting it wrong is every workspace's mail stopping with
 * nothing to see but an outbox filling, which is also what a correctly unconfigured instance looks
 * like.
 *
 * So the switch is shown as what the instance is *doing* rather than as what the row says: an offer
 * of a server with no host and no From address is not an offer, and drawing it as on would claim
 * mail was on its way when nothing can send. With both fields present and no row written, it is on,
 * and drawing it off would misreport the system in the other direction.
 *
 * A starting position, not a clamp, an admin turns it on to reveal the fields and fill them in,
 * and the saved settings seed it again afterwards.
 */
export function instanceToggleState(settings: { enabled: boolean; configured: boolean }): boolean {
  return settings.enabled && settings.configured;
}

/**
 * Whether the instance has a server at all, which is what its test button and its queue hang on.
 *
 * `enabled` is taken and deliberately not weighed. It answers whether the server is *offered* to the
 * workspaces, and an operator who has withdrawn the offer still has a server: the instance's own
 * mail goes through it, so a test send still means something and a delivery pass still has somewhere
 * to go. With no host and no From there is neither, a button that can only report that nothing is
 * configured is a control the page can answer for itself by not drawing it.
 *
 * The display-side mirror of `canSendInstanceMail` in lib/mail/settings.ts, which is what fills in
 * `configured`.
 */
export function instanceCanSend(settings: { enabled: boolean; configured: boolean }): boolean {
  return settings.configured;
}

/**
 * Whether this workspace has somewhere to send, which is what its test button and its queue hang on.
 *
 * The display-side mirror of `resolveMailSource` in lib/mail/transport.ts returning null, and it has
 * to agree with it: this decides whether the controls are drawn, and that one decides whether
 * pressing them does anything. Own mode needs its own host and address; instance mode needs the
 * offer, not merely a server the operator keeps to themselves; and a switched-off workspace sends
 * through neither.
 *
 * `unknown` counts as no. It is the moment before the page has been told, and a test button that
 * turns out to have nothing behind it is worse than one that appears a moment later.
 */
export function workspaceCanSend(input: {
  enabled: boolean;
  mode: 'instance' | 'own';
  host: string | null;
  from: string | null;
  instance: InstanceAvailability;
}): boolean {
  if (!input.enabled) return false;
  if (input.mode === 'own') return input.host !== null && input.from !== null;
  return input.instance.state === 'available';
}

/**
 * Split `Name <address>` into its parts.
 *
 * A display-only mirror of `parseAddress` in lib/mail/transport.ts, which is server-only and cannot
 * be imported here. It is duplicated rather than shared because what it feeds is a sentence, not a
 * header: if the two ever disagree the page shows a slightly wrong name, and the mail is unaffected.
 */
export function parseFromAddress(from: string): { address: string; name: string | null } {
  const match = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(from);
  if (!match) return { address: from.trim(), name: null };

  const name = match[1].replace(/^"(.*)"$/, '$1').trim();
  return { address: match[2].trim(), name: name === '' ? null : name };
}

/**
 * The From this configuration will actually send as.
 *
 * The display name wins over the name inside the address in both modes, because that is what
 * `resolveMailSource` does. Own mode has no display-name field on this page, so this is how an owner
 * finds out that a name they set while relaying through the instance is still in front of their own
 * address.
 */
export function formatSender(from: string | null, displayName: string | null): string | null {
  if (!from) return null;
  const parsed = parseFromAddress(from);
  const name = displayName ?? parsed.name;
  return name ? `${name} <${parsed.address}>` : parsed.address;
}

export interface SendingDescription {
  state: SendingState;
  sentence: string;
}

export function describeWorkspaceSending(input: {
  /** The workspace's own switch. Off outranks everything below it. */
  enabled: boolean;
  mode: 'instance' | 'own';
  displayName: string | null;
  host: string | null;
  from: string | null;
  instance: InstanceAvailability;
}): SendingDescription {
  // Answered first, and without reference to the settings underneath: a switched-off workspace does
  // not send through a server it has configured, so naming that server here would describe a
  // sending arrangement that is not in effect.
  if (!input.enabled) {
    return {
      state: 'not-sending',
      sentence:
        'Sending is off. Comments still land in the review. Nothing is emailed until you turn this on.',
    };
  }

  if (input.mode === 'own') {
    if (input.host && input.from) {
      return {
        state: 'sending',
        sentence: `Mail from this workspace goes out as ${formatSender(input.from, input.displayName)}, through ${input.host}.`,
      };
    }
    const missing = !input.host && !input.from ? 'a host and a From address' : !input.host ? 'a host' : 'a From address';
    return {
      state: 'not-sending',
      sentence: `This workspace is set to use its own mail server but still needs ${missing}. Comments are still collected in the review itself.`,
    };
  }

  if (input.instance.state === 'unavailable') {
    return {
      state: 'not-sending',
      sentence:
        'No mail is going out. This instance has no mail server to relay through, and this workspace has not set up its own.',
    };
  }

  if (input.instance.state === 'available' && input.instance.from) {
    return {
      state: 'sending',
      sentence: `Mail from this workspace goes out as ${formatSender(input.instance.from, input.displayName)}, through the instance mail server.`,
    };
  }

  // Without the instance's From there is no sender to name, an owner who is not an instance admin
  // is never shown it. That does not make the state unknowable: the workspace response carries
  // whether the instance will relay, so `available` settles it, and the badge is a status word
  // rather than a set of settings. `unknown` is left for the moment before any answer has arrived.
  return {
    state: input.instance.state === 'available' ? 'sending' : 'unknown',
    sentence: input.displayName
      ? `Mail from this workspace goes out through the instance mail server, as ${input.displayName} on the instance’s own address.`
      : 'Mail from this workspace goes out through the instance mail server, on the instance’s own address and under its own name.',
  };
}

// ---------------------------------------------------------------------------
// The form
// ---------------------------------------------------------------------------

/** What a settings form holds. Ports stay strings so a half-typed one is not a validation error. */
export interface SmtpForm {
  host: string;
  port: string;
  secure: 'starttls' | 'ssl' | 'none';
  user: string;
  from: string;
}

/**
 * The three states of a password field on a page that can never render one: leave it alone, set it
 * to something typed, or clear it. `undefined` is the first, and is what keeps the rest of the form
 * saveable without knowing what the stored password is.
 */
export type PasswordIntent = string | null | undefined;

export function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export function parsePortInput(value: string): { port: number | null } | { error: string } {
  const trimmed = value.trim();
  if (trimmed === '') return { port: null };
  const port = Number(trimmed);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { error: 'Port must be a whole number between 1 and 65535.' };
  }
  return { port };
}

/**
 * The SMTP half of a settings body.
 *
 * Every field is sent, including the empty ones as nulls, so that clearing a field on the page
 * clears it on the server. The password is the exception: it is only ever sent when the person
 * typed a new one or asked for it to be cleared.
 */
export function buildSmtpBody(
  form: SmtpForm,
  password: PasswordIntent
): { body: Record<string, unknown> } | { error: string } {
  const port = parsePortInput(form.port);
  if ('error' in port) return { error: port.error };

  const body: Record<string, unknown> = {
    host: emptyToNull(form.host),
    port: port.port,
    secure: form.secure,
    user: emptyToNull(form.user),
    from: emptyToNull(form.from),
  };
  if (password !== undefined) body.password = password;

  return { body };
}
