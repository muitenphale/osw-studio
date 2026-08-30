/**
 * Drains the email outbox. lib/scheduler/review-notifications.ts is the half that fills it; the two
 * are registered independently and neither depends on the other having run.
 *
 * Only an outright failure is logged, and without naming a recipient. "Nothing pending" is the
 * normal outcome every thirty seconds.
 */

import type { SchedulerTask } from './types';

export function createEmailDeliveryTask(): SchedulerTask {
  return {
    type: 'email-delivery',
    execute: runEmailDelivery,
    enabled: true,
  };
}

async function runEmailDelivery(): Promise<void> {
  try {
    // Dynamic so better-sqlite3 and nodemailer stay out of the client bundle.
    const { deliverPendingEmails } = await import('@/lib/mail/delivery');
    await deliverPendingEmails();
  } catch (err) {
    // The rows stay queued, so the next pass retries them.
    console.error('[EmailDelivery] Pass failed:', err instanceof Error ? err.message : err);
  }
}
