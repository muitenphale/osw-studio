import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * The gate is in the adapter rather than in the routes because that is what every writer reaches:
 * the sync routes, server-mode generation, `bash/execute` and the MCP connector all write through
 * `getWorkspaceAdapter`. A check added per route would have missed the last three.
 */

vi.mock('server-only', () => ({}));

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'osws-quota-write-'));
  seeded = 0;
  vi.resetModules();
  vi.stubEnv('DATA_DIR', path.join(dir, 'data'));
  vi.stubEnv('DEPLOYMENTS_STATIC_DIR', path.join(dir, 'static'));
});

afterEach(async () => {
  const { closeSystemDatabase } = await import('@/lib/auth/system-database');
  closeSystemDatabase();
  vi.unstubAllEnvs();
  fs.rmSync(dir, { recursive: true, force: true });
});

let seeded = 0;

async function seed(limitMb: number) {
  const { createUser, createWorkspace, updateWorkspace } = await import('@/lib/auth/system-database');
  const { getWorkspaceAdapter } = await import('@/lib/vfs/adapters/server');
  // A distinct address per call, so a test can seed two workspaces and compare them.
  const owner = createUser(`o${++seeded}@a.test`, 'x');
  const workspaceId = createWorkspace('W', owner);
  updateWorkspace(workspaceId, { max_storage_mb: limitMb });

  const adapter = getWorkspaceAdapter(workspaceId);
  await adapter.init();
  await adapter.createProject({
    id: 'p1', name: 'P', createdAt: new Date(), updatedAt: new Date(), settings: {},
  } as never);
  return { adapter, workspaceId };
}

const aFile = (path: string, bytes: number) => ({
  id: path, projectId: 'p1', path, name: path.split('/').pop()!, type: 'file' as const,
  content: 'x'.repeat(bytes), createdAt: new Date(), updatedAt: new Date(),
});

/**
 * Binary content is what the gate missed entirely. `encodeFileContent` sends an ArrayBuffer to the
 * blob store and returns a hash, so metering the encoded string charged a 10MB image about sixty
 * bytes: 4MB of images went into a 1MB workspace with nothing refused. Every other test here writes
 * text, which is why the suite was green.
 */
const anImage = (path: string, bytes: number) => ({
  id: path, projectId: 'p1', path, name: path.split('/').pop()!, type: 'image' as const,
  content: new ArrayBuffer(bytes), createdAt: new Date(), updatedAt: new Date(),
});

describe('a binary write through the adapter', () => {
  it('is metered by the file\'s real byte length, not the blob hash', async () => {
    const { StorageQuotaError } = await import('@/lib/api/storage-quota');
    const { adapter } = await seed(1);

    let written = 0;
    let refusal: unknown;
    for (let i = 0; i < 20; i++) {
      try { await adapter.createFile(anImage(`/img${i}.png`, 200 * 1024) as never); written++; }
      catch (error) { refusal = error; break; }
    }

    expect(refusal).toBeInstanceOf(StorageQuotaError);
    // 1MB of headroom at 200KB each: a handful through, not all twenty.
    expect(written).toBeGreaterThan(0);
    expect(written).toBeLessThan(20);
  });

  it('refuses a single image larger than the whole limit', async () => {
    const { StorageQuotaError } = await import('@/lib/api/storage-quota');
    const { adapter } = await seed(1);
    await expect(adapter.createFile(anImage('/huge.png', 4 * 1024 * 1024) as never)).rejects.toBeInstanceOf(StorageQuotaError);
  });

  it('does not write the blob for a refused image', async () => {
    const { adapter, workspaceId } = await seed(1);
    const blobDir = path.join(dir, 'data', 'workspaces', workspaceId, 'blobs');
    await adapter.createFile(anImage('/huge.png', 4 * 1024 * 1024) as never).catch(() => {});

    const files = fs.existsSync(blobDir) ? fs.readdirSync(blobDir, { recursive: true }) as string[] : [];
    const stored = files.filter(f => fs.statSync(path.join(blobDir, f)).isFile());
    expect(stored).toEqual([]);
  });

  it('lets a binary write inside the limit through', async () => {
    const { adapter } = await seed(500);
    await expect(adapter.createFile(anImage('/logo.png', 256 * 1024) as never)).resolves.toBeUndefined();
  });
});

