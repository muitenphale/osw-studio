import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/utils', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

/**
 * The SQL editor runs whatever the person types against a deployment's runtime database, and it
 * is reachable by an **editor**. `edge_functions` holds the code the invocation route executes and
 * `secrets` is what the executor decrypts for it, so a write to either from here is code execution
 * and secret disclosure by someone who was only granted edit rights.
 */

const mocks = vi.hoisted(() => ({ getWorkspaceContext: vi.fn() }));
vi.mock('@/lib/api/workspace-context', () => ({ getWorkspaceContext: mocks.getWorkspaceContext }));

let dir: string;
let db: import('@/lib/vfs/adapters/runtime-database').RuntimeDatabase;

const params = Promise.resolve({ workspaceId: 'w1', id: 'd1' });

async function query(sql: string) {
  const { POST } = await import('../query/route');
  const request = new Request('http://localhost/q', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sql }),
  }) as unknown as NextRequest;
  const res = await POST(request, { params });
  return { status: res.status, body: await res.json() };
}

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'osws-editorsql-'));
  vi.stubEnv('DEPLOYMENTS_DIR', dir);
  vi.resetModules();
  const { RuntimeDatabase } = await import('@/lib/vfs/adapters/runtime-database');
  db = new RuntimeDatabase('d1');
  db.init();
  db.createFunction({ id: 'real', name: 'hello', code: 'return 1', method: 'GET', enabled: true, timeoutMs: 5000 } as never);
  mocks.getWorkspaceContext.mockResolvedValue({
    adapter: {
      getDeployment: async () => ({ id: 'd1', databaseEnabled: true }),
      getDeploymentDatabaseForAnalytics: () => db,
    },
  });
});

afterEach(() => {
  db.close();
  vi.unstubAllEnvs();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('the SQL editor and the deployment machinery', () => {
  it('refuses a write to the table holding executable function code', async () => {
    const out = await query("UPDATE edge_functions SET code = 'return Response.json(secrets)'");

    expect(out.body.error).toMatch(/system table/i);
    expect(db.getFunctionByName('hello')?.code).toBe('return 1');
  });

  it('refuses a write to the secrets table', async () => {
    const out = await query("INSERT INTO secrets (id,name,encrypted_value,iv,auth_tag,created_at,updated_at) VALUES ('x','x','','','','','')");

    expect(out.body.error).toMatch(/system table/i);
    expect(db.listSecrets()).toEqual([]);
  });

  it('still runs ordinary SQL on the deployment\'s own tables', async () => {
    expect((await query('CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT)')).status).toBe(200);
    expect((await query("INSERT INTO notes (body) VALUES ('hi')")).status).toBe(200);
    const out = await query('SELECT body FROM notes');
    expect(out.body.rows).toEqual([['hi']]);
  });

  it('still allows reading a system table', async () => {
    const out = await query('SELECT name FROM edge_functions');
    expect(out.status).toBe(200);
    expect(out.body.rows).toEqual([['hello']]);
  });
});
