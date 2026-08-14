import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { NextRequest } from 'next/server';
import { SQLiteAdapter } from '@/lib/vfs/adapters/sqlite-adapter';

/**
 * The sync routes are where an attacker-chosen file path enters the server.
 *
 * Publishing turns a file path into a filesystem path under the deployment's output directory, so
 * a `..` segment escapes it and writes wherever the server process can reach. The build contains
 * this too, but a bad path should never reach the database in the first place: it is not something
 * a real client sends, and stored rows outlive whatever wrote them.
 */

const mocks = vi.hoisted(() => ({ getWorkspaceContext: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/api/workspace-context', () => ({ getWorkspaceContext: mocks.getWorkspaceContext }));

import { POST as filesPOST } from '@/app/api/w/[workspaceId]/sync/files/route';
import { POST as projectPOST } from '@/app/api/w/[workspaceId]/sync/projects/[id]/route';

const WS = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const PROJECT = '11111111-1111-1111-1111-111111111111';

let dir: string;
let adapter: SQLiteAdapter;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'osws-reject-'));
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

const UNSAFE = '/assets/../../../../ESCAPED.txt';

function file(filePath: string) {
  return {
    // Distinct per path: the rows are written with INSERT OR REPLACE, so a shared id would collapse
    // them into one and a count assertion would read as a rejection.
    id: `id-${filePath}`, projectId: PROJECT, path: filePath, name: 'x.txt', type: 'file',
    content: 'x', mimeType: 'text/plain', size: 1,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
}

describe('pushing a file whose path escapes its project', () => {
  it('is refused by the files route, and nothing is written', async () => {
    const response = await filesPOST(
      new NextRequest(`http://localhost/api/w/${WS}/sync/files`, {
        method: 'POST',
        body: JSON.stringify({ projectId: PROJECT, files: [file('/index.html'), file(UNSAFE)] }),
      }),
      { params: Promise.resolve({ workspaceId: WS }) }
    );

    expect(response.status).toBe(400);
    // Refused whole rather than partially applied: the safe file in the same batch is not stored.
    expect(await adapter.listFiles(PROJECT)).toHaveLength(0);
  });

  it('is refused by the project route', async () => {
    const now = new Date().toISOString();
    const response = await projectPOST(
      new NextRequest(`http://localhost/api/w/${WS}/sync/projects/${PROJECT}`, {
        method: 'POST',
        body: JSON.stringify({
          project: { id: PROJECT, name: 'P', createdAt: now, updatedAt: now, settings: {} },
          files: [file(UNSAFE)],
        }),
      }),
      { params: Promise.resolve({ workspaceId: WS, id: PROJECT }) }
    );

    expect(response.status).toBe(400);
    expect(await adapter.listFiles(PROJECT)).toHaveLength(0);
  });

  it('still accepts the paths a real project uses', async () => {
    const response = await filesPOST(
      new NextRequest(`http://localhost/api/w/${WS}/sync/files`, {
        method: 'POST',
        body: JSON.stringify({
          projectId: PROJECT,
          files: [file('/index.html'), file('/assets/img/hero.png'), file('/.PROMPT.md')],
        }),
      }),
      { params: Promise.resolve({ workspaceId: WS }) }
    );

    expect(response.status).toBe(200);
    expect(await adapter.listFiles(PROJECT)).toHaveLength(3);
  });
});
