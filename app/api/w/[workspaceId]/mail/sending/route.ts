/**
 * Whether mail for this workspace would actually go out.
 *
 * One boolean, readable by any workspace member, because the control it gates — the review
 * notification switch — is one an editor uses. The owner-only settings endpoints answer a larger
 * question and would refuse them.
 *
 * Nothing about the transport is included: not the tier it resolves to, not the host, not the
 * address. A member learns only that turning the switch on will have an effect.
 */

import { NextRequest, NextResponse } from 'next/server';

import { getWorkspaceContext } from '@/lib/api/workspace-context';
import { isMailSending } from '@/lib/mail/transport';
import { logger } from '@/lib/utils';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { workspaceId } = await getWorkspaceContext(params, 'viewer');
    return NextResponse.json({ sending: isMailSending(workspaceId) });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (
      error instanceof Error &&
      (error.message === 'Workspace access denied' ||
        error.message === 'Insufficient workspace permissions')
    ) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    logger.error('[Mail API] Error reading send availability:', error);
    return NextResponse.json({ error: 'Failed to read mail availability' }, { status: 500 });
  }
}
