/**
 * How the outbox is doing, across the whole instance.
 *
 * Counts and an age, never a recipient or a subject. A pending count that will not fall, or an
 * oldest-message age that keeps climbing, is how an operator finds out mail is not going out —
 * before a client tells them.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, mailErrorResponse } from '@/lib/api/mail-route';
import { getQueueStats } from '@/lib/mail/queue-stats';

export async function GET(_request: NextRequest) {
  try {
    await requireAdmin();
    return NextResponse.json(getQueueStats());
  } catch (error) {
    return mailErrorResponse(error, 'Failed to read the mail queue');
  }
}
