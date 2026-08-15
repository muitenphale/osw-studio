import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import vm from 'node:vm';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { NextRequest } from 'next/server';
import { SQLiteAdapter } from '@/lib/vfs/adapters/sqlite-adapter';
import { serializeFileContent } from '../sync-manager';
import { serializeFilesForResponse } from '../sync-utils';

const mocks = vi.hoisted(() => ({ getWorkspaceContext: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/api/workspace-context', () => ({ getWorkspaceContext: mocks.getWorkspaceContext }));

/**
 * A binary file whose ArrayBuffer came from another realm still reaches the server as bytes.
 *
 * IndexedDB hands back structured clones, and a clone can carry another realm's constructor, so
 * `instanceof ArrayBuffer` is false for something that unmistakably is one. The sync serializers
 * used that test, so such a file was passed through untouched and `JSON.stringify` wrote it out as
 * `{}` — which the storage layer records as an empty file, with no error anywhere. The published
 * site then serves a zero-byte image.
 *
 * `node:vm` gives a genuine cross-realm ArrayBuffer, which is the same shape the browser produces;
 * a hand-rolled fake would only prove the assertion matches the fake.
 */

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** An ArrayBuffer built by another realm's constructor, as a structured clone can be. */
function foreignArrayBuffer(bytes: number[]): ArrayBuffer {
  return vm.runInNewContext(`new Uint8Array([${bytes.join(',')}]).buffer`);
}

function fileWith(content: unknown) {
  return {
    id: 'f1', projectId: 'p1', path: '/logo.png', name: 'logo.png', type: 'image',
    content, mimeType: 'image/png', size: PNG.length,
    createdAt: new Date(), updatedAt: new Date(),
  } as never;
}

describe('an ArrayBuffer from another realm', () => {
  it('is one, but not by instanceof', () => {
    // The premise. Without this the rest of the file would be asserting nothing.
    const foreign = foreignArrayBuffer(PNG);
    expect(Object.prototype.toString.call(foreign)).toBe('[object ArrayBuffer]');
    expect(foreign instanceof ArrayBuffer).toBe(false);
  });

  it('is encoded by the push serializer rather than passed through', () => {
    const out = serializeFileContent(fileWith(foreignArrayBuffer(PNG)));

    expect((out as { _isBinaryBase64?: boolean })._isBinaryBase64).toBe(true);
    expect(Buffer.from(out.content as string, 'base64')).toEqual(Buffer.from(PNG));
  });

  it('does not turn into {} on the wire', () => {
    const out = serializeFileContent(fileWith(foreignArrayBuffer(PNG)));
    const overTheWire = JSON.parse(JSON.stringify({ files: [out] })).files[0];

    expect(overTheWire.content).not.toEqual({});
    expect(typeof overTheWire.content).toBe('string');
  });

  it('is encoded by the pull serializer too', () => {
    const [out] = serializeFilesForResponse([fileWith(foreignArrayBuffer(PNG))]);

    expect((out as { _isBinaryBase64?: boolean })._isBinaryBase64).toBe(true);
    expect(Buffer.from(out.content as string, 'base64')).toEqual(Buffer.from(PNG));
  });
});

describe('pushing such a file through the sync route', () => {
  let dir: string;
  let adapter: SQLiteAdapter;

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'osws-realm-'));
    const wsDir = path.join(dir, 'data', 'workspaces', 'w1');
    fs.mkdirSync(wsDir, { recursive: true });
    adapter = new SQLiteAdapter(path.join(wsDir, 'osws.sqlite'));
    await adapter.init();
    await adapter.createProject({
      id: 'p1', name: 'P', createdAt: new Date(), updatedAt: new Date(), settings: {},
    } as never);
    mocks.getWorkspaceContext.mockResolvedValue({ adapter, workspaceId: 'w1', session: { userId: 'u1' } });
  });

  afterEach(async () => {
    await adapter.close?.();
    vi.clearAllMocks();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('stores the bytes, not an empty file', async () => {
    // The whole path a publish takes: serialize on the client, JSON over the wire, store on the
    // server. The assertion is on what the server would hand to the static build.
    const body = JSON.stringify({
      projectId: 'p1',
      files: [serializeFileContent(fileWith(foreignArrayBuffer(PNG)))],
    });

    const { POST } = await import('@/app/api/w/[workspaceId]/sync/files/route');
    const response = await POST(
      new NextRequest('http://localhost/api/w/w1/sync/files', { method: 'POST', body }),
      { params: Promise.resolve({ workspaceId: 'w1' }) }
    );
    expect(response.status).toBe(200);

    const stored = await adapter.getFile('p1', '/logo.png');
    expect(Object.prototype.toString.call(stored!.content)).toBe('[object ArrayBuffer]');
    expect(Buffer.from(stored!.content as ArrayBuffer)).toEqual(Buffer.from(PNG));
  });
});
