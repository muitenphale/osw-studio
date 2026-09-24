import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { NextRequest } from 'next/server';

/**
 * The MCP endpoint end to end: a real system database with one account and one workspace, a
 * real workspace database with one project, and JSON-RPC over the route. The bearer gate and
 * the role check are the parts the tools rely on, so the refusals are asserted as carefully as
 * the happy path.
 */

vi.mock('server-only', () => ({}));

let dir: string;
let workspaceId: string;
let otherWorkspaceId: string;
let userId: string;
const TOKEN = 'dev-token-for-tests';

async function seed() {
  const { createUser, createWorkspace } = await import('@/lib/auth/system-database');
  userId = createUser('agent@a.test', 'hash');
  workspaceId = createWorkspace('Agents', userId);
  // A real workspace, well formed and existing, that this account was never granted.
  otherWorkspaceId = createWorkspace('Somebody else', createUser('other@a.test', 'hash'));
  const { getWorkspaceAdapter } = await import('@/lib/vfs/adapters/server');
  const adapter = getWorkspaceAdapter(workspaceId);
  await adapter.init();
  const now = new Date();
  await adapter.createProject({ id: 'p1', name: 'Site', createdAt: now, updatedAt: now, settings: { runtime: 'static' } });
  await adapter.createFile({
    id: 'f1', projectId: 'p1', path: '/index.html', name: 'index.html', type: 'html', content: '<h1>Hi</h1>',
    mimeType: 'text/html', size: 11, createdAt: now, updatedAt: now, metadata: {},
  });
}

type Rpc = { jsonrpc: '2.0'; id?: number; method: string; params?: unknown };

async function rpc(body: Rpc, token: string | null = TOKEN): Promise<{ status: number; result?: any; error?: any }> {
  const { POST } = await import('@/app/api/mcp/route');
  const headers = new Headers({
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    'mcp-protocol-version': '2025-06-18',
  });
  if (token) headers.set('authorization', `Bearer ${token}`);
  const request = new Request('http://localhost/api/mcp', { method: 'POST', headers, body: JSON.stringify(body) });
  const res = await POST(request as unknown as NextRequest);
  const text = await res.text();
  if (!res.ok) return { status: res.status, error: text };
  // Streamable HTTP answers as SSE or JSON; take the first JSON-RPC message either way.
  const line = text.split('\n').find(l => l.startsWith('data: '));
  const message = JSON.parse(line ? line.slice(6) : text);
  return { status: res.status, result: message.result, error: message.error };
}

