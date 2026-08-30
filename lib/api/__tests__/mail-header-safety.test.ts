import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { NextRequest } from 'next/server';

/**
 * What a workspace owner is allowed to put into an outgoing mail header.
 *
 * Two of the fields on this form end up verbatim in a `From:` line: the display name, and — in own
 * mode — the address itself. A carriage return or a line feed in either one is the classic header
 * injection: everything after the break parses as a new header, which is a `Bcc:` the agency never
 * wrote. In `instance` mode the display name rides on the *instance's* From address, so the value a
 * tenant types is sent from the operator's own domain and reputation.
 *
 * The check belongs here rather than in the formatter. `formatFrom` quotes and escapes for the
 * grammar of an address; whether the bytes are legal in a header at all is a property of the input,
 * and the only place refusing costs nothing is the boundary that accepts it.
 */

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({ requireAuth: vi.fn() }));

vi.mock('@/lib/auth/session', () => ({ requireAuth: mocks.requireAuth }));

let dir: string;
let workspaceId: string;
let ownerId: string;
let adminId: string;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'osws-mail-header-'));
  vi.resetModules();
  vi.clearAllMocks();

  vi.stubEnv('DATA_DIR', path.join(dir, 'data'));
  for (const key of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM']) {
    vi.stubEnv(key, '');
  }

  const { createUser, createWorkspace, getSystemDatabase } = await import(
    '@/lib/auth/system-database'
  );

  ownerId = createUser('owner@agency.test', 'hash');
  adminId = createUser('admin@instance.test', 'hash');
  getSystemDatabase().prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(adminId);

  workspaceId = createWorkspace('Agency', ownerId);
});

afterEach(async () => {
  const { closeSystemDatabase } = await import('@/lib/auth/system-database');
  closeSystemDatabase();
  vi.unstubAllEnvs();
  fs.rmSync(dir, { recursive: true, force: true });
});

function signedInAs(userId: string, email: string, isAdmin: boolean): void {
  mocks.requireAuth.mockResolvedValue({ userId, email, isAdmin, exp: 0 });
}

function request(body?: unknown): NextRequest {
  return { json: async () => body, headers: { get: () => null } } as unknown as NextRequest;
}

function params() {
  return { params: Promise.resolve({ workspaceId }) };
}

/** Own mode needs a host and an address alongside whatever the test is actually varying. */
const OWN_MODE = { mode: 'own', host: 'smtp.agency.test' } as const;

describe('workspace mail settings — display name', () => {
  beforeEach(() => {
    signedInAs(ownerId, 'owner@agency.test', false);
  });

  it('refuses a name carrying a line break', async () => {
    const { PUT } = await import('@/app/api/w/[workspaceId]/mail/route');
    const { readWorkspaceMailSettings } = await import('@/lib/mail/settings');

    for (const injected of [
      'Agency\r\nBcc: everyone@example.test',
      'Agency\nBcc: everyone@example.test',
      'Agency\rBcc: everyone@example.test',
      // Not a header break itself, but a NUL truncates the line at whatever layer copies it
      // into a C string, so what is sent stops matching what was reviewed.
      'Agency\u0000Bcc: everyone@example.test',
    ]) {
      const response = await PUT(request({ displayName: injected }), params());

      expect(response.status).toBe(400);
      // Refused rather than sanitised: nothing of the attempt is stored.
      expect(readWorkspaceMailSettings(workspaceId).displayName).toBeNull();
    }
  });

  it('accepts a name at the length cap and refuses one over it', async () => {
    const { PUT } = await import('@/app/api/w/[workspaceId]/mail/route');
    const { MAX_MAIL_DISPLAY_NAME } = await import('@/lib/api/mail-route');
    const { readWorkspaceMailSettings } = await import('@/lib/mail/settings');

    const atCap = 'A'.repeat(MAX_MAIL_DISPLAY_NAME);
    const overCap = 'A'.repeat(MAX_MAIL_DISPLAY_NAME + 1);

    const accepted = await PUT(request({ displayName: atCap }), params());
    expect(accepted.status).toBe(200);
    expect(readWorkspaceMailSettings(workspaceId).displayName).toBe(atCap);

    const refused = await PUT(request({ displayName: overCap }), params());
    expect(refused.status).toBe(400);
    expect(readWorkspaceMailSettings(workspaceId).displayName).toBe(atCap);
  });

  it('still accepts an ordinary agency name', async () => {
    const { PUT } = await import('@/app/api/w/[workspaceId]/mail/route');
    const { readWorkspaceMailSettings } = await import('@/lib/mail/settings');

    const response = await PUT(request({ displayName: 'Bright & Co. (Studio), Ltd' }), params());

    expect(response.status).toBe(200);
    expect(readWorkspaceMailSettings(workspaceId).displayName).toBe('Bright & Co. (Studio), Ltd');
  });

  it('lets a name be cleared', async () => {
    const { PUT } = await import('@/app/api/w/[workspaceId]/mail/route');
    const { readWorkspaceMailSettings } = await import('@/lib/mail/settings');

    await PUT(request({ displayName: 'Bright Agency' }), params());
    const cleared = await PUT(request({ displayName: null }), params());

    expect(cleared.status).toBe(200);
    expect(readWorkspaceMailSettings(workspaceId).displayName).toBeNull();
  });
});

