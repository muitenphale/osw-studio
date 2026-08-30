/**
 * Workspace mail settings.
 *
 * GET  - this workspace's mode and, in own mode, its SMTP server
 * PUT  - change it
 *
 * Owner-only. An editor can act on client feedback, but which address a client's mail arrives from
 * is a decision about the agency's identity.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  requireWorkspaceOwner,
  mailErrorResponse,
  parseDisplayName,
  parseSmtpFields,
} from '@/lib/api/mail-route';
import { discardWorkspacePending } from '@/lib/mail/outbox';
import {
  isInstanceMailOffered,
  readWorkspaceMailSettings,
  writeWorkspaceMail,
  type WorkspaceMailInput,
  type WorkspaceMailResponse,
} from '@/lib/mail/settings';
import { isMailSending } from '@/lib/mail/transport';

/**
 * The workspace's own settings plus whether there is an instance server to relay through.
 *
 * That boolean is the only thing the instance tier contributes, and it is here because the PUT below
 * refuses `mode: 'instance'` without it. `GET /api/admin/mail` is the only other endpoint that
 * reports it and is admin-only, so without this a workspace owner — who on a hosted instance is a
 * tenant, not the operator — could only find out by choosing the mode and being refused. Nothing
 * else about the instance is included: not the host, not the credentials, not the address.
 *
 * It answers "may this workspace relay", not "is there a server" — a complete server the operator
 * has withdrawn is not one a workspace may point itself at, and this is the only fact the owner's
 * page needs to know the difference.
 */
function response(workspaceId: string): WorkspaceMailResponse {
  return {
    ...readWorkspaceMailSettings(workspaceId),
    instanceConfigured: isInstanceMailOffered(),
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { workspaceId } = await requireWorkspaceOwner(params);
    return NextResponse.json(response(workspaceId));
  } catch (error) {
    return mailErrorResponse(error, 'Failed to read mail settings');
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { workspaceId } = await requireWorkspaceOwner(params);

    const body = (await request.json()) as Record<string, unknown>;
    const parsed = parseSmtpFields(body);
    if ('error' in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const input: WorkspaceMailInput = { ...parsed.fields };

    // Whether this workspace sends at all. Only a boolean, so a truthy string cannot switch a
    // workspace's mail on by accident — the same rule the instance switch is held to.
    if (body.enabled !== undefined) {
      if (typeof body.enabled !== 'boolean') {
        return NextResponse.json({ error: 'enabled must be a boolean' }, { status: 400 });
      }
      input.enabled = body.enabled;
    }

    if (body.mode !== undefined) {
      if (body.mode !== 'instance' && body.mode !== 'own') {
        return NextResponse.json({ error: "mode must be 'instance' or 'own'" }, { status: 400 });
      }
      input.mode = body.mode;
    }

    // This name ends up in a From header, and in `instance` mode it does so on the instance's own
    // address — so what a tenant may put in it is settled here, not at send time.
    const name = parseDisplayName(body.displayName);
    if ('error' in name) {
      return NextResponse.json({ error: name.error }, { status: 400 });
    }
    if ('displayName' in name) {
      input.displayName = name.displayName;
    }

    // Checked on the server even though the UI disables the option: a client holding a page from
    // before the instance's mail was removed — or switched off — would otherwise write a mode that
    // cannot send, and the workspace's notifications would sit in the outbox with nothing to
    // explain why.
    if (input.mode === 'instance' && !isInstanceMailOffered()) {
      return NextResponse.json(
        { error: 'This instance has no mail server configured. Use your own SMTP server instead.' },
        { status: 400 }
      );
    }

    // Own mode without a server is the same dead end reached from the other direction.
    if (input.mode === 'own') {
      const existing = readWorkspaceMailSettings(workspaceId);
      const host = input.host === undefined ? existing.host : input.host;
      const from = input.from === undefined ? existing.from : input.from;
      if (!host || !from) {
        return NextResponse.json(
          { error: 'Your own SMTP server needs both a host and a From address.' },
          { status: 400 }
        );
      }
    }

    // Whether this workspace could send, asked either side of the write. Switching it off is the
    // only way an owner reaches "no", and what happens then is that the queue goes with it: rows
    // left behind would sit untouched — delivery holds rather than fails with no transport — and go
    // out as one volley when the switch came back. Composition already stops at the same moment, so
    // dropping these is what makes the two halves say the same thing.
    const wasSending = isMailSending(workspaceId);

    writeWorkspaceMail(workspaceId, input);

    if (wasSending && !isMailSending(workspaceId)) {
      discardWorkspacePending(workspaceId);
    }

    return NextResponse.json(response(workspaceId));
  } catch (error) {
    return mailErrorResponse(error, 'Failed to save mail settings');
  }
}
