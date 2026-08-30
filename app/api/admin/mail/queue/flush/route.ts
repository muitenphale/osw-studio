/**
 * Run a delivery pass now.
 *
 * The scheduler gets to it on its own, but an operator who has just fixed a password should not
 * have to wait out a poll interval to find out whether the fix worked. Bounded to the same batch
 * size as a scheduled pass, so pressing it repeatedly cannot flood a relay.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, mailErrorResponse } from '@/lib/api/mail-route';
import { deliverPendingEmails } from '@/lib/mail/delivery';

export async function POST(_request: NextRequest) {
  try {
    await requireAdmin();

    // `held` is the honest answer when nothing is configured: nothing was sent and nothing failed.
    return NextResponse.json(await deliverPendingEmails());
  } catch (error) {
    return mailErrorResponse(error, 'Failed to run a delivery pass');
  }
}