describe('a write through the adapter', () => {
  it('is refused once the workspace is over its limit', async () => {
    const { StorageQuotaError } = await import('@/lib/api/storage-quota');
    const { adapter } = await seed(1);

    // 1MB of headroom, written 200KB at a time: the run stops rather than going on indefinitely.
    let written = 0;
    let refusal: unknown;
    for (let i = 0; i < 20; i++) {
      try {
        await adapter.createFile(aFile(`/f${i}.txt`, 200 * 1024) as never);
        written++;
      } catch (error) { refusal = error; break; }
    }

    expect(refusal).toBeInstanceOf(StorageQuotaError);
    expect(written).toBeGreaterThan(0);
    expect(written).toBeLessThan(20);
  });

  it('lets an ordinary write through', async () => {
    const { adapter } = await seed(500);
    await expect(adapter.createFile(aFile('/index.html', 2048) as never)).resolves.toBeUndefined();
  });

  it('refuses an update as well as a create', async () => {
    const { StorageQuotaError } = await import('@/lib/api/storage-quota');
    const { adapter } = await seed(1);
    await adapter.createFile(aFile('/big.txt', 1024) as never);

    let refusal: unknown;
    for (let i = 0; i < 20; i++) {
      try { await adapter.updateFile(aFile('/big.txt', 200 * 1024) as never); }
      catch (error) { refusal = error; break; }
    }
    expect(refusal).toBeInstanceOf(StorageQuotaError);
  });

  it('does not meter the shared database, which has no workspace row', async () => {
    const { getSQLiteAdapter } = await import('@/lib/vfs/adapters/server');
    const shared = getSQLiteAdapter();
    await shared.init();
    await shared.createProject({
      id: 'p1', name: 'P', createdAt: new Date(), updatedAt: new Date(), settings: {},
    } as never);
    // A desktop install writes here and carries no limit at all.
    await expect(shared.createFile(aFile('/whatever.txt', 4096) as never)).resolves.toBeUndefined();
  });
});

/**
 * The two readings the publish gate depends on, against a real database rather than a stub.
 *
 * `publishDeployment` asks for both before it builds, and its own tests supply them from a fake
 * adapter, so nothing exercised the queries themselves. A `projectContentBytes` that came back 0
 * would leave the publish gate admitting every size, which is the shape of the defect the byte
 * metering above exists to prevent.
 */
describe('the figures the publish gate reads', () => {
  it('reports a project\'s bytes, counting binary content as its real length', async () => {
    const { adapter } = await seed(500);
    const { VirtualFileSystem } = await import('@/lib/vfs');
    const projectVfs = new VirtualFileSystem(adapter as never);
    await projectVfs.init();

    await projectVfs.createFile('p1', '/index.html', 'y'.repeat(5000));
    await projectVfs.createFile('p1', '/logo.png', new ArrayBuffer(20000));

    expect(adapter.projectContentBytes('p1')).toBe(25000);
  });

  it('lists this workspace\'s deployments and not another workspace\'s', async () => {
    const { adapter } = await seed(500);
    const other = await seed(500);

    await adapter.createDeployment({
      id: 'd-mine', projectId: 'p1', name: 'Mine', underConstruction: false,
      headScripts: [], bodyScripts: [], cdnLinks: [], settingsVersion: 1,
      createdAt: new Date(), updatedAt: new Date(),
    } as never);
    await other.adapter.createDeployment({
      id: 'd-theirs', projectId: 'p1', name: 'Theirs', underConstruction: false,
      headScripts: [], bodyScripts: [], cdnLinks: [], settingsVersion: 1,
      createdAt: new Date(), updatedAt: new Date(),
    } as never);

    // Each workspace has its own database, so the measurement must not reach across them: counting
    // another workspace's published output would meter this one for storage it does not hold.
    expect(adapter.listDeploymentIdsSync()).toEqual(['d-mine']);
    expect(other.adapter.listDeploymentIdsSync()).toEqual(['d-theirs']);
  });
});
