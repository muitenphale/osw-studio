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

import { POST as filesPOST } from '@/app/api/w/[workspaceId]/sync/files/route';

const WS = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const PROJECT = '11111111-1111-1111-1111-111111111111';

let dir: string;
let adapter: SQLiteAdapter;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'osws-replace-default-'));
  const wsDir = path.join(dir, 'data', 'workspaces', WS);
  fs.mkdirSync(wsDir, { recursive: true });
  adapter = new SQLiteAdapter(path.join(wsDir, 'osws.sqlite'));
  await adapter.init();
  await adapter.createProject({
    id: PROJECT, name: 'P', createdAt: new Date(), updatedAt: new Date(), settings: {},
  } as never);
  mocks.getWorkspaceContext.mockResolvedValue({ adapter, workspaceId: WS, session: { userId: 'u1' } });
});

afterEach(async () => {
  await adapter.close?.();
  vi.clearAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

function file(filePath: string, content: string) {
  return {
    id: `id-${filePath}`,
    projectId: PROJECT,
    path: filePath,
    name: filePath.slice(1),
    type: 'file',
    content,
    mimeType: 'text/plain',
    size: content.length,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe('POST /sync/files replace default', () => {
  it('leaves existing files when the caller omits replace', async () => {
    await adapter.createFile({
      id: 'keep',
      projectId: PROJECT,
      path: '/keep.html',
      name: 'keep.html',
      type: 'html',
      content: 'old',
      mimeType: 'text/html',
      size: 3,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const response = await filesPOST(
      new NextRequest(`http://localhost/api/w/${WS}/sync/files`, {
        method: 'POST',
        body: JSON.stringify({ projectId: PROJECT, files: [file('/new.html', 'new')] }),
      }),
      { params: Promise.resolve({ workspaceId: WS }) },
    );

    expect(response.status).toBe(200);
    const paths = (await adapter.listFiles(PROJECT)).map((f) => f.path).sort();
    expect(paths).toEqual(['/keep.html', '/new.html']);
  });

  it('refuses a replace with no files so it cannot wipe the project empty', async () => {
    await adapter.createFile({
      id: 'keep',
      projectId: PROJECT,
      path: '/keep.html',
      name: 'keep.html',
      type: 'html',
      content: 'old',
      mimeType: 'text/html',
      size: 3,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const response = await filesPOST(
      new NextRequest(`http://localhost/api/w/${WS}/sync/files`, {
        method: 'POST',
        body: JSON.stringify({ projectId: PROJECT, files: [], replace: true }),
      }),
      { params: Promise.resolve({ workspaceId: WS }) },
    );

    expect(response.status).toBe(400);
    expect((await adapter.listFiles(PROJECT)).map((f) => f.path)).toEqual(['/keep.html']);
  });

  it('clears the project when replace is true', async () => {
    await adapter.createFile({
      id: 'gone',
      projectId: PROJECT,
      path: '/gone.html',
      name: 'gone.html',
      type: 'html',
      content: 'x',
      mimeType: 'text/html',
      size: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const response = await filesPOST(
      new NextRequest(`http://localhost/api/w/${WS}/sync/files`, {
        method: 'POST',
        body: JSON.stringify({
          projectId: PROJECT,
          files: [file('/only.html', 'y')],
          replace: true,
        }),
      }),
      { params: Promise.resolve({ workspaceId: WS }) },
    );

    expect(response.status).toBe(200);
    const paths = (await adapter.listFiles(PROJECT)).map((f) => f.path);
    expect(paths).toEqual(['/only.html']);
  });
});
