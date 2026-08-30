/**
 * Send a test message on the instance transport.
 *
 * It goes to the signed-in admin's own address and nowhere else — the route takes no recipient, so
 * there is nothing here an admin could point at a stranger.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, mailErrorResponse } from '@/lib/api/mail-route';
import { sendTestMessage } from '@/lib/mail/test-send';

export async function POST(_request: NextRequest) {
  try {
    const session = await requireAdmin();

    const outcome = await sendTestMessage(null, session.email);

    if (outcome.status === 'unconfigured') {
      return NextResponse.json(
        { error: 'Instance mail is not configured. Set an SMTP server and a From address first.' },
        { status: 400 }
      );
    }
    if (outcome.status === 'blocked') {
      // Unreachable in practice: the host guard exempts the instance tier, whose host the admin set
      // on their own machine. Handled anyway so the outcome cannot fall through to the verbatim
      // branch if that exemption is ever narrowed.
      return NextResponse.json({ error: 'That SMTP host is not allowed.' }, { status: 400 });
    }
    if (outcome.status === 'refused') {
      // Verbatim, and 502 rather than 500: the failure is the upstream mail server's, and the exact
      // wording is the only thing that distinguishes a wrong password from a blocked port.
      return NextResponse.json({ error: outcome.error }, { status: 502 });
    }

    return NextResponse.json({ sent: true });
  } catch (error) {
    return mailErrorResponse(error, 'Failed to send test message');
  }
}
