/**
 * Send a test message on this workspace's transport.
 *
 * Goes to the signed-in owner's own address. In instance mode it exercises the instance's server,
 * which is the point: the owner finds out now whether the mode they chose can actually send.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireWorkspaceOwner, mailErrorResponse } from '@/lib/api/mail-route';
import { readWorkspaceMailSettings } from '@/lib/mail/settings';
import { sendTestMessage } from '@/lib/mail/test-send';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { session, workspaceId } = await requireWorkspaceOwner(params);

    const outcome = await sendTestMessage(workspaceId, session.email);

    if (outcome.status === 'unconfigured') {
      return NextResponse.json(
        { error: 'No mail server is configured for this workspace or for the instance.' },
        { status: 400 }
      );
    }
    if (outcome.status === 'blocked') {
      // Not a 502, and deliberately says nothing about what happened when the host was dialled —
      // nothing was. A connection-level answer here would report back whether something is listening
      // on an address this workspace was refused, which is the reason the refusal exists.
      return NextResponse.json(
        {
          error:
            'That SMTP host is not allowed. A workspace mail server has to be reachable at a public address.',
        },
        { status: 400 }
      );
    }
    if (outcome.status === 'refused') {
      // The server's own words, but only for a server this workspace owns. A summary would hide the
      // difference between a wrong password and a relay refusing the From address, and an owner
      // configuring their own relay needs to tell those apart.
      //
      // In instance mode the host belongs to the operator, and on a hosted instance the owner is a
      // tenant. An SMTP rejection quotes back the host, its greeting banner and the From address it
      // refused — the operator's, none of which this caller configured or is entitled to read. They
      // still need to know the send failed and that it is not theirs to fix.
      if (readWorkspaceMailSettings(workspaceId).mode === 'instance') {
        return NextResponse.json(
          {
            error:
              "The instance's mail server refused the message. Contact whoever runs this instance, or switch this workspace to its own mail server.",
          },
          { status: 502 }
        );
      }
      return NextResponse.json({ error: outcome.error }, { status: 502 });
    }

    return NextResponse.json({ sent: true });
  } catch (error) {
    return mailErrorResponse(error, 'Failed to send test message');
  }
}
