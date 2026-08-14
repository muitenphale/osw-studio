import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { SQLiteAdapter } from '../adapters/sqlite-adapter';
import { COLLECT_MIN_AGE_MS, blobDir, blobPath, collectBlobs, linkBlob, putBlob, readBlob } from '../adapters/blob-store';
import type { VirtualFile } from '../types';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'osws-blob-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('blob store', () => {
  it('stores identical content once', () => {
    const a = putBlob(dir, Buffer.from([1, 2, 3]));
    const b = putBlob(dir, Buffer.from([1, 2, 3]));

    expect(a).toBe(b);
    expect(fs.readdirSync(blobDir(dir))).toHaveLength(1);
  });

  it('round-trips the bytes it was given', () => {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 255, 128]);

    expect(readBlob(dir, putBlob(dir, bytes))).toEqual(bytes);
  });

  it('reports a missing hash rather than throwing', () => {
    expect(readBlob(dir, 'nope')).toBeNull();
  });

  it('leaves no temporary file behind', () => {
    putBlob(dir, Buffer.from('x'));

    expect(fs.readdirSync(blobDir(dir)).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });
});

describe('linking a blob into a deployment', () => {
  it('shares the bytes rather than copying them', () => {
    const hash = putBlob(dir, Buffer.from('image bytes'));
    const dest = path.join(dir, 'deployments', 'd1', 'img', 'logo.png');

    expect(linkBlob(dir, hash, dest)).toBe(true);

    // Same inode: the deployment's copy costs a directory entry, not the bytes again.
    expect(fs.statSync(dest).ino).toBe(fs.statSync(blobPath(dir, hash)).ino);
    expect(fs.readFileSync(dest).toString()).toBe('image bytes');
  });

  it('is idempotent, so republishing over an existing link is not an error', () => {
    const hash = putBlob(dir, Buffer.from('x'));
    const dest = path.join(dir, 'd', 'x.bin');

    linkBlob(dir, hash, dest);

    expect(() => linkBlob(dir, hash, dest)).not.toThrow();
  });
});

/** A moment far enough past the writes that the sweep's grace period no longer shields them. */
const settled = () => Date.now() + COLLECT_MIN_AGE_MS + 1000;

describe('collecting blobs', () => {
  it('leaves a blob alone until it has had time to be referenced', () => {
    // A blob is written before the row that points at it exists. A sweep landing in that window
    // would delete content the row is about to claim, and the file would read as empty from then
    // on — so recency alone protects it, regardless of references or links.
    const justWritten = putBlob(dir, Buffer.from('about to be referenced'));

    expect(collectBlobs(dir, new Set())).toBe(0);
    expect(readBlob(dir, justWritten)).not.toBeNull();
  });

  it('clears a temporary file left by a write that died', () => {
    const orphan = path.join(blobDir(dir), 'abc.tmp');
    fs.mkdirSync(blobDir(dir), { recursive: true });
    fs.writeFileSync(orphan, 'half a file');

    collectBlobs(dir, new Set(), settled());

    expect(fs.existsSync(orphan)).toBe(false);
  });

  it('leaves a temporary file a live write is still using', () => {
    const inFlight = path.join(blobDir(dir), 'def.tmp');
    fs.mkdirSync(blobDir(dir), { recursive: true });
    fs.writeFileSync(inFlight, 'being written');

    collectBlobs(dir, new Set());

    expect(fs.existsSync(inFlight)).toBe(true);
  });

  it('removes what nothing references', () => {
    const kept = putBlob(dir, Buffer.from('kept'));
    const dropped = putBlob(dir, Buffer.from('dropped'));

    expect(collectBlobs(dir, new Set([kept]), settled())).toBe(1);
    expect(readBlob(dir, kept)).not.toBeNull();
    expect(readBlob(dir, dropped)).toBeNull();
  });

  it('keeps a blob a published deployment is still serving', () => {
    // The v0/v1 case. A deployment published at v0 links the blob; the project then replaces the
    // file, so no row references it any more. It has to survive, because that deployment is still
    // serving it, and it is the link count that says so.
    const v0 = putBlob(dir, Buffer.from('the image as published'));
    linkBlob(dir, v0, path.join(dir, 'deployments', 'd1', 'img', 'a.png'));

    expect(collectBlobs(dir, new Set(), settled())).toBe(0);
    expect(readBlob(dir, v0)).not.toBeNull();
  });

  it('takes it once the deployment stops serving it', () => {
    const v0 = putBlob(dir, Buffer.from('old'));
    const link = path.join(dir, 'deployments', 'd1', 'a.png');
    linkBlob(dir, v0, link);

    // Republishing clears the deployment directory before writing the new version.
    fs.rmSync(path.join(dir, 'deployments', 'd1'), { recursive: true, force: true });

    expect(collectBlobs(dir, new Set(), settled())).toBe(1);
    expect(readBlob(dir, v0)).toBeNull();
    expect(fs.existsSync(link)).toBe(false);
  });
});

