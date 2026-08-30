import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { ResolvedTransport } from '@/lib/mail/transport';

/**
 * Draining the outbox.
 *
 * One rule outranks everything else here: with no transport resolvable the pass is a no-op and the
 * rows stay exactly as they were. Counting an attempt against a message that was never handed to a
 * server would walk every queued message to MAX_DELIVERY_ATTEMPTS while an instance sat unconfigured,
 * and the mail would then be silently dead the moment someone finally set SMTP up. The attempt
 * counter is asserted directly for that reason — "still pending" alone would pass even while the
 * counter climbed.
 *
 * `resolveTransport` is the stub boundary: the real one is the only code that touches nodemailer or
 * a socket, so replacing it means no test can send mail. Its option mapping is covered separately
 * in transport-resolution.test.ts.
 */

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({ resolveTransport: vi.fn() }));

vi.mock('@/lib/mail/transport', () => ({ resolveTransport: mocks.resolveTransport }));

const WORKSPACE_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const WORKSPACE_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

let dir: string;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'osws-mail-delivery-'));
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv('DATA_DIR', path.join(dir, 'data'));
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(async () => {
  const { closeSystemDatabase } = await import('@/lib/auth/system-database');
  closeSystemDatabase();
  errorSpy.mockRestore();
  vi.unstubAllEnvs();
  fs.rmSync(dir, { recursive: true, force: true });
});

/** A transport that accepts everything, and records what it was handed. */
function acceptingTransport(): ResolvedTransport & { sent: string[] } {
  const sent: string[] = [];
  return {
    sent,
    from: 'noreply@instance.test',
    sendMail: vi.fn(async (message: { to: string }) => { sent.push(message.to); }),
    close: vi.fn(),
  };
}

/** A transport whose server rejects the credentials, the way a mistyped password behaves. */
function rejectingTransport(message = '535 5.7.8 Authentication credentials invalid'): ResolvedTransport {
  return {
    from: 'noreply@agency.test',
    sendMail: vi.fn(async () => { throw new Error(message); }),
    close: vi.fn(),
  };
}

async function rows(): Promise<Array<{ id: number; workspace_id: string | null; delivered: number; attempts: number }>> {
  const { getSystemDatabase } = await import('@/lib/auth/system-database');
  return getSystemDatabase()
    .prepare('SELECT id, workspace_id, delivered, attempts FROM email_outbox ORDER BY id ASC')
    .all() as Array<{ id: number; workspace_id: string | null; delivered: number; attempts: number }>;
}

// ---------------------------------------------------------------------------
// 6. No transport resolvable → rows stay pending and `attempts` does not move
// ---------------------------------------------------------------------------

