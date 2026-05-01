import { createHmac } from 'crypto';
import { getPendingEvents, markDelivered, markFailed, pruneDelivered, isWebhookEnabled } from './outbox';
import { logger } from '@/lib/utils';
import type { WebhookEvent } from './types';

const WEBHOOK_URL = process.env.WEBHOOK_URL;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
const INSTANCE_ID = process.env.INSTANCE_ID || 'unknown';

const BACKOFF_SCHEDULE = [5, 30, 120, 600, 600, 600, 600, 600, 600, 600]; // seconds

function signPayload(body: string): string | null {
  if (!WEBHOOK_SECRET) return null;
  return createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');
}

function shouldDeliver(event: WebhookEvent): boolean {
  if (event.attempts === 0) return true;
  if (!event.last_attempted_at) return true;
  const backoffSeconds = BACKOFF_SCHEDULE[Math.min(event.attempts - 1, BACKOFF_SCHEDULE.length - 1)];
  const nextAttempt = new Date(event.last_attempted_at).getTime() + backoffSeconds * 1000;
  return Date.now() >= nextAttempt;
}

async function deliverEvent(event: WebhookEvent): Promise<boolean> {
  const body = JSON.stringify({
    event_type: event.event_type,
    payload: JSON.parse(event.payload),
    timestamp: event.created_at,
  });

  const signature = signPayload(body);
  if (!signature) {
    markFailed(event.id);
    return false;
  }

  try {
    const response = await fetch(`${WEBHOOK_URL}/api/webhooks/osws`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-instance-id': INSTANCE_ID,
        'x-webhook-signature': signature,
      },
      body,
      signal: AbortSignal.timeout(10000),
    });

    if (response.ok) {
      markDelivered(event.id);
      return true;
    } else {
      markFailed(event.id);
      return false;
    }
  } catch {
    markFailed(event.id);
    return false;
  }
}

export async function deliverPendingEvents(): Promise<{ delivered: number; failed: number }> {
  if (!isWebhookEnabled()) return { delivered: 0, failed: 0 };

  const events = getPendingEvents();
  let delivered = 0;
  let failed = 0;

  for (const event of events) {
    if (!shouldDeliver(event)) continue;
    const success = await deliverEvent(event);
    if (success) delivered++;
    else failed++;
  }

  // Prune old delivered events
  pruneDelivered();

  return { delivered, failed };
}

let deliveryInterval: ReturnType<typeof setInterval> | null = null;

export function startDeliveryLoop(): void {
  if (deliveryInterval || !isWebhookEnabled()) return;
  deliveryInterval = setInterval(() => {
    deliverPendingEvents().catch(err => logger.error('[Webhook] Delivery failed:', err));
  }, 5000);
}

export function stopDeliveryLoop(): void {
  if (deliveryInterval) {
    clearInterval(deliveryInterval);
    deliveryInterval = null;
  }
}
