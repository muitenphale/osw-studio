import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { NextRequest } from 'next/server';
import { SQLiteAdapter } from '@/lib/vfs/adapters/sqlite-adapter';

const mocks = vi.hoisted(() => ({ getWorkspaceContext: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/api/workspace-context', () => ({ getWorkspaceContext: mocks.getWorkspaceContext }));
vi.mock('@/lib/utils', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { POST as projectPOST } from '@/app/api/w/[workspaceId]/sync/projects/[id]/route';
import { POST as metadataPOST } from '@/app/api/w/[workspaceId]/sync/projects/route';
import { POST as filesPOST } from '@/app/api/w/[workspaceId]/sync/files/route';

const WS = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const PROJECT = '11111111-1111-1111-1111-111111111111';

let dir: string;
let adapter: SQLiteAdapter;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'osws-rev-'));
  const wsDir = path.join(dir, 'data', 'workspaces', WS);
  fs.mkdirSync(wsDir, { recursive: true });
  adapter = new SQLiteAdapter(path.join(wsDir, 'osws.sqlite'));
  await adapter.init();
  await adapter.createProject({
    id: PROJECT,
    name: 'P',
    createdAt: new Date(),
    updatedAt: new Date(),
    settings: {},
    revision: 0,
  } as never);
  mocks.getWorkspaceContext.mockResolvedValue({ adapter, workspaceId: WS, session: { userId: 'u1' } });
});

afterEach(async () => {
  await adapter.close?.();
  vi.clearAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

function projectBody(baseRevision: number, name = 'P') {
  const now = new Date();
  return {
    project: {
      id: PROJECT,
      name,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      settings: {},
    },
    files: [
      {
        id: 'f1',
        projectId: PROJECT,
        path: '/index.html',
        name: 'index.html',
        type: 'html',
        content: '<h1>x</h1>',
        mimeType: 'text/html',
        size: 10,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
    ],
    deletedPaths: [],
    partial: true,
    writeProject: true,
    baseRevision,
  };
}

describe('project revision at commit', () => {
  it('accepts a matching base and advances the revision', async () => {
    const response = await projectPOST(
      new NextRequest(`http://localhost/api/w/${WS}/sync/projects/${PROJECT}`, {
        method: 'POST',
        body: JSON.stringify(projectBody(0)),
      }),
      { params: Promise.resolve({ workspaceId: WS, id: PROJECT }) },
    );
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.project.revision).toBe(1);
    expect((await adapter.getProject(PROJECT))!.revision).toBe(1);
  });

  it('rejects a stale base so a reacquired laptop cannot overwrite', async () => {
    await projectPOST(
      new NextRequest(`http://localhost/api/w/${WS}/sync/projects/${PROJECT}`, {
        method: 'POST',
        body: JSON.stringify(projectBody(0, 'first')),
      }),
      { params: Promise.resolve({ workspaceId: WS, id: PROJECT }) },
    );

    const stale = await projectPOST(
      new NextRequest(`http://localhost/api/w/${WS}/sync/projects/${PROJECT}`, {
        method: 'POST',
        body: JSON.stringify(projectBody(0, 'stale')),
      }),
      { params: Promise.resolve({ workspaceId: WS, id: PROJECT }) },
    );
    expect(stale.status).toBe(409);
    const body = await stale.json();
    expect(body.error).toBe('conflict');
    expect(body.reason).toBe('stale');
    expect(body.revision).toBe(1);
    expect((await adapter.getProject(PROJECT))!.name).toBe('first');
  });

  it('does not keep a rejected writer\'s files', async () => {
    await projectPOST(
      new NextRequest(`http://localhost/api/w/${WS}/sync/projects/${PROJECT}`, {
        method: 'POST',
        body: JSON.stringify(projectBody(0, 'first')),
      }),
      { params: Promise.resolve({ workspaceId: WS, id: PROJECT }) },
    );

    const rejected = await projectPOST(
      new NextRequest(`http://localhost/api/w/${WS}/sync/projects/${PROJECT}`, {
        method: 'POST',
        body: JSON.stringify({
          ...projectBody(0, 'loser'),
          files: [{
            ...projectBody(0).files[0],
            content: '<h1>loser</h1>',
          }],
        }),
      }),
      { params: Promise.resolve({ workspaceId: WS, id: PROJECT }) },
    );
    expect(rejected.status).toBe(409);
    const file = await adapter.getFile(PROJECT, '/index.html');
    expect(file?.content).toBe('<h1>x</h1>');
  });
});

describe('publish metadata then files', () => {
  it('chains the revision from the metadata response', async () => {
    const now = new Date();
    const meta = await metadataPOST(
      new NextRequest(`http://localhost/api/w/${WS}/sync/projects`, {
        method: 'POST',
        body: JSON.stringify({
          project: {
            id: PROJECT,
            name: 'P',
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
            settings: {},
          },
          baseRevision: 0,
        }),
      }),
      { params: Promise.resolve({ workspaceId: WS }) },
    );
    expect(meta.status).toBe(200);
    const metaBody = await meta.json();
    expect(metaBody.project.revision).toBeGreaterThan(0);

    const files = await filesPOST(
      new NextRequest(`http://localhost/api/w/${WS}/sync/files`, {
        method: 'POST',
        body: JSON.stringify({
          projectId: PROJECT,
          files: [projectBody(0).files[0]],
          replace: true,
          baseRevision: metaBody.project.revision,
        }),
      }),
      { params: Promise.resolve({ workspaceId: WS }) },
    );
    expect(files.status).toBe(200);
  });
});
