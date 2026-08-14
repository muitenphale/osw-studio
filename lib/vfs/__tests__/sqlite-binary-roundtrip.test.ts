import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { SQLiteAdapter } from '../adapters/sqlite-adapter';
import { getFileTypeFromPath, isTextExtension, type VirtualFile } from '../types';

/**
 * Binary content used to survive storage only if its extension was on an allow-list.
 * Writes were content-driven (an ArrayBuffer became base64) while reads only decoded 'image' and
 * 'video', so audio, fonts, PDFs and anything unrecognised came back as a base64 string instead of
 * bytes — silently, as a file the app then treated as text.
 *
 * Storage now records HOW it encoded the content, so the round trip is generic.
 */

const BYTES: Record<string, Uint8Array> = {
  '/logo.png': new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 250]),
  '/theme.mp3': new Uint8Array([0xff, 0xfb, 0x90, 0x64, 0x00, 0x0f, 0xf0, 0x00]),
  '/body.woff2': new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0x00, 0x01, 0x00, 0x00]),
  '/manual.pdf': new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]),
  '/clip.webm': new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x00, 0x00, 0x00]),
};

let dir: string;
let adapter: SQLiteAdapter;

async function writeFile(projectId: string, filePath: string, content: string | ArrayBuffer) {
  const file: VirtualFile = {
    id: `f${filePath}`,
    projectId,
    path: filePath,
    name: filePath.slice(1),
    type: getFileTypeFromPath(filePath),
    content,
    size: 8,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as VirtualFile;
  await adapter.createFile(file);
  return file;
}

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'osws-sqlite-'));
  adapter = new SQLiteAdapter(path.join(dir, 'osws.sqlite'));
  await adapter.init();
  await adapter.createProject({
    id: 'p1',
    name: 'Binary',
    createdAt: new Date(),
    updatedAt: new Date(),
    settings: {},
  } as never);
});

afterEach(async () => {
  await adapter.close?.();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('SQLite file content round-trip', () => {
  it.each(Object.keys(BYTES))('preserves the bytes of %s', async (filePath) => {
    const original = BYTES[filePath];
    await writeFile('p1', filePath, original.buffer.slice(0) as ArrayBuffer);

    const read = await adapter.getFile('p1', filePath);

    expect(read).not.toBeNull();
    expect(Object.prototype.toString.call(read!.content)).toBe('[object ArrayBuffer]');
    expect(Array.from(new Uint8Array(read!.content as ArrayBuffer))).toEqual(Array.from(original));
  });

  it('leaves text content as a string', async () => {
    await writeFile('p1', '/index.html', '<h1>hi</h1>');

    const read = await adapter.getFile('p1', '/index.html');

    expect(read!.content).toBe('<h1>hi</h1>');
  });

  it('survives an update as well as a create', async () => {
    const file = await writeFile('p1', '/theme.mp3', BYTES['/theme.mp3'].buffer.slice(0) as ArrayBuffer);
    const replacement = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    await adapter.updateFile({ ...file, content: replacement.buffer.slice(0) as ArrayBuffer });

    const read = await adapter.getFile('p1', '/theme.mp3');

    expect(Array.from(new Uint8Array(read!.content as ArrayBuffer))).toEqual(Array.from(replacement));
  });

  // Decoding is driven by the recorded encoding alone — the file's type is never consulted, which
  // is the whole point: an extension guess is what lost audio, fonts and PDFs. Rows predating the
  // column are labelled by the v10 migration (see sqlite-migration-v10.test.ts), so nothing at
  // runtime has to infer anything.
  it('decodes on the recorded encoding, not on the file type', async () => {
    const png = BYTES['/logo.png'];
    await writeFile('p1', '/a.png', png.buffer.slice(0) as ArrayBuffer);
    const db = (adapter as unknown as { getDB(): { prepare(s: string): { run(...a: unknown[]): void; get(...a: unknown[]): unknown } } }).getDB();

    // An image row records how it was stored, like every other binary. This adapter is backed by a
    // file, so it has a blob store to write to and the row holds a hash; an adapter with nowhere to
    // put the bytes records 'base64' instead.
    const stored = db.prepare('SELECT encoding FROM files WHERE path = ?').get('/a.png') as { encoding: string | null };
    expect(stored.encoding).toBe('blob');

    // Strip the flag and the same row is text, despite still being typed 'image'.
    db.prepare('UPDATE files SET encoding = NULL WHERE path = ?').run('/a.png');
    const read = await adapter.getFile('p1', '/a.png');
    expect(typeof read!.content).toBe('string');
  });
});

describe('file type classification', () => {
  it.each([
    ['/a.mp3', 'audio'],
    ['/a.wav', 'audio'],
    ['/a.flac', 'audio'],
    ['/a.woff2', 'font'],
    ['/a.ttf', 'font'],
    ['/a.pdf', 'binary'],
    ['/a.png', 'image'],
    ['/a.mp4', 'video'],
    ['/a.html', 'html'],
    ['/a.md', 'text'],
  ])('classifies %s as %s', (filePath, expected) => {
    expect(getFileTypeFromPath(filePath)).toBe(expected);
  });

  it.each(['/a.png', '/a.mp4', '/a.mp3', '/a.woff2', '/a.pdf'])(
    'reads %s as bytes',
    (filePath) => {
      expect(isTextExtension(filePath)).toBe(false);
    }
  );

  // The default that matters: an unrecognised extension is bytes, not text. Reading unknown bytes
  // as text destroys them, so a format nobody enumerated still survives.
  it.each(['/model.glb', '/mod.wasm', '/save.dat', '/archive.7z', '/noextension'])(
    'treats the unrecognised %s as binary',
    (filePath) => {
      expect(getFileTypeFromPath(filePath)).toBe('binary');
      expect(isTextExtension(filePath)).toBe(false);
    }
  );

  it.each(['/a.html', '/a.css', '/a.js', '/a.json', '/a.md', '/a.hbs'])(
    'still reads %s as text',
    (filePath) => {
      expect(isTextExtension(filePath)).toBe(true);
    }
  );
});
