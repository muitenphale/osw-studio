// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import JSZip from 'jszip';
import { NextRequest } from 'next/server';
import { SQLiteAdapter } from '@/lib/vfs/adapters/sqlite-adapter';

/**
 * End-state sync tests: a real client talking to a real server.
 *
 * The "imported project shows Local newer" bug has now been fixed three times and shipped broken
 * three times. Every previous test drew its boundary inside the thing that was broken — it mocked
 * the sync manager and derived the server's timestamp from the client's own, so the server could
 * never disagree with the client and the failing case was inexpressible.
 *
 * Here the server is a real participant: the actual route handlers over a real SQLite database,
 * reached through a fetch shim. Nothing about sync is mocked. Each test asserts the END STATE the
 * user sees ("does Server Sync say synced?") rather than the mechanism that was supposed to produce
 * it, so a new cause of the same symptom fails the test even though the old cause stays fixed.
 */

const mocks = vi.hoisted(() => ({ getWorkspaceContext: vi.fn() }));

vi.mock('@/lib/api/workspace-context', () => ({ getWorkspaceContext: mocks.getWorkspaceContext }));
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

import { GET as statusGET } from '@/app/api/w/[workspaceId]/sync/status/route';
import {
  GET as projectGET,
  POST as projectPOST,
  DELETE as projectDELETE,
} from '@/app/api/w/[workspaceId]/sync/projects/[id]/route';
import {
  GET as projectsGET,
  POST as projectsPOST,
} from '@/app/api/w/[workspaceId]/sync/projects/route';

import { vfs } from '../index';
import { BackupService } from '../backup-service';
import { saveManager } from '../save-manager';
import { calculateItemSyncStatus } from '../sync-types';
import {
  fetchSyncStatus,
  invalidateSyncStatusCache,
  reconcileProjectsToServer,
  setAutoSyncWorkspaceId,
} from '../auto-sync';

const WORKSPACE = 'w1';

let dir: string;
let adapter: SQLiteAdapter;

/** Routes /api/w/{id}/sync/* straight into the real handlers. No network, no stubbed responses. */
async function dispatch(rawUrl: string, init?: RequestInit): Promise<Response> {
  const url = new URL(rawUrl, 'http://localhost');
  const match = url.pathname.match(/^\/api\/w\/([^/]+)\/sync\/(.+)$/);
  if (!match) throw new Error(`unrouted request: ${rawUrl}`);
  const [, workspaceId, rest] = match;
  const method = (init?.method ?? 'GET').toUpperCase();

  const request = new NextRequest(`http://localhost${url.pathname}${url.search}`, {
    method,
    ...(init?.body ? { body: init.body as string } : {}),
  });

  if (rest === 'status') {
    return statusGET(request, { params: Promise.resolve({ workspaceId }) });
  }

  if (rest === 'projects') {
    const params = Promise.resolve({ workspaceId });
    return method === 'POST' ? projectsPOST(request, { params }) : projectsGET(request, { params });
  }

  const single = rest.match(/^projects\/([^/?]+)$/);
  if (single) {
    const params = Promise.resolve({ workspaceId, id: single[1] });
    if (method === 'POST') return projectPOST(request, { params });
    if (method === 'DELETE') return projectDELETE(request, { params });
    return projectGET(request, { params });
  }

  throw new Error(`unrouted request: ${rawUrl}`);
}

/**
 * Exactly what the Server Sync dialog computes (use-sync-status.ts): the local record's own
 * timestamps against the server's live list. Asserting on this is asserting on what the user reads.
 */
async function serverSyncSays(projectId: string) {
  invalidateSyncStatusCache();
  const status = await fetchSyncStatus();
  const server = (status?.projects ?? []).find((p: { id: string }) => p.id === projectId);
  const local = await vfs.getProject(projectId);
  return calculateItemSyncStatus(
    local!.updatedAt,
    server?.updatedAt ?? null,
    local!.lastSyncedAt ?? null
  );
}

const CREATED_AT = new Date('2026-07-31T10:00:00.000Z');
const PUSHED_AT = new Date('2026-07-31T10:00:05.000Z');
const EDITED_AT = new Date('2026-07-31T10:00:10.000Z');

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SERVER_MODE', 'true');
  // Only Date is faked: fake-indexeddb drives its requests off real timers and faking those
  // deadlocks it. The server stores the client's updatedAt verbatim, so pinning the clock makes
  // every timestamp in the loop deterministic instead of a race with how fast the suite runs.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(CREATED_AT);

  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'osws-endstate-'));
  adapter = new SQLiteAdapter(path.join(dir, 'osws.sqlite'));
  await adapter.init();
  mocks.getWorkspaceContext.mockResolvedValue({
    session: { userId: 'u1' },
    workspaceId: WORKSPACE,
    adapter,
  });

  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    return dispatch(url, init);
  }));

  setAutoSyncWorkspaceId(WORKSPACE);
  invalidateSyncStatusCache();
  await vfs.init();
});

