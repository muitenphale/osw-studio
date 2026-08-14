import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { SQLiteAdapter } from '@/lib/vfs/adapters/sqlite-adapter';
import { COLLECT_MIN_AGE_MS, blobDir } from '@/lib/vfs/adapters/blob-store';
import type { VirtualFile } from '@/lib/vfs/types';

/**
 * Publishing writes the transformed text and links everything else.
 *
 * A published project used to be a second full copy of it on disk, and for a media-heavy project
 * nearly every duplicated byte was identical: the build only transforms text, and binary content
 * is written through untouched. Here the deployment gets a directory entry pointing at the blob the
 * project already holds, which is what makes a second deployment, or a republish, cost nothing.
 */

const mocks = vi.hoisted(() => ({ getWorkspaceAdapter: vi.fn() }));

// Marked 'server-only' for the bundler; the guard has to be neutralised to load it under vitest.
vi.mock('server-only', () => ({}));

vi.mock('@/lib/vfs/adapters/server', () => ({
  getWorkspaceAdapter: mocks.getWorkspaceAdapter,
  createServerAdapter: async () => mocks.getWorkspaceAdapter(),
}));
vi.mock('@/lib/utils', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

let dir: string;
let adapter: SQLiteAdapter;

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4, 5, 6, 7, 8]);

async function addFile(projectId: string, filePath: string, content: string | ArrayBuffer) {
  await adapter.createFile({
    id: `f-${filePath}`, projectId, path: filePath, name: filePath.slice(1),
    type: filePath.endsWith('.png') ? 'image' : 'html',
    content, size: 12, createdAt: new Date(), updatedAt: new Date(),
  } as VirtualFile);
}

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'osws-publish-'));
  vi.stubEnv('DEPLOYMENTS_STATIC_DIR', path.join(dir, 'static'));

  adapter = new SQLiteAdapter(path.join(dir, 'workspace', 'osws.sqlite'));
  await adapter.init();
  mocks.getWorkspaceAdapter.mockReturnValue(adapter);

  await adapter.createProject({
    id: 'p1', name: 'Media', createdAt: new Date(), updatedAt: new Date(), settings: { runtime: 'static' },
  } as never);
  await addFile('p1', '/index.html', '<html><body><img src="/logo.png"></body></html>');
  await addFile('p1', '/logo.png', PNG.buffer.slice(0) as ArrayBuffer);

  await adapter.createDeployment?.({
    id: 'd1', projectId: 'p1', name: 'Site', enabled: true,
    createdAt: new Date(), updatedAt: new Date(),
  } as never);
});

afterEach(async () => {
  await adapter.close?.();
  vi.unstubAllEnvs();
  fs.rmSync(dir, { recursive: true, force: true });
});

const workspaceBase = () => path.join(dir, 'workspace');

/**
 * Age every blob past the sweep's grace period.
 *
 * That period exists to protect content written moments ago, which would otherwise shield every
 * blob in a test from the sweep and leave it asserting nothing. A project nobody has published in
 * the last ten minutes is the real case anyway.
 */
function ageBlobStore() {
  const store = blobDir(workspaceBase());
  const past = new Date(Date.now() - COLLECT_MIN_AGE_MS - 60_000);
  for (const name of fs.readdirSync(store)) {
    fs.utimesSync(path.join(store, name), past, past);
  }
}
const servedPath = (rel: string) => path.join(dir, 'static', 'd1', rel);

describe('publishing a project with media', () => {
  it('serves the image from the same bytes the project stores', async () => {
    const { buildStaticDeployment } = await import('../static-builder');

    const result = await buildStaticDeployment('d1', 'w1');
    expect(result.success).toBe(true);

    // The served file is real and correct — Caddy has a file to hand out.
    expect(fs.readFileSync(servedPath('logo.png'))).toEqual(Buffer.from(PNG));

    // And it is the project's bytes, not a copy of them.
    const blobs = fs.readdirSync(blobDir(workspaceBase()));
    expect(blobs).toHaveLength(1);
    expect(fs.statSync(servedPath('logo.png')).ino)
      .toBe(fs.statSync(path.join(blobDir(workspaceBase()), blobs[0])).ino);
  });

  it('writes the html rather than linking it, since publishing rewrites it', async () => {
    const { buildStaticDeployment } = await import('../static-builder');
    await buildStaticDeployment('d1', 'w1');

    const html = fs.readFileSync(servedPath('index.html'), 'utf-8');
    expect(html).toContain('logo.png');
    // Transformed on the way out, so it cannot be shared with the project's copy.
    expect(html).not.toBe('<html><body><img src="/logo.png"></body></html>');
  });

  it('republishing keeps serving, and does not accumulate blobs', async () => {
    const { buildStaticDeployment } = await import('../static-builder');
    await buildStaticDeployment('d1', 'w1');
    await buildStaticDeployment('d1', 'w1');

    expect(fs.readFileSync(servedPath('logo.png'))).toEqual(Buffer.from(PNG));
    expect(fs.readdirSync(blobDir(workspaceBase()))).toHaveLength(1);
  });

  it('does not sweep away an unpublished project\'s files', async () => {
    // The sweep runs over the whole workspace, so publishing one project sees blobs belonging to
    // every other one. A project nobody has deployed has no link protecting its bytes: the only
    // thing standing between it and deletion is that a row still refers to the hash.
    const other = new Uint8Array([42, 42, 42, 42, 42]);
    await adapter.createProject({
      id: 'p2', name: 'Never published', createdAt: new Date(), updatedAt: new Date(), settings: {},
    } as never);
    await addFile('p2', '/private.png', other.buffer.slice(0) as ArrayBuffer);

    ageBlobStore();

    const { buildStaticDeployment } = await import('../static-builder');
    await buildStaticDeployment('d1', 'w1');

    const stillThere = await adapter.getFile('p2', '/private.png');
    expect(Array.from(new Uint8Array(stillThere!.content as ArrayBuffer))).toEqual(Array.from(other));
  });

  it('a deployment published at v0 keeps serving v0 after the project moves on', async () => {
    const { buildStaticDeployment } = await import('../static-builder');
    await buildStaticDeployment('d1', 'w1');

    // The project replaces the image, and a later publish of some other deployment sweeps blobs.
    const v1 = new Uint8Array([9, 9, 9, 9]);
    const existing = await adapter.getFile('p1', '/logo.png');
    await adapter.updateFile({ ...existing!, content: v1.buffer.slice(0) as ArrayBuffer });
    await adapter.createDeployment?.({
      id: 'd2', projectId: 'p1', name: 'Other', enabled: true,
      createdAt: new Date(), updatedAt: new Date(),
    } as never);

    // Without this the grace period shields every blob and d2's publish sweeps nothing, so the
    // scenario this test describes would not happen at all.
    ageBlobStore();

    await buildStaticDeployment('d2', 'w1');

    // d1 was never republished, so it still serves what it was published with.
    expect(fs.readFileSync(servedPath('logo.png'))).toEqual(Buffer.from(PNG));
    // And d2 serves the new bytes.
    expect(fs.readFileSync(path.join(dir, 'static', 'd2', 'logo.png'))).toEqual(Buffer.from(v1));

    // Both versions survive the sweep in the store itself. Serving alone would not show this: d1's
    // file is a link, so it keeps its content even if the sweep took the blob out from under it.
    // No row refers to v0 any more, so what spares it is the link d1 holds.
    expect(fs.readdirSync(blobDir(workspaceBase()))).toHaveLength(2);
  });
});