describe('a pass with no transport configured', () => {
  it('leaves every row pending without counting an attempt', async () => {
    mocks.resolveTransport.mockResolvedValue(null);

    const { enqueueEmail } = await import('@/lib/mail/outbox');
    enqueueEmail({ workspaceId: WORKSPACE_A, to: 'sam@client.example', subject: 'A', bodyText: 'x' });
    enqueueEmail({ to: 'admin@localhost', subject: 'B', bodyText: 'x' });

    const { deliverPendingEmails } = await import('@/lib/mail/delivery');
    const result = await deliverPendingEmails();

    expect(result).toMatchObject({ accepted: 0, failed: 0, held: 2 });
    for (const row of await rows()) {
      expect(row.delivered).toBe(0);
      // The assertion the whole file exists for.
      expect(row.attempts).toBe(0);
    }
  });

  it('still holds after many passes, so the attempt budget is never spent while waiting', async () => {
    mocks.resolveTransport.mockResolvedValue(null);

    const { enqueueEmail, MAX_DELIVERY_ATTEMPTS, getPendingEmails } = await import('@/lib/mail/outbox');
    enqueueEmail({ workspaceId: WORKSPACE_A, to: 'sam@client.example', subject: 'A', bodyText: 'x' });

    const { deliverPendingEmails } = await import('@/lib/mail/delivery');
    for (let i = 0; i < MAX_DELIVERY_ATTEMPTS + 2; i++) await deliverPendingEmails();

    expect((await rows())[0].attempts).toBe(0);
    // And the message is still deliverable once a server appears.
    expect(getPendingEmails()).toHaveLength(1);
  });

  it('does not report an error for the ordinary unconfigured case', async () => {
    mocks.resolveTransport.mockResolvedValue(null);

    const { enqueueEmail } = await import('@/lib/mail/outbox');
    enqueueEmail({ to: 'admin@localhost', subject: 'A', bodyText: 'x' });

    const { deliverPendingEmails } = await import('@/lib/mail/delivery');
    await deliverPendingEmails();

    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('holds rather than failing when resolving the transport throws', async () => {
    // A malformed stored config is still not a delivery attempt.
    mocks.resolveTransport.mockRejectedValue(new Error('unreadable mail settings'));

    const { enqueueEmail } = await import('@/lib/mail/outbox');
    enqueueEmail({ workspaceId: WORKSPACE_A, to: 'sam@client.example', subject: 'A', bodyText: 'x' });

    const { deliverPendingEmails } = await import('@/lib/mail/delivery');
    await deliverPendingEmails();

    expect((await rows())[0].attempts).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 7. Backoff honours the schedule
// ---------------------------------------------------------------------------

describe('backoff', () => {
  it('attempts a never-tried message immediately', async () => {
    const { shouldDeliver } = await import('@/lib/mail/delivery');

    expect(shouldDeliver({ attempts: 0, last_attempted_at: null }, Date.now())).toBe(true);
  });

  it('waits the scheduled interval for each attempt count', async () => {
    const { shouldDeliver, BACKOFF_SCHEDULE } = await import('@/lib/mail/delivery');
    const now = Date.parse('2026-01-01T12:00:00Z');

    for (let attempts = 1; attempts <= BACKOFF_SCHEDULE.length; attempts++) {
      const wait = BACKOFF_SCHEDULE[attempts - 1] * 1000;
      const lastAttempt = new Date(now - wait).toISOString();
      const tooSoon = new Date(now - wait + 1000).toISOString();

      expect(shouldDeliver({ attempts, last_attempted_at: lastAttempt }, now)).toBe(true);
      expect(shouldDeliver({ attempts, last_attempted_at: tooSoon }, now)).toBe(false);
    }
  });

  it('clamps to the last step rather than running off the end of the schedule', async () => {
    const { shouldDeliver, BACKOFF_SCHEDULE } = await import('@/lib/mail/delivery');
    const now = Date.parse('2026-01-01T12:00:00Z');
    const last = BACKOFF_SCHEDULE[BACKOFF_SCHEDULE.length - 1] * 1000;

    expect(shouldDeliver({ attempts: 99, last_attempted_at: new Date(now - last).toISOString() }, now)).toBe(true);
    expect(shouldDeliver({ attempts: 99, last_attempted_at: new Date(now - last + 1000).toISOString() }, now)).toBe(false);
  });

  it('skips a backed-off row in a real pass and leaves its counter alone', async () => {
    const transport = acceptingTransport();
    mocks.resolveTransport.mockResolvedValue(transport);

    const { enqueueEmail } = await import('@/lib/mail/outbox');
    const { getSystemDatabase } = await import('@/lib/auth/system-database');
    const waiting = enqueueEmail({ to: 'waiting@example.test', subject: 'A', bodyText: 'x' });
    const ready = enqueueEmail({ to: 'ready@example.test', subject: 'B', bodyText: 'x' });

    getSystemDatabase()
      .prepare("UPDATE email_outbox SET attempts = 3, last_attempted_at = datetime('now') WHERE id = ?")
      .run(waiting);

    const { deliverPendingEmails } = await import('@/lib/mail/delivery');
    await deliverPendingEmails();

    expect(transport.sent).toEqual(['ready@example.test']);
    const byId = new Map((await rows()).map((r) => [r.id, r]));
    expect(byId.get(waiting)).toMatchObject({ attempts: 3, delivered: 0 });
    expect(byId.get(ready)?.delivered).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 8. One workspace's bad credentials fail only its own rows
// ---------------------------------------------------------------------------

describe('per-workspace isolation', () => {
  it('fails the broken workspace and accepts the healthy one in the same pass', async () => {
    const healthy = acceptingTransport();
    mocks.resolveTransport.mockImplementation(async (workspaceId: string | null) =>
      workspaceId === WORKSPACE_A ? rejectingTransport() : healthy
    );

    const { enqueueEmail } = await import('@/lib/mail/outbox');
    const broken = enqueueEmail({ workspaceId: WORKSPACE_A, to: 'a@client.example', subject: 'A', bodyText: 'x' });
    const alsoBroken = enqueueEmail({ workspaceId: WORKSPACE_A, to: 'b@client.example', subject: 'B', bodyText: 'x' });
    const good = enqueueEmail({ workspaceId: WORKSPACE_B, to: 'c@client.example', subject: 'C', bodyText: 'x' });

    const { deliverPendingEmails } = await import('@/lib/mail/delivery');
    const result = await deliverPendingEmails();

    const byId = new Map((await rows()).map((r) => [r.id, r]));
    expect(byId.get(broken)).toMatchObject({ delivered: 0, attempts: 1 });
    expect(byId.get(alsoBroken)).toMatchObject({ delivered: 0, attempts: 1 });
    expect(byId.get(good)?.delivered).toBe(1);
    expect(result).toMatchObject({ accepted: 1, failed: 2 });
  });

  it('resolves one transport per workspace per pass and reuses it', async () => {
    mocks.resolveTransport.mockResolvedValue(acceptingTransport());

    const { enqueueEmail } = await import('@/lib/mail/outbox');
    for (let i = 0; i < 4; i++) {
      enqueueEmail({ workspaceId: WORKSPACE_A, to: `r${i}@client.example`, subject: 'A', bodyText: 'x' });
    }
    enqueueEmail({ workspaceId: WORKSPACE_B, to: 'other@client.example', subject: 'B', bodyText: 'x' });

    const { deliverPendingEmails } = await import('@/lib/mail/delivery');
    await deliverPendingEmails();

    expect(mocks.resolveTransport).toHaveBeenCalledTimes(2);
  });

  it('keeps going when one workspace cannot resolve a transport at all', async () => {
    const healthy = acceptingTransport();
    mocks.resolveTransport.mockImplementation(async (workspaceId: string | null) =>
      workspaceId === WORKSPACE_A ? null : healthy
    );

    const { enqueueEmail } = await import('@/lib/mail/outbox');
    const held = enqueueEmail({ workspaceId: WORKSPACE_A, to: 'a@client.example', subject: 'A', bodyText: 'x' });
    const sent = enqueueEmail({ workspaceId: WORKSPACE_B, to: 'c@client.example', subject: 'C', bodyText: 'x' });

    const { deliverPendingEmails } = await import('@/lib/mail/delivery');
    await deliverPendingEmails();

    const byId = new Map((await rows()).map((r) => [r.id, r]));
    expect(byId.get(held)).toMatchObject({ delivered: 0, attempts: 0 });
    expect(byId.get(sent)?.delivered).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 9. A row with workspace_id NULL uses the instance transport
// ---------------------------------------------------------------------------

describe('instance mail', () => {
  it('sends a row with no workspace on the instance transport', async () => {
    const instance = acceptingTransport();
    mocks.resolveTransport.mockImplementation(async (workspaceId: string | null) => {
      if (workspaceId === null) return instance;
      return acceptingTransport();
    });

    const { enqueueEmail } = await import('@/lib/mail/outbox');
    enqueueEmail({ to: 'admin@localhost', subject: 'Test', bodyText: 'x' });
    enqueueEmail({ workspaceId: WORKSPACE_A, to: 'sam@client.example', subject: 'A', bodyText: 'x' });

    const { deliverPendingEmails } = await import('@/lib/mail/delivery');
    await deliverPendingEmails();

    expect(mocks.resolveTransport).toHaveBeenCalledWith(null);
    expect(instance.sent).toEqual(['admin@localhost']);
  });
});

describe('a successful pass', () => {
  it('marks accepted, never more than that, and closes what it opened', async () => {
    const transport = acceptingTransport();
    mocks.resolveTransport.mockResolvedValue(transport);

    const { enqueueEmail } = await import('@/lib/mail/outbox');
    const id = enqueueEmail({ workspaceId: WORKSPACE_A, to: 'sam@client.example', subject: 'A', bodyText: 'x', bodyHtml: '<p>x</p>' });

    const { deliverPendingEmails } = await import('@/lib/mail/delivery');
    const result = await deliverPendingEmails();

    expect(result).toMatchObject({ accepted: 1, failed: 0, held: 0 });
    expect((await rows()).find((r) => r.id === id)?.delivered).toBe(1);
    expect(transport.close).toHaveBeenCalled();
  });

  it('does no work and resolves nothing when the queue is empty', async () => {
    mocks.resolveTransport.mockResolvedValue(acceptingTransport());

    const { deliverPendingEmails } = await import('@/lib/mail/delivery');
    const result = await deliverPendingEmails();

    expect(result).toMatchObject({ accepted: 0, failed: 0, held: 0 });
    expect(mocks.resolveTransport).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Two passes at once send each message once
// ---------------------------------------------------------------------------

describe('overlapping passes', () => {
  /**
   * A row is selected as pending, sent, and only then marked. Two passes entering that window both
   * select it, so both send it — a client receiving the same digest twice. The admin flush endpoint
   * and the scheduler are the two callers and nothing coordinates them.
   *
   * The transport here blocks until released, which holds the first pass open across the exact
   * window rather than relying on timing to land inside it.
   */
  it('sends each queued message once when a flush lands on a scheduled pass', async () => {
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => { release = resolve; });

    const sent: string[] = [];
    mocks.resolveTransport.mockResolvedValue({
      from: 'noreply@instance.test',
      sendMail: vi.fn(async (message: { to: string }) => {
        sent.push(message.to);
        await held;
      }),
      close: vi.fn(),
    });

    const { enqueueEmail } = await import('@/lib/mail/outbox');
    enqueueEmail({ workspaceId: WORKSPACE_A, to: 'sam@client.example', subject: 'A', bodyText: 'x' });

    const { deliverPendingEmails } = await import('@/lib/mail/delivery');

    const first = deliverPendingEmails();
    // Entered while the first pass is parked inside sendMail, with the row still unmarked.
    const second = deliverPendingEmails();

    release();
    await Promise.all([first, second]);

    expect(sent).toEqual(['sam@client.example']);
    expect((await rows()).filter((r) => r.delivered === 1)).toHaveLength(1);
  });

  it('lets a later pass run once the previous one has finished', async () => {
    mocks.resolveTransport.mockResolvedValue(acceptingTransport());

    const { enqueueEmail } = await import('@/lib/mail/outbox');
    const { deliverPendingEmails } = await import('@/lib/mail/delivery');

    enqueueEmail({ workspaceId: WORKSPACE_A, to: 'first@client.example', subject: 'A', bodyText: 'x' });
    await deliverPendingEmails();

    enqueueEmail({ workspaceId: WORKSPACE_A, to: 'second@client.example', subject: 'B', bodyText: 'x' });
    const result = await deliverPendingEmails();

    expect(result.accepted).toBe(1);
  });
});