describe('workspace mail settings — from address', () => {
  beforeEach(() => {
    signedInAs(ownerId, 'owner@agency.test', false);
  });

  it('refuses a From address carrying a line break', async () => {
    const { PUT } = await import('@/app/api/w/[workspaceId]/mail/route');
    const { readWorkspaceMailSettings } = await import('@/lib/mail/settings');

    const response = await PUT(
      request({ ...OWN_MODE, from: 'hello@agency.test>\r\nBcc: everyone@example.test' }),
      params()
    );

    expect(response.status).toBe(400);
    expect(readWorkspaceMailSettings(workspaceId).from).toBeNull();
  });

  it('still accepts both spellings of a real From address', async () => {
    const { PUT } = await import('@/app/api/w/[workspaceId]/mail/route');
    const { readWorkspaceMailSettings } = await import('@/lib/mail/settings');

    const bare = await PUT(request({ ...OWN_MODE, from: 'hello@agency.test' }), params());
    expect(bare.status).toBe(200);
    expect(readWorkspaceMailSettings(workspaceId).from).toBe('hello@agency.test');

    const named = await PUT(
      request({ ...OWN_MODE, from: 'Bright Agency <hello@agency.test>' }),
      params()
    );
    expect(named.status).toBe(200);
    expect(readWorkspaceMailSettings(workspaceId).from).toBe('Bright Agency <hello@agency.test>');
  });
});

describe('instance mail settings — from address', () => {
  beforeEach(() => {
    signedInAs(adminId, 'admin@instance.test', true);
  });

  it('refuses a From address carrying a line break', async () => {
    const { PUT } = await import('@/app/api/admin/mail/route');
    const { readInstanceMailSettings } = await import('@/lib/mail/settings');

    const response = await PUT(
      request({ host: 'smtp.instance.test', from: 'noreply@instance.test\nBcc: everyone@example.test' })
    );

    expect(response.status).toBe(400);
    expect(readInstanceMailSettings().from).toBeNull();
  });

  it('still accepts an ordinary instance From address', async () => {
    const { PUT } = await import('@/app/api/admin/mail/route');
    const { readInstanceMailSettings } = await import('@/lib/mail/settings');

    const response = await PUT(
      request({ host: 'smtp.instance.test', from: 'OSW Studio <noreply@instance.test>' })
    );

    expect(response.status).toBe(200);
    expect(readInstanceMailSettings().from).toBe('OSW Studio <noreply@instance.test>');
  });
});
