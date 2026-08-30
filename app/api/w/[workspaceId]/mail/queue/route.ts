/**
 * How this workspace's outbox is doing.
 *
 * Scoped to the workspace's own rows: an owner sees their own backlog, not the instance's, and
 * never another workspace's. Counts and an age only — the messages themselves are private
 * notifications to named people.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireWorkspaceOwner, mailErrorResponse } from '@/lib/api/mail-route';
import { getQueueStats } from '@/lib/mail/queue-stats';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { workspaceId } = await requireWorkspaceOwner(params);
    return NextResponse.json(getQueueStats(workspaceId));
  } catch (error) {
    return mailErrorResponse(error, 'Failed to read the mail queue');
  }
}
