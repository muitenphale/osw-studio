import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { NextRequest } from 'next/server';
import { SQLiteAdapter } from '@/lib/vfs/adapters/sqlite-adapter';
import { serializeFileContent, deserializeFileContent } from '@/lib/vfs/sync-manager';
import { getFileTypeFromPath, type VirtualFile } from '@/lib/vfs/types';

/**
 * Boundary test for the sync route.
 *
 * Unit tests of the adapter pass an ArrayBuffer straight in, which no route ever does — the client
 * base64-encodes for JSON transport and the route hands on what it receives. That gap is what let
 * binary files be stored as text while the adapter's own tests stayed green, so this exercises the
 * real handler: client encode -> POST -> SQLite -> GET -> client decode.
 */

const mocks = vi.hoisted(() => ({ getWorkspaceContext: vi.fn() }));
vi.mock('@/lib/api/workspace-context', () => ({ getWorkspaceContext: mocks.getWorkspaceContext }));
vi.mock('@/lib/utils', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { POST, GET } from '../route';

const PROJECT_ID = 'p1';
let dir: string;
let adapter: SQLiteAdapter;

/** Distinct byte patterns so a mix-up shows up as wrong bytes, not just wrong type. */
const BINARY: Record<string, Uint8Array> = {
  '/logo.png': new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
  '/theme.mp3': new Uint8Array([0xff, 0xfb, 0x90, 0x64, 1, 2, 3, 4]),
  '/body.woff2': new Uint8Array([0x77, 0x4f, 0x46, 0x32, 5, 6, 7, 8]),
  '/manual.pdf': new Uint8Array([0x25, 0x50, 0x44, 0x46, 9, 10, 11, 12]),
  '/clip.ogg': new Uint8Array([0x4f, 0x67, 0x67, 0x53, 13, 14, 15, 16]),
  '/scene.glb': new Uint8Array([0x67, 0x6c, 0x54, 0x46, 17, 18, 19, 20]),
  '/movie.mp4': new Uint8Array([0, 0, 0, 0x18, 21, 22, 23, 24]),
};

function localFile(filePath: string, content: string | ArrayBuffer): VirtualFile {
  return {
    id: `f${filePath}`,
    projectId: PROJECT_ID,
    path: filePath,
    name: filePath.slice(1),
    type: getFileTypeFromPath(filePath),
    content,
    size: 8,
    createdAt: new Date('2026-07-30T10:00:00.000Z'),
    updatedAt: new Date('2026-07-30T10:00:00.000Z'),
  } as VirtualFile;
}

function projectPayload() {
  return {
    id: PROJECT_ID,
    name: 'Binary',
    createdAt: new Date('2026-07-30T10:00:00.000Z'),
    updatedAt: new Date('2026-07-30T10:00:00.000Z'),
    settings: {},
  };
}

const params = Promise.resolve({ workspaceId: 'default', id: PROJECT_ID });

async function push(files: VirtualFile[]) {
  const request = new NextRequest('http://localhost/api/w/default/sync/projects/p1', {
    method: 'POST',
    body: JSON.stringify({
      project: projectPayload(),
      // Exactly what the client sends.
      files: files.map(serializeFileContent),
    }),
  });
  const response = await POST(request, { params });
  expect(response.status).toBe(200);
}

async function pull(): Promise<VirtualFile[]> {
  const request = new NextRequest('http://localhost/api/w/default/sync/projects/p1');
  const response = await GET(request, { params });
  expect(response.status).toBe(200);
  const body = await response.json();
  // Exactly what the client does with the response.
  return body.files.map(deserializeFileContent);
}

beforeEach(async () => {
  vi.clearAllMocks();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'osws-route-'));
  adapter = new SQLiteAdapter(path.join(dir, 'osws.sqlite'));
  await adapter.init();
  await adapter.createProject(projectPayload() as never);
  mocks.getWorkspaceContext.mockResolvedValue({
    session: { userId: 'u1' },
    workspaceId: 'default',
    adapter,
  });
});

afterEach(async () => {
  await adapter.close?.();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('sync route file round-trip', () => {
  it.each(Object.keys(BINARY))('preserves %s byte for byte', async (filePath) => {
    const original = BINARY[filePath];
    await push([localFile(filePath, original.buffer.slice(0) as ArrayBuffer)]);

    const [pulled] = await pull();

    expect(Object.prototype.toString.call(pulled.content)).toBe('[object ArrayBuffer]');
    expect(Array.from(new Uint8Array(pulled.content as ArrayBuffer))).toEqual(Array.from(original));
  });

  it('leaves text files as text', async () => {
    await push([localFile('/index.html', '<h1>hi</h1>'), localFile('/notes.md', '# hi')]);

    const pulled = await pull();

    expect(pulled.find((f) => f.path === '/index.html')!.content).toBe('<h1>hi</h1>');
    expect(pulled.find((f) => f.path === '/notes.md')!.content).toBe('# hi');
  });

  it('handles a mixed project in one push', async () => {
    await push([
      localFile('/index.html', '<h1>hi</h1>'),
      localFile('/logo.png', BINARY['/logo.png'].buffer.slice(0) as ArrayBuffer),
      localFile('/theme.mp3', BINARY['/theme.mp3'].buffer.slice(0) as ArrayBuffer),
    ]);

    const pulled = await pull();

    expect(pulled).toHaveLength(3);
    expect(pulled.find((f) => f.path === '/index.html')!.content).toBe('<h1>hi</h1>');
    for (const p of ['/logo.png', '/theme.mp3']) {
      const f = pulled.find((x) => x.path === p)!;
      expect(Array.from(new Uint8Array(f.content as ArrayBuffer))).toEqual(Array.from(BINARY[p]));
    }
  });

  it('survives a second push over the same files (the partial path)', async () => {
    await push([localFile('/theme.mp3', BINARY['/theme.mp3'].buffer.slice(0) as ArrayBuffer)]);
    const replacement = new Uint8Array([99, 98, 97, 96, 95, 94, 93, 92]);
    await push([localFile('/theme.mp3', replacement.buffer.slice(0) as ArrayBuffer)]);

    const [pulled] = await pull();

    expect(Array.from(new Uint8Array(pulled.content as ArrayBuffer))).toEqual(Array.from(replacement));
  });
});
