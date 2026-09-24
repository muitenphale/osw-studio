import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

/**
 * A grant recorded only `last_used_at`: a person could see a connector had been active but not
 * what it did. File edits leave checkpoints; SQL, backend and deployment calls left nothing, so a
 * connector could not be reviewed after the fact.
 */

let dir: string; let workspaceId: string; let userId: string;
const TOKEN = 'dev-token-for-tests';

async function seed() {
  const { createUser, createWorkspace } = await import('@/lib/auth/system-database');
  userId = createUser('agent@a.test', 'hash');
  workspaceId = createWorkspace('Agents', userId);
  const { getWorkspaceAdapter } = await import('@/lib/vfs/adapters/server');
  const adapter = getWorkspaceAdapter(workspaceId);
  await adapter.init();
  const now = new Date();
  await adapter.createProject({ id: 'p1', name: 'Site', createdAt: now, updatedAt: now, settings: { runtime: 'static' } });
}

async function callTool(name: string, args: Record<string, unknown>) {
  const { POST } = await import('@/app/api/mcp/route');
  const headers = new Headers({
    'content-type': 'application/json', accept: 'application/json, text/event-stream',
    'mcp-protocol-version': '2025-06-18', authorization: `Bearer ${TOKEN}`,
  });
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });
  const res = await POST(new Request('http://localhost/api/mcp', { method: 'POST', headers, body }) as unknown as NextRequest);
  await res.text();
}

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'osws-activity-'));
  vi.resetModules();
  vi.stubEnv('DATA_DIR', dir);
  vi.stubEnv('MCP_ENABLED', 'true');
  vi.stubEnv('MCP_DEV_TOKEN', TOKEN);
  await seed();
  vi.stubEnv('MCP_DEV_USER_ID', userId);
  vi.stubEnv('MCP_DEV_WORKSPACE_ID', workspaceId);
});

afterEach(async () => {
  const { closeWorkspaceAdapter } = await import('@/lib/vfs/adapters/server');
  const { closeSystemDatabase } = await import('@/lib/auth/system-database');
  closeWorkspaceAdapter(workspaceId); closeSystemDatabase();
  vi.unstubAllEnvs();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('what a connector did', () => {
  it('records each call, its target, and whether it was refused', async () => {
    await callTool('projects_list', { workspaceId });
    await callTool('bash', { workspaceId, projectId: 'p1', command: 'ls /' });
    await callTool('projects_get', { workspaceId, projectId: 'no-such-project' });

    const { listMcpActivity } = await import('@/lib/mcp/store');
    const rows = listMcpActivity('dev', userId, 10);

    expect(rows.map(r => r.tool)).toEqual(['projects_get', 'bash', 'projects_list']);
    expect(rows[0]).toMatchObject({ tool: 'projects_get', target: 'no-such-project', refused: 1 });
    expect(rows[1]).toMatchObject({ tool: 'bash', target: 'p1', refused: 0 });
  });

  it('caps an oversized target instead of storing it whole', async () => {
    // `target` is the projectId or deploymentId the caller supplied, so its length is theirs to
    // choose. An id is a UUID; anything longer is only ever padding a row.
    await callTool('projects_get', { workspaceId, projectId: 'x'.repeat(5000) });

    const { listMcpActivity } = await import('@/lib/mcp/store');
    const [row] = listMcpActivity('dev', userId, 10);

    expect(row.tool).toBe('projects_get');
    expect((row.target ?? '').length).toBeLessThanOrEqual(80);
  });

  it('stores no arguments, only that the call happened', async () => {
    await callTool('bash', { workspaceId, projectId: 'p1', command: 'cat /secret-looking-thing' });

    const { listMcpActivity } = await import('@/lib/mcp/store');
    const [row] = listMcpActivity('dev', userId, 10);

    expect(JSON.stringify(row)).not.toContain('secret-looking-thing');
  });

  it('shows the record in the account\'s grant list', async () => {
    // A grant the pane can read, rather than the dev token, which has no row.
    const store = await import('@/lib/mcp/store');
    const client = store.registerMcpClient('Claude', ['http://localhost/cb']);
    store.createAuthorizationCode({
      clientId: client.client_id, userId, workspaceId,
      scopes: ['projects:read'], codeChallenge: 'c', redirectUri: 'http://localhost/cb',
    });
    const grantId = store.listGrantsForUser(userId)[0].id;
    store.recordMcpActivity({ grantId, userId, workspaceId, tool: 'deployments_publish', target: 'd1' });

    vi.doMock('@/lib/auth/session', () => ({ requireAuth: async () => ({ userId, email: 'agent@a.test' }) }));
    const { GET } = await import('@/app/api/mcp/grants/route');
    const body = await (await GET()).json();

    expect(body.grants[0].recentActivity[0]).toMatchObject({ tool: 'deployments_publish', target: 'd1', refused: false });
  });
});
