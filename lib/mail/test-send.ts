/**
 * The test send behind both "send a test email" buttons.
 *
 * It bypasses the outbox: a queued test is indistinguishable from the problem it diagnoses, and the
 * person pressing the button is waiting to find out whether what they just typed works.
 *
 * `refused` carries the SMTP server's own words. "535 5.7.8 Authentication credentials invalid"
 * tells an operator what to fix, where a reworded "could not send email" leaves a wrong password
 * invisible for weeks. It is only shown to the admin or owner who triggered the send.
 *
 * `blocked` must not take that path. A host the guard refused never had a connection opened to it,
 * and a connection-level answer would make this button the readable half of a port scan. It is a
 * separate outcome so the routes cannot answer it with an SMTP error by accident.
 */

import 'server-only';

import { BlockedHostError } from '@/lib/web/ssrf-guard';
import { resolveTransport } from './transport';

export type TestSendOutcome =
  | { status: 'sent' }
  | { status: 'unconfigured' }
  | { status: 'blocked' }
  | { status: 'refused'; error: string };

export async function sendTestMessage(workspaceId: string | null, to: string): Promise<TestSendOutcome> {
  let transport;
  try {
    transport = await resolveTransport(workspaceId);
  } catch (err) {
    if (err instanceof BlockedHostError) return { status: 'blocked' };
    // Anything else here is the host guard's lookup failing rather than refusing, and a name that
    // does not resolve is a typo the sender has to be able to read. It reaches them the same way an
    // SMTP rejection does, and carries no more than the hostname they typed.
    return { status: 'refused', error: err instanceof Error ? err.message : String(err) };
  }
  if (!transport) return { status: 'unconfigured' };

  try {
    await transport.sendMail({
      to,
      subject: 'OSW Studio mail test',
      text:
        'This is a test message from OSW Studio.\n\n' +
        'If you are reading it, this instance can hand mail to its SMTP server. ' +
        'Whether a message reaches a recipient afterwards is up to that server and theirs.',
    });
    return { status: 'sent' };
  } catch (err) {
    return { status: 'refused', error: err instanceof Error ? err.message : String(err) };
  } finally {
    try {
      transport.close();
    } catch {
      // Nothing depends on a clean close here.
    }
  }
}