describe('the adapter storing a binary file', () => {
  it('keeps the bytes in the store and a hash in the row', async () => {
    const adapter = new SQLiteAdapter(path.join(dir, 'osws.sqlite'));
    await adapter.init();
    await adapter.createProject({
      id: 'p1', name: 'P', createdAt: new Date(), updatedAt: new Date(), settings: {},
    } as never);

    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    await adapter.createFile({
      id: 'f1', projectId: 'p1', path: '/a.png', name: 'a.png', type: 'image',
      content: bytes.buffer.slice(0) as ArrayBuffer, size: 5,
      createdAt: new Date(), updatedAt: new Date(),
    } as VirtualFile);

    // Read back through the adapter: the caller sees bytes, not a hash.
    const read = await adapter.getFile('p1', '/a.png');
    expect(Array.from(new Uint8Array(read!.content as ArrayBuffer))).toEqual([1, 2, 3, 4, 5]);

    // And the bytes live once, beside the database rather than inside it.
    expect(fs.readdirSync(blobDir(dir))).toHaveLength(1);
    await adapter.close?.();
  });
});

describe('when a blob goes missing', () => {
  async function adapterWithImage() {
    const adapter = new SQLiteAdapter(path.join(dir, 'osws.sqlite'));
    await adapter.init();
    await adapter.createProject({
      id: 'p1', name: 'P', createdAt: new Date(), updatedAt: new Date(), settings: {},
    } as never);
    const bytes = new Uint8Array([7, 7, 7, 7]);
    const file = {
      id: 'f1', projectId: 'p1', path: '/a.png', name: 'a.png', type: 'image',
      content: bytes.buffer.slice(0) as ArrayBuffer, size: 4,
      createdAt: new Date(), updatedAt: new Date(),
    } as VirtualFile;
    await adapter.createFile(file);
    return { adapter, file, bytes };
  }

  it('reads as empty rather than handing back the hash as content', async () => {
    const { adapter } = await adapterWithImage();
    for (const name of fs.readdirSync(blobDir(dir))) fs.unlinkSync(path.join(blobDir(dir), name));

    const read = await adapter.getFile('p1', '/a.png');

    // Empty, not a 64-character hash masquerading as the image.
    expect(Object.prototype.toString.call(read!.content)).toBe('[object ArrayBuffer]');
    expect((read!.content as ArrayBuffer).byteLength).toBe(0);
    await adapter.close?.();
  });

  it('comes back when the client pushes the file again', async () => {
    // The recovery that makes this survivable: the browser holds the project, so re-pushing a
    // file writes its bytes back into the store. Nothing has to be repaired by hand.
    const { adapter, file, bytes } = await adapterWithImage();
    for (const name of fs.readdirSync(blobDir(dir))) fs.unlinkSync(path.join(blobDir(dir), name));

    await adapter.updateFile({ ...file, content: bytes.buffer.slice(0) as ArrayBuffer });

    const read = await adapter.getFile('p1', '/a.png');
    expect(Array.from(new Uint8Array(read!.content as ArrayBuffer))).toEqual([7, 7, 7, 7]);
    await adapter.close?.();
  });
});

describe('when the deployment directory is on another filesystem', () => {
  it('still produces the file, by copying', () => {
    // What the desktop app does by default: DEPLOYMENTS_STATIC_DIR points at userData while the
    // data directory is elsewhere, and link() refuses to cross devices. Publishing has to keep
    // working, at the cost of the storage the link would have saved.
    const hash = putBlob(dir, Buffer.from('image bytes'));
    const dest = path.join(dir, 'elsewhere', 'logo.png');
    const linkSync = vi.spyOn(fs, 'linkSync').mockImplementation(() => {
      const error = new Error('cross-device link') as NodeJS.ErrnoException;
      error.code = 'EXDEV';
      throw error;
    });

    // Reports that it copied, so the caller can tell the operator what it cost.
    expect(linkBlob(dir, hash, dest)).toBe(false);
    expect(fs.readFileSync(dest).toString()).toBe('image bytes');
    // A copy, not a link: separate inodes.
    expect(fs.statSync(dest).ino).not.toBe(fs.statSync(blobPath(dir, hash)).ino);

    linkSync.mockRestore();
  });

  it('reports a failure it cannot work around', () => {
    const hash = putBlob(dir, Buffer.from('x'));
    const linkSync = vi.spyOn(fs, 'linkSync').mockImplementation(() => {
      const error = new Error('no space') as NodeJS.ErrnoException;
      error.code = 'ENOSPC';
      throw error;
    });

    // Not every link failure is a filesystem boundary; a disk problem has to surface.
    expect(() => linkBlob(dir, hash, path.join(dir, 'x', 'y.bin'))).toThrow();

    linkSync.mockRestore();
  });
});
