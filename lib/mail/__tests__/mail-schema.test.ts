import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * The email layer is split in two halves that ship independently: composition writes finished
 * messages into an outbox, delivery drains it over SMTP. Both halves read the same three tables in
 * system.sqlite, so those tables have to exist on a fresh install before either half is written.
 */

vi.mock('server-only', () => ({}));

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'osws-mail-schema-'));
  vi.resetModules();
  vi.stubEnv('DATA_DIR', path.join(dir, 'data'));
});

afterEach(async () => {
  const { closeSystemDatabase } = await import('@/lib/auth/system-database');
  closeSystemDatabase();
  vi.unstubAllEnvs();
  fs.rmSync(dir, { recursive: true, force: true });
});

interface ColumnInfo {
  name: string;
  notnull: number;
  pk: number;
}

async function columns(table: string): Promise<ColumnInfo[]> {
  const { getSystemDatabase } = await import('@/lib/auth/system-database');
  return getSystemDatabase().prepare(`PRAGMA table_info(${table})`).all() as ColumnInfo[];
}

describe('mail schema in a fresh system database', () => {
  it('creates instance_settings as a key/value store', async () => {
    const cols = await columns('instance_settings');

    expect(cols.map((c) => c.name)).toEqual(['key', 'value', 'updated_at']);
    expect(cols.find((c) => c.name === 'key')?.pk).toBe(1);
  });

  it('creates workspace_mail with the fields both mail modes need', async () => {
    const cols = await columns('workspace_mail');

    expect(cols.map((c) => c.name)).toEqual([
      'workspace_id',
      'enabled',
      'mode',
      'display_name',
      'smtp_host',
      'smtp_port',
      'smtp_secure',
      'smtp_user',
      'smtp_password',
      'from_address',
      'updated_at',
    ]);
    expect(cols.find((c) => c.name === 'workspace_id')?.pk).toBe(1);
  });

  it('creates email_outbox with a nullable workspace_id', async () => {
    // NULL means the instance's own mail settings send the row — an admin test send has no
    // workspace behind it. A NOT NULL column here would force a sentinel workspace id.
    const cols = await columns('email_outbox');

    expect(cols.map((c) => c.name)).toEqual([
      'id',
      'workspace_id',
      'to_email',
      'subject',
      'body_text',
      'body_html',
      'created_at',
      'delivered',
      'delivered_at',
      'attempts',
      'last_attempted_at',
    ]);
    expect(cols.find((c) => c.name === 'workspace_id')?.notnull).toBe(0);
  });

  it('indexes email_outbox for the pending scan and for per-workspace lookup', async () => {
    const { getSystemDatabase } = await import('@/lib/auth/system-database');
    const indexes = getSystemDatabase()
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'email_outbox'`)
      .all() as Array<{ name: string }>;

    expect(indexes.map((i) => i.name)).toEqual(
      expect.arrayContaining(['idx_email_outbox_pending', 'idx_email_outbox_workspace'])
    );
  });
});
