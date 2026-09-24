import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { NextRequest } from 'next/server';
import { SQLiteAdapter } from '@/lib/vfs/adapters/sqlite-adapter';

/**
 * GET /sync/backend-features strips secret values, so a later POST of that payload would write
 * null over a value set on the server (MCP `backend_upsert` included) unless the route keeps it.
 */

const mocks = vi.hoisted(() => ({ getWorkspaceContext: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/api/workspace-context', () => ({ getWorkspaceContext: mocks.getWorkspaceContext }));
vi.mock('@/lib/utils', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

let dir: string;
let adapter: SQLiteAdapter;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'osws-backend-secrets-'));
  adapter = new SQLiteAdapter(path.join(dir, 'osws.sqlite'));
  await adapter.init();
  await adapter.createProject({
    id: 'p1', name: 'P', createdAt: new Date(), updatedAt: new Date(), settings: {},
  } as never);
  mocks.getWorkspaceContext.mockResolvedValue({ adapter, workspaceId: 'w1', session: { userId: 'u1' } });
});

afterEach(async () => {
  await adapter.close?.();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('POST /sync/backend-features — secret values', () => {
  it('keeps the stored value when the payload omits it', async () => {
    const now = new Date();
    await adapter.createSecret?.({
      id: 's1', projectId: 'p1', name: 'STRIPE', hasValue: true, value: 'sk-live-secret',
      createdAt: now, updatedAt: now,
    });

    const { GET, POST } = await import('../route');
    const params = { params: Promise.resolve({ workspaceId: 'w1', projectId: 'p1' }) };

    const pulled = await (await GET(new NextRequest('http://localhost/api/w/w1/sync/backend-features/p1'), params)).json();
    expect(pulled.secrets[0]).toMatchObject({ id: 's1', name: 'STRIPE', hasValue: true });
    expect(pulled.secrets[0].value).toBeUndefined();

    const response = await POST(
      new NextRequest('http://localhost/api/w/w1/sync/backend-features/p1', {
        method: 'POST',
        body: JSON.stringify(pulled),
      }),
      params,
    );
    expect(response.status).toBe(200);

    const stored = (await adapter.listSecrets?.('p1')) ?? [];
    expect(stored).toEqual([expect.objectContaining({ id: 's1', name: 'STRIPE', value: 'sk-live-secret' })]);
  });
});