async function callTool(name: string, args: Record<string, unknown>, token: string | null = TOKEN) {
  const out = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, token);
  const content = out.result?.content?.[0]?.text as string | undefined;
  return { ...out, text: content, isError: out.result?.isError === true };
}

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'osws-mcp-'));
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
  closeWorkspaceAdapter(workspaceId);
  closeWorkspaceAdapter(otherWorkspaceId);
  closeSystemDatabase();
  vi.unstubAllEnvs();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('POST /api/mcp', () => {
  it('does not exist unless MCP_ENABLED is set', async () => {
    vi.stubEnv('MCP_ENABLED', 'false');
    const out = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect(out.status).toBe(404);
  });

  it('challenges a request with no bearer token', async () => {
    const { POST } = await import('@/app/api/mcp/route');
    const res = await POST(new Request('http://localhost/api/mcp', { method: 'POST', body: '{}' }) as unknown as NextRequest);
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toMatch(/^Bearer/);
  });

  it('points the challenge at this instance\'s discovery document', async () => {
    // Without `resource_metadata` a client has to guess a well-known path to find the
    // authorization server. The host comes from the request, so an instance reached on any
    // hostname names itself rather than a build-time default.
    const { POST } = await import('@/app/api/mcp/route');
    const res = await POST(new Request('http://studio.example.test/api/mcp', { method: 'POST', body: '{}' }) as unknown as NextRequest);

    expect(res.headers.get('www-authenticate')).toMatch(
      /resource_metadata="http:\/\/studio\.example\.test\/\.well-known\/oauth-protected-resource\/api\/mcp"/,
    );
  });

  it('rejects a wrong token', async () => {
    const out = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, 'nope');
    expect(out.status).toBe(401);
  });

  it('says which instance and workspace it is, so two connectors can be told apart', async () => {
    // Every OSW Studio answers as `osw-studio`: hosted, server mode and desktop alike. Without
    // the title a client's connector list shows identical entries.
    const out = await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {
      protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'probe', version: '1' },
    } });

    expect(out.result.serverInfo.name).toBe('osw-studio');
    expect(out.result.serverInfo.title).toMatch(/Development workspace/);
    expect(out.result.serverInfo.title).toMatch(/localhost/);
  });

  it('lists every tool, each naming the scope it needs', async () => {
    const out = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    const tools = out.result.tools as { name: string; description: string }[];

    expect(tools.map(t => t.name).sort()).toEqual([
      'agent_cancel', 'agent_run', 'agent_status', 'analytics_overview',
      'backend_delete', 'backend_list', 'backend_upsert', 'bash',
      'deployments_create', 'deployments_list', 'deployments_publish',
      'deployments_sql', 'deployments_unpublish', 'deployments_update',
      'deployments_url',
      'projects_create', 'projects_get', 'projects_list',
    ]);
    // A client that is refused needs to know which scope was missing, so each description says.
    const scopeless = tools.filter(t => !/[Nn]eeds [a-z:]+/.test(t.description));
    expect(scopeless.map(t => t.name)).toEqual([]);
  });

  it('lists the projects of a workspace the account can reach', async () => {
    const out = await callTool('projects_list', { workspaceId });
    expect(out.isError).toBe(false);
    expect(JSON.parse(out.text!)).toEqual([expect.objectContaining({ id: 'p1', name: 'Site', runtime: 'static' })]);
  });

  it('refuses a workspace outside the grant even for an instance admin', async () => {
    // verifyWorkspaceAccess waves instance admins into every workspace, so the grant's own
    // workspace binding is the only thing keeping an admin's token inside the workspace the
    // consent screen named. A live run reached another workspace before this existed.
    const { updateUser } = await import('@/lib/auth/system-database');
    updateUser(userId, { is_admin: 1 });

    const out = await callTool('projects_list', { workspaceId: otherWorkspaceId });

    expect(out.isError).toBe(true);
    expect(out.text).toMatch(new RegExp(`granted workspace ${workspaceId}`));
  });

  it('refuses a workspace the account was never granted', async () => {
    // A well-formed id of a workspace that really exists, so the refusal can only come from the
    // access check. An id of the wrong shape is refused by the adapter instead, which is how an
    // earlier version of this test passed with the access check removed.
    // The grant names this workspace, so the refusal can only come from the access check.
    vi.stubEnv('MCP_DEV_WORKSPACE_ID', otherWorkspaceId);

    const out = await callTool('projects_list', { workspaceId: otherWorkspaceId });

    expect(out.isError).toBe(true);
    expect(out.text).toMatch(/access denied/i);
  });



  it('lets a granted member in at their own role', async () => {
    const { createUser, grantWorkspaceAccess } = await import('@/lib/auth/system-database');
    const viewer = createUser('viewer@a.test', 'hash');
    grantWorkspaceAccess(viewer, workspaceId, 'viewer');
    vi.stubEnv('MCP_DEV_USER_ID', viewer);
    vi.stubEnv('MCP_DEV_WORKSPACE_ID', workspaceId);

    // A viewer may read.
    expect((await callTool('projects_list', { workspaceId })).isError).toBe(false);
    // And may not write: projects:write needs editor.
    const write = await callTool('bash', { workspaceId, projectId: 'p1', command: "cat > /x.html << 'EOF'\nx\nEOF" });
    expect(write.isError).toBe(true);
    expect(write.text).toMatch(/permission/i);
  });

  it('reads a file through bash, as the in-app agent does', async () => {
    const out = await callTool('bash', { workspaceId, projectId: 'p1', command: 'cat /index.html' });

    expect(out.isError).toBe(false);
    expect(out.text).toContain('<h1>Hi</h1>');
  });

  it('writes a file through bash, and the next read returns it', async () => {
    const write = await callTool('bash', {
      workspaceId, projectId: 'p1', command: "cat > /about.html << 'EOF'\n<p>About</p>\nEOF",
    });
    expect(write.isError).toBe(false);

    const read = await callTool('bash', { workspaceId, projectId: 'p1', command: 'cat /about.html' });
    expect(read.text).toContain('<p>About</p>');
  });

  it('edits an existing file with ss', async () => {
    const edit = await callTool('bash', {
      workspaceId, projectId: 'p1', command: "ss /index.html << 'EOF'\n<h1>Hi</h1>\n=======\n<h1>Edited</h1>\nEOF",
    });
    expect(edit.isError).toBe(false);

    const read = await callTool('bash', { workspaceId, projectId: 'p1', command: 'cat /index.html' });
    expect(read.text).toContain('<h1>Edited</h1>');
  });

  it('lists files through bash', async () => {
    const out = await callTool('bash', { workspaceId, projectId: 'p1', command: 'ls /' });

    expect(out.isError).toBe(false);
    expect(out.text).toContain('index.html');
  });

  it('refuses a writing command when the grant is read-only, and the file is untouched', async () => {
    vi.stubEnv('MCP_DEV_SCOPES', 'projects:read');

    const write = await callTool('bash', {
      workspaceId, projectId: 'p1', command: "cat > /sneaky.html << 'EOF'\nx\nEOF",
    });
    expect(write.isError).toBe(true);
    expect(write.text).toMatch(/projects:write/);

    const read = await callTool('bash', { workspaceId, projectId: 'p1', command: 'ls /' });
    expect(read.text).not.toContain('sneaky.html');
  });

  it('refuses a relative-path redirect on a read-only grant', async () => {
    // A redirect is a write whether or not its target is absolute. This is refused by the scope
    // check, before the shell sees it; the shell's read-only mode is the second line behind that.
    vi.stubEnv('MCP_DEV_SCOPES', 'projects:read');

    const out = await callTool('bash', { workspaceId, projectId: 'p1', command: 'echo sneaky > about.html' });

    const listing = await callTool('bash', { workspaceId, projectId: 'p1', command: 'ls /' });
    expect(listing.text).not.toContain('about.html');
    expect(out.text).toMatch(/read-only|not granted|not permitted|denied/i);
  });

  it('creates a project from a template, with the template\'s runtime and files', async () => {
    const out = await callTool('projects_create', { workspaceId, name: 'From MCP', template: 'handlebars-starter' });

    expect(out.isError).toBe(false);
    const created = JSON.parse(out.text!);
    expect(created).toMatchObject({ name: 'From MCP', runtime: 'handlebars', template: 'handlebars-starter' });
    // The template's files are really there, not just a project row.
    expect(created.files).toContain('/index.html');
    expect(created.files.length).toBeGreaterThan(1);

  });

  it('stores the template\'s runtime on the project', async () => {
    // A non-Handlebars template on purpose: `projects_list` falls back to 'handlebars' when a
    // project has no runtime, so a Handlebars template cannot show whether it was stored at all.
    const out = await callTool('projects_create', { workspaceId, name: 'Blank one', template: 'blank' });
    const created = JSON.parse(out.text!);
    expect(created.runtime).toBe('static');

    const listed = JSON.parse((await callTool('projects_list', { workspaceId })).text!);
    expect(listed.find((p: { id: string }) => p.id === created.id)).toMatchObject({ runtime: 'static' });
  });

  it('refuses an unknown template and says which exist', async () => {
    const out = await callTool('projects_create', { workspaceId, name: 'X', template: 'not-a-template' });

    expect(out.isError).toBe(true);
    expect(out.text).toMatch(/handlebars-starter/);
  });

  it('refuses to create a project on a read-only grant', async () => {
    vi.stubEnv('MCP_DEV_SCOPES', 'projects:read');

    const out = await callTool('projects_create', { workspaceId, name: 'Nope', template: 'blank' });

    expect(out.isError).toBe(true);
    expect(out.text).toMatch(/projects:write/);
  });

  it('tells an open tab that a created project needs pulling, so it is not left server-only', async () => {
    // Without this the project sits in Server Sync as "server only" and every later change waits
    // for a manual pull. The tab hears it on the account's own channel.
    const { eventBus } = await import('@/lib/server-generate/singleton');
    const seen: { event: string; data: Record<string, unknown> }[] = [];
    const listener = (e: { event: string; data: Record<string, unknown> }) => seen.push(e);
    eventBus.addListener(userId, listener);

    const out = await callTool('projects_create', { workspaceId, name: 'Fresh', template: 'blank' });
    const created = JSON.parse(out.text!);

    eventBus.removeListener(userId, listener);
    const change = seen.find(e => e.event === 'mcp_project_changed');
    expect(change?.data).toMatchObject({ projectId: created.id, projectName: 'Fresh', created: true });
  });

  it('tells an open tab about a file written through bash, but says nothing for a read', async () => {
    const { eventBus } = await import('@/lib/server-generate/singleton');
    const seen: string[] = [];
    const listener = (e: { event: string }) => seen.push(e.event);
    eventBus.addListener(userId, listener);

    await callTool('bash', { workspaceId, projectId: 'p1', command: 'cat /index.html' });
    expect(seen).not.toContain('mcp_project_changed');

    await callTool('bash', { workspaceId, projectId: 'p1', command: "cat > /new.html << 'EOF'\nx\nEOF" });
    eventBus.removeListener(userId, listener);

    expect(seen).toContain('mcp_project_changed');
  });

  it('refuses bash against a project that is not there', async () => {
    const out = await callTool('bash', { workspaceId, projectId: 'nope', command: 'ls /' });

    expect(out.isError).toBe(true);
  });

  it('refuses to start a task when no workspace tab is attached to take it', async () => {
    // The provider key lives in the browser. With nothing listening the request has nowhere to
    // land, so the tool says so rather than starting something that would stall.
    const out = await callTool('agent_run', { workspaceId, projectId: 'p1', prompt: 'change the heading' });

    expect(out.isError).toBe(true);
    expect(out.text).toMatch(/tab is open/i);
  });

  it('does not read a task belonging to another account', async () => {
    const { taskManager } = await import('@/lib/server-generate/singleton');
    await taskManager.initialize();
    const theirs = taskManager.createTask('p1', 'someone-else', '', workspaceId);

    const out = await callTool('agent_status', { workspaceId, taskId: theirs });

    expect(out.isError).toBe(true);
    expect(out.text).toMatch(/No task/);
  });

  it('creates an unpublished deployment and turns analytics on without publishing it', async () => {
    const created = JSON.parse((await callTool('deployments_create', {
      workspaceId, projectId: 'p1', name: 'Live',
    })).text!);
    expect(created).toMatchObject({ name: 'Live', projectId: 'p1', published: false });

    const updated = JSON.parse((await callTool('deployments_update', {
      workspaceId, deploymentId: created.id, analyticsEnabled: true,
    })).text!);
    expect(updated).toMatchObject({ id: created.id, published: false, analyticsEnabled: true });

    const listed = JSON.parse((await callTool('deployments_list', { workspaceId })).text!);
    expect(listed).toEqual([expect.objectContaining({
      id: created.id, published: false, analyticsEnabled: true, databaseEnabled: false,
    })]);
  });

  it('lists projects without reading their thumbnails, and keeps its shape', async () => {
    // The projects table is mostly base64 `preview_image`: measured at 2.0MB of thumbnails against
    // 8.4KB of metadata on a real workspace, and this tool keeps four fields per project and
    // discards the rest. Reading the rows whole cost 2.77MB per call.
    const { getWorkspaceAdapter } = await import('@/lib/vfs/adapters/server');
    const adapter = getWorkspaceAdapter(workspaceId);
    const newest = new Date(Date.now() + 60_000);
    await adapter.createProject({
      id: 'p2', name: 'Thumbnailed', createdAt: newest, updatedAt: newest,
      settings: { runtime: 'react' }, previewImage: 'data:image/png;base64,' + 'A'.repeat(50_000),
    } as never);

    const out = await callTool('projects_list', { workspaceId });
    const listed = JSON.parse(out.text!);

    expect(out.isError).toBe(false);
    // Still a bare array: wrapping it would break every client that reads this as a list.
    expect(Array.isArray(listed)).toBe(true);
    // Newest first, four fields, and the runtime read through the same normalisation as before.
    expect(listed[0]).toEqual({
      id: 'p2', name: 'Thumbnailed', runtime: 'react', updatedAt: newest.toISOString(),
    });
    expect(Object.keys(listed[0]).sort()).toEqual(['id', 'name', 'runtime', 'updatedAt']);
    // The thumbnail never reaches the response.
    expect(out.text).not.toContain('AAAA');
    // A project whose settings name a runtime still reports it; the fallback covers the rest.
    expect(listed.find((p: { id: string }) => p.id === 'p1')).toMatchObject({ runtime: 'static' });
  });

  it('accepts a number a client marshalled as a string', async () => {
    // Claude Code sent `limit: "3"` for an argument typed as a number, and the call was refused
    // before it reached the tool. Booleans stay strict: "false" must not read as true.
    const out = await callTool('projects_list', { workspaceId, limit: '1' as unknown as number });

    expect(out.isError).toBe(false);
    expect(JSON.parse(out.text!)).toHaveLength(1);
  });

  it('caps a very long project list rather than returning it whole', async () => {
    const { getWorkspaceAdapter } = await import('@/lib/vfs/adapters/server');
    const adapter = getWorkspaceAdapter(workspaceId);
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      await adapter.createProject({ id: `bulk${i}`, name: `Bulk ${i}`, createdAt: now, updatedAt: now, settings: {} } as never);
    }

    const out = await callTool('projects_list', { workspaceId, limit: 5 });
    const listed = JSON.parse(out.text!);

    expect(listed).toHaveLength(5);
  });

  it('does not let a read-only grant write through a pipe', async () => {
    // The gate reads the command the shell is about to run. A pipeline is several commands to the
    // shell, so a write in a later stage reached the VFS under a grant that carries only
    // `projects:read`, and nothing announced the change because it did not look like a write.
    vi.stubEnv('MCP_DEV_SCOPES', 'projects:read');

    const out = await callTool('bash', { workspaceId, projectId: 'p1', command: 'ls / | rm /index.html' });

    const { getWorkspaceAdapter } = await import('@/lib/vfs/adapters/server');
    const survivors = (await getWorkspaceAdapter(workspaceId).listFiles('p1')).map(f => f.path);
    expect(survivors).toContain('/index.html');
    expect(out.text).toMatch(/read-only|not granted/i);
  });

  it('refuses to unpublish a deployment that is not in the workspace', async () => {
    const out = await callTool('deployments_unpublish', { workspaceId, deploymentId: 'nope' });

    expect(out.isError).toBe(true);
    expect(out.text).toMatch(/not found/i);
  });

  it('runs SQL on a deployment only after the database is enabled', async () => {
    const created = JSON.parse((await callTool('deployments_create', {
      workspaceId, projectId: 'p1', name: 'Data',
    })).text!);

    const refusedSql = await callTool('deployments_sql', {
      workspaceId, deploymentId: created.id, sql: 'CREATE TABLE items (id TEXT)',
    });
    expect(refusedSql.isError).toBe(true);
    expect(refusedSql.text).toMatch(/databaseEnabled:true/);

    await callTool('deployments_update', { workspaceId, deploymentId: created.id, databaseEnabled: true });
    const create = await callTool('deployments_sql', {
      workspaceId, deploymentId: created.id, sql: 'CREATE TABLE items (id TEXT)',
    });
    expect(create.isError).toBe(false);

    await callTool('deployments_sql', {
      workspaceId, deploymentId: created.id, sql: "INSERT INTO items (id) VALUES ('a')",
    });
    const select = await callTool('deployments_sql', {
      workspaceId, deploymentId: created.id, sql: 'SELECT id FROM items',
    });
    expect(JSON.parse(select.text!)).toMatchObject({ rows: [{ id: 'a' }] });
  });

  it('creates, lists and deletes an edge function, and never returns a secret value', async () => {
    const upsert = await callTool('backend_upsert', {
      workspaceId, projectId: 'p1', kind: 'edge', name: 'hello', code: 'return new Response("ok")', method: 'GET',
    });
    expect(upsert.isError).toBe(false);
    expect(JSON.parse(upsert.text!)).toMatchObject({ kind: 'edge', name: 'hello', method: 'GET', enabled: true });

    const secret = await callTool('backend_upsert', {
      workspaceId, projectId: 'p1', kind: 'secret', name: 'STRIPE', value: 'sk-live-secret',
    });
    expect(secret.isError).toBe(false);
    expect(secret.text).not.toContain('sk-live-secret');

    const listed = JSON.parse((await callTool('backend_list', { workspaceId, projectId: 'p1' })).text!);
    expect(listed.edge).toEqual([expect.objectContaining({ name: 'hello', code: 'return new Response("ok")' })]);
    expect(listed.secrets).toEqual([expect.objectContaining({ name: 'STRIPE', hasValue: true })]);
    expect(JSON.stringify(listed)).not.toContain('sk-live-secret');

    const deleted = await callTool('backend_delete', { workspaceId, projectId: 'p1', kind: 'edge', name: 'hello' });
    expect(JSON.parse(deleted.text!)).toEqual({ deleted: 'edge', name: 'hello' });
    const after = JSON.parse((await callTool('backend_list', { workspaceId, projectId: 'p1' })).text!);
    expect(after.edge).toEqual([]);
  });

  it('refuses backend writes on a read-only grant', async () => {
    vi.stubEnv('MCP_DEV_SCOPES', 'projects:read');

    const out = await callTool('backend_upsert', {
      workspaceId, projectId: 'p1', kind: 'edge', name: 'nope', code: 'return new Response("x")',
    });
    expect(out.isError).toBe(true);
    expect(out.text).toMatch(/projects:write/);
  });

  it('tells an open tab about a backend function written through MCP', async () => {
    const { eventBus } = await import('@/lib/server-generate/singleton');
    const seen: string[] = [];
    const listener = (e: { event: string }) => seen.push(e.event);
    eventBus.addListener(userId, listener);

    await callTool('backend_upsert', {
      workspaceId, projectId: 'p1', kind: 'server', name: 'fmt', code: 'return args',
    });
    eventBus.removeListener(userId, listener);

    expect(seen).toContain('mcp_project_changed');
  });
});