afterEach(async () => {
  await adapter.close?.();
  fs.rmSync(dir, { recursive: true, force: true });
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

/** A project that exists locally and has been pushed to the server. */
async function createAndPush(name: string) {
  vi.setSystemTime(CREATED_AT);
  const project = await vfs.createProject(name, 'end-state fixture');
  await vfs.createFile(project.id, '/index.html', '<h1>hi</h1>');
  saveManager.markClean(project.id);

  vi.setSystemTime(PUSHED_AT);
  const { pushProjectToServer } = await import('../push-project-to-server');
  await pushProjectToServer(project.id, WORKSPACE);
  return project.id;
}

describe('a freshly pushed project', () => {
  it('reads as synced in Server Sync', async () => {
    const id = await createAndPush('Fresh');

    expect(await serverSyncSays(id)).toBe('synced');
  });
});

describe('a project restored from an .osws backup', () => {
  /**
   * The backup carries lastSyncedAt/serverUpdatedAt describing a sync to whichever instance it was
   * taken from. Restored verbatim they are read as this server's history, and the project can never
   * settle: it reads 'conflict' when the server also has it (and a conflicting push is refused), or
   * the reconcile guard vetoes the upload when it doesn't.
   *
   * These go through the real BackupService.importAllData rather than writing the record by hand,
   * because the normalisation under test lives in that path — simulating the restore would test the
   * simulation.
   */
  const STALE = '2026-06-30T21:09:25.571Z';

  async function backupFileFor(records: { projects: unknown[]; files?: unknown[] }): Promise<File> {
    const backup = {
      version: '1.9.0',
      exportDate: new Date().toISOString(),
      databases: {
        vfs: { projects: records.projects, files: records.files ?? [] },
        conversations: [],
        checkpoints: [],
      },
      metadata: {
        projectCount: records.projects.length,
        totalSize: 0,
        exportedFrom: 'oswstudio',
      },
    };
    const zip = new JSZip();
    zip.file('backup.json', JSON.stringify(backup));
    const blob = await zip.generateAsync({ type: 'blob' });
    return new File([blob], 'backup.osws');
  }

  it('settles as synced when this server already has the project', async () => {
    const id = await createAndPush('Restored');
    const local = await vfs.getProject(id);

    const file = await backupFileFor({
      projects: [{ ...local, lastSyncedAt: STALE, serverUpdatedAt: STALE, syncStatus: 'synced' }],
    });
    await BackupService.importAllData(file, { mode: 'merge' });
    saveManager.markClean(id);

    await reconcileProjectsToServer(WORKSPACE);

    expect(await serverSyncSays(id)).toBe('synced');
  });

  it('is uploaded when this server has never seen the project', async () => {
    // A backup taken on another instance: the record claims a sync that never happened here.
    const id = 'restored-elsewhere';
    const file = await backupFileFor({
      projects: [
        {
          id,
          name: 'From another instance',
          createdAt: CREATED_AT,
          updatedAt: CREATED_AT,
          settings: {},
          lastSyncedAt: STALE,
          serverUpdatedAt: STALE,
          syncStatus: 'synced',
        },
      ],
      files: [
        {
          id: 'f1',
          projectId: id,
          path: '/index.html',
          name: 'index.html',
          type: 'html',
          content: '<h1>restored</h1>',
          mimeType: 'text/html',
          size: 17,
          createdAt: CREATED_AT,
          updatedAt: CREATED_AT,
          metadata: {},
        },
      ],
    });
    await BackupService.importAllData(file, { mode: 'merge' });
    saveManager.markClean(id);

    await reconcileProjectsToServer(WORKSPACE);

    expect(await serverSyncSays(id)).toBe('synced');
  });
});

describe('a genuine local edit', () => {
  it('is reported as drift and then settles once reconciled', async () => {
    const id = await createAndPush('Edited');

    vi.setSystemTime(EDITED_AT);
    const project = await vfs.getProject(id);
    project!.name = 'Edited later';
    await vfs.updateProject(project!);
    saveManager.markClean(id);

    expect(await serverSyncSays(id)).toBe('local-newer');

    await reconcileProjectsToServer(WORKSPACE);

    expect(await serverSyncSays(id)).toBe('synced');
  });
});
