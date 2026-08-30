/**
 * Instance mail settings.
 *
 * GET  - the effective configuration, stored values merged over the SMTP_* environment
 * PUT  - change it
 *
 * The password is never in either response. A stored one becomes `smtpPasswordSet: true` and
 * nothing else, the same substitution `toPublicDeployment` makes for a review password hash.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, mailErrorResponse, parseSmtpFields } from '@/lib/api/mail-route';
import { discardRelayedPending } from '@/lib/mail/outbox';
import {
  isInstanceMailOffered,
  readInstanceMailSettings,
  writeInstanceMail,
  type InstanceMailInput,
} from '@/lib/mail/settings';

export async function GET(_request: NextRequest) {
  try {
    await requireAdmin();
    return NextResponse.json(readInstanceMailSettings());
  } catch (error) {
    return mailErrorResponse(error, 'Failed to read mail settings');
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requireAdmin();

    const body = (await request.json()) as Record<string, unknown>;
    const parsed = parseSmtpFields(body);
    if ('error' in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const input: InstanceMailInput = { ...parsed.fields };

    // Whether this server is offered at all, which is a separate decision from what it connects to:
    // an operator may relay their own system mail through it and still not want every tenant sending
    // on their domain's reputation. Only a boolean, so a truthy string cannot switch mail off for an
    // instance by accident.
    if (body.enabled !== undefined) {
      if (typeof body.enabled !== 'boolean') {
        return NextResponse.json({ error: 'enabled must be a boolean' }, { status: 400 });
      }
      input.enabled = body.enabled;
    }

    // Asked either side of the write, so that withdrawing the offer and emptying the host — the two
    // ways to stop relaying — are treated alike. What the workspaces relaying through this server
    // had queued goes with it: those rows would otherwise sit untouched, delivery holding rather
    // than failing, and go out as one volley when the offer came back. Composition stops at the
    // same moment for the same workspaces. The instance's own mail is not part of the offer and
    // keeps both its queue and its transport.
    const wasOffered = isInstanceMailOffered();

    writeInstanceMail(input);

    if (wasOffered && !isInstanceMailOffered()) {
      discardRelayedPending();
    }

    // The freshly effective settings rather than an echo of the request, so a client sees what a
    // cleared field fell back to in the environment.
    return NextResponse.json(readInstanceMailSettings());
  } catch (error) {
    return mailErrorResponse(error, 'Failed to save mail settings');
  }
}
