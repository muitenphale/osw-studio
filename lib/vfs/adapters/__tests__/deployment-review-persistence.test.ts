import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { SQLiteAdapter } from '@/lib/vfs/adapters/sqlite-adapter';
import type { Deployment } from '@/lib/vfs/types';

/**
 * Review mode is a settings group on the deployment record, alongside analytics, seo and
 * compliance, and has to survive a write/read cycle the same way they do. It carries the bcrypt
 * hash of the review password, so a round trip that drops it is a silently unlocked review site.
 */

// Marked 'server-only' for the bundler; the guard has to be neutralised to load it under vitest.
vi.mock('server-only', () => ({}));
vi.mock('@/lib/utils', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

let dir: string;
let adapter: SQLiteAdapter;

const baseDeployment = (id: string): Deployment => ({
  id,
  projectId: 'p1',
  name: 'Site',
  enabled: true,
  underConstruction: false,
  headScripts: [],
  bodyScripts: [],
  cdnLinks: [],
  analytics: { enabled: false, provider: 'builtin', privacyMode: true },
  seo: {},
  compliance: {
    enabled: false, bannerPosition: 'bottom', bannerStyle: 'bar', message: '',
    acceptButtonText: 'Accept', declineButtonText: 'Decline', mode: 'opt-in', blockAnalytics: false,
  },
  settingsVersion: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
});

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'osws-review-'));
  adapter = new SQLiteAdapter(path.join(dir, 'workspace', 'osws.sqlite'));
  await adapter.init();

  await adapter.createProject({
    id: 'p1', name: 'Reviewed', createdAt: new Date(), updatedAt: new Date(), settings: { runtime: 'static' },
  } as never);
});

afterEach(async () => {
  await adapter.close?.();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('deployment review config persistence', () => {
  it('round-trips a review block through create and read', async () => {
    await adapter.createDeployment?.({
      ...baseDeployment('d1'),
      review: {
        enabled: true,
        passwordHash: '$2b$10$hashhashhashhash',
        expiresAt: '2030-01-01T00:00:00.000Z',
        notifyByEmail: true,
      },
    });

    const stored = await adapter.getDeployment?.('d1');

    expect(stored?.review).toEqual({
      enabled: true,
      passwordHash: '$2b$10$hashhashhashhash',
      expiresAt: '2030-01-01T00:00:00.000Z',
      notifyByEmail: true,
    });
  });

  it('round-trips a review block through update', async () => {
    await adapter.createDeployment?.(baseDeployment('d2'));

    await adapter.updateDeployment?.({
      ...baseDeployment('d2'),
      review: { enabled: true, passwordHash: '$2b$10$updatedhash' },
    });

    const stored = await adapter.getDeployment?.('d2');
    expect(stored?.review?.enabled).toBe(true);
    expect(stored?.review?.passwordHash).toBe('$2b$10$updatedhash');
  });

  it('reads back a deployment written without a review block as review disabled', async () => {
    await adapter.createDeployment?.(baseDeployment('d3'));

    const stored = await adapter.getDeployment?.('d3');

    expect(stored?.review).toEqual({ enabled: false });
    expect(stored?.review?.passwordHash).toBeUndefined();
  });

  it('reads back a row that predates the review column as review disabled', async () => {
    await adapter.createDeployment?.(baseDeployment('d4'));
    // A row written before the column existed carries the column default rather than a config.
    const db = (adapter as unknown as { getDB(): { prepare(sql: string): { run(...a: unknown[]): void } } }).getDB();
    db.prepare(`UPDATE deployments SET review = '{}' WHERE id = ?`).run('d4');

    const stored = await adapter.getDeployment?.('d4');

    expect(stored?.review).toEqual({ enabled: false });
  });

  it('re-runs the review migration without failing on a database that already has the column', async () => {
    // Stands in for an install that reaches the migration with the column already present: the
    // ALTER is unguarded SQLite DDL, so without the PRAGMA check this is "duplicate column name"
    // and init throws for good.
    await adapter.createDeployment?.({
      ...baseDeployment('d6'),
      review: { enabled: true, passwordHash: '$2b$10$survivinghash' },
    });
    const db = (adapter as unknown as { getDB(): { prepare(sql: string): { run(...a: unknown[]): void } } }).getDB();
    db.prepare(`DELETE FROM _migrations WHERE id = ?`).run('add_deployment_review_v11');
    await adapter.close?.();

    const reopened = new SQLiteAdapter(path.join(dir, 'workspace', 'osws.sqlite'));
    await reopened.init();
    const stored = await reopened.getDeployment?.('d6');
    await reopened.close?.();

    expect(stored?.review?.passwordHash).toBe('$2b$10$survivinghash');
  });

  it('keeps the review block on deployments listed for a project', async () => {
    await adapter.createDeployment?.({
      ...baseDeployment('d5'),
      review: { enabled: true, passwordHash: '$2b$10$listhash' },
    });

    const listed = await adapter.listDeploymentsByProject?.('p1');
    const found = listed?.find((d) => d.id === 'd5');
    expect(found?.review?.passwordHash).toBe('$2b$10$listhash');
  });
});
