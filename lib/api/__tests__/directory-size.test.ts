import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { combinedDirectorySize, directorySize } from '../directory-size';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'osws-dirsize-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const write = (rel: string, bytes: number) => {
  const target = path.join(dir, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, Buffer.alloc(bytes, 1));
  return target;
};

describe('measuring what a workspace occupies', () => {
  it('adds up files across nested directories', () => {
    write('a.bin', 1000);
    write('nested/b.bin', 2000);

    expect(directorySize(dir)).toBe(3000);
  });

  it('counts shared content once, however many paths point at it', () => {
    // What a published deployment does: the blob and the served file are one set of bytes.
    const blob = write('blobs/abc', 5000);
    fs.mkdirSync(path.join(dir, 'deployments', 'd1'), { recursive: true });
    fs.linkSync(blob, path.join(dir, 'deployments', 'd1', 'img.png'));

    // 5000, not 10000: publishing an image does not double what the workspace occupies.
    expect(directorySize(dir)).toBe(5000);
  });

  it('counts it once across separately measured directories too', () => {
    // The deployment output can live outside the workspace directory, so the caller measures both
    // and the shared bytes still have to count once.
    const store = path.join(dir, 'data');
    const served = path.join(dir, 'static');
    fs.mkdirSync(store, { recursive: true });
    fs.mkdirSync(served, { recursive: true });
    const blob = path.join(store, 'abc');
    fs.writeFileSync(blob, Buffer.alloc(4000, 1));
    fs.linkSync(blob, path.join(served, 'img.png'));

    expect(combinedDirectorySize([store, served])).toBe(4000);
    // Measured apart, each sees the full size — which is why they are measured together.
    expect(directorySize(store) + directorySize(served)).toBe(8000);
  });

  it('returns zero for a directory that is not there', () => {
    expect(directorySize(path.join(dir, 'missing'))).toBe(0);
  });
});
