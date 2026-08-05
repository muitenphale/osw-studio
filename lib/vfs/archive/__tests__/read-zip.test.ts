import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { readZipArchive, MAX_ENTRIES, MAX_TOTAL_BYTES, MAX_FILE_SIZE } from '../read-zip';

async function zipFile(
  build: (z: JSZip) => void,
  options?: JSZip.JSZipGeneratorOptions<'blob'>
): Promise<File> {
  const zip = new JSZip();
  build(zip);
  const blob = await zip.generateAsync({ type: 'blob', ...options });
  return new File([blob], 'test.zip', { type: 'application/zip' });
}

/**
 * Rewrite the uncompressed-size field of every local and central header, so the archive claims a
 * size it does not have. An attacker writes the central directory, so nothing in it is evidence.
 */
async function lieAboutUncompressedSize(file: File, declared: number): Promise<File> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer);
  for (let i = 0; i + 4 <= bytes.length; i++) {
    const signature = view.getUint32(i, true);
    // Local file header: uncompressed size at +22. Central directory header: at +24.
    if (signature === 0x04034b50 && i + 26 <= bytes.length) view.setUint32(i + 22, declared, true);
    if (signature === 0x02014b50 && i + 28 <= bytes.length) view.setUint32(i + 24, declared, true);
  }
  return new File([bytes], file.name, { type: file.type });
}

function decode(buffer: ArrayBuffer): string {
  return new TextDecoder().decode(buffer);
}

describe('readZipArchive', () => {
  it('normalizes entries to project paths', async () => {
    const file = await zipFile((z) => {
      z.file('index.html', 'hi');
      z.file('a/b.css', 'x');
    });
    const { entries, issues } = await readZipArchive(file);
    expect(entries.map((e) => e.path).sort()).toEqual(['/a/b.css', '/index.html']);
    expect(issues).toEqual([]);
  });

  it('skips directory entries', async () => {
    const file = await zipFile((z) => {
      z.folder('empty');
      z.file('a.txt', 'x');
    });
    const { entries } = await readZipArchive(file);
    expect(entries).toHaveLength(1);
    expect(entries[0].path).toBe('/a.txt');
  });

  it('rejects a traversal entry and reports it, without dropping the good ones', async () => {
    const file = await zipFile((z) => {
      z.file('../../evil.txt', 'bad');
      z.file('ok.txt', 'good');
    });
    const { entries, issues } = await readZipArchive(file);
    expect(entries.map((e) => e.path)).toEqual(['/ok.txt']);
    expect(issues[0]).toMatchObject({ code: 'path-rejected' });
  });

  it('shows the name as written in the archive, not the resolved one, on a rejected path', async () => {
    const file = await zipFile((z) => z.file('../../evil.txt', 'bad'));
    const { issues } = await readZipArchive(file);
    expect(issues[0].path).toBe('../../evil.txt');
  });

  it('accepts an ordinary archive whose stored names carry ./ and // segments', async () => {
    // loadAsync resolves those away too, so a name/unsafeOriginalName mismatch is not a signal.
    const file = await zipFile((z) => {
      z.file('./index.html', 'hi');
      z.file('a//b.css', 'x');
    });
    const { entries, issues } = await readZipArchive(file);
    expect(issues).toEqual([]);
    expect(entries.map((e) => e.path).sort()).toEqual(['/a/b.css', '/index.html']);
  });

  it('emits one entry per path when two stored names normalize to the same one', async () => {
    // 'a.txt' and '/a.txt' survive loadAsync as two separate entries — the resolver keeps the
    // leading slash. Two entries at one path would let a second copy shadow whatever the preview
    // classified for the first, so the later one is refused rather than merged.
    const file = await zipFile((z) => {
      z.file('a.txt', 'first');
      z.file('/a.txt', 'second');
    });
    const { entries, issues } = await readZipArchive(file);
    expect(entries.map((e) => e.path)).toEqual(['/a.txt']);
    expect(decode(await entries[0].read())).toBe('first');
    expect(issues[0]).toMatchObject({ code: 'path-rejected', path: '/a.txt' });
  });

  it('refuses an oversized file before it is parsed at all', async () => {
    // loadAsync reads the whole central directory before any entry budget can act, so a flood of
    // headers exhausts memory upstream of every other guard here. The input size is the only
    // thing that can be checked first, and the bytes are not even handed to JSZip.
    const notAZip = new File([new Uint8Array(64)], 'huge.zip');
    // A parse would fail with the corrupt-zip wording, so this message proves the ordering.
    await expect(readZipArchive(notAZip, { maxFileSize: 32 })).rejects.toThrow(/limit|large/i);
    await expect(readZipArchive(notAZip, { maxFileSize: 32 })).rejects.not.toThrow(
      /could not be read/i
    );
    // A caller may tighten the cap to something small, and rounding it down to '0 KB' names a
    // limit no file could ever satisfy.
    await expect(readZipArchive(notAZip, { maxFileSize: 32 })).rejects.not.toThrow(/\b0 [KM]B\b/);
  });

  it('accepts a file exactly at the size cap', async () => {
    const file = await zipFile((z) => z.file('a.txt', 'hello'));
    const { entries } = await readZipArchive(file, { maxFileSize: file.size });
    expect(entries.map((e) => e.path)).toEqual(['/a.txt']);
  });

  it('caps the input size by default, without being told to', async () => {
    // The default has to stand on its own: a guard that only works when the caller opts in is a
    // guard the next caller forgets.
    expect(MAX_TOTAL_BYTES).toBe(200 * 1024 * 1024);
    expect(MAX_FILE_SIZE).toBe(MAX_TOTAL_BYTES);
    const oversized = { size: MAX_FILE_SIZE + 1, arrayBuffer: async () => new ArrayBuffer(0) };
    await expect(readZipArchive(oversized as unknown as File)).rejects.toThrow(/limit|large/i);
  });

  it('refuses an archive with too many entries', async () => {
    expect(MAX_ENTRIES).toBe(5000);
    const file = await zipFile((z) => {
      for (let i = 0; i < MAX_ENTRIES + 1; i++) z.file(`f${i}.txt`, 'x');
    });
    await expect(readZipArchive(file)).rejects.toThrow(/entries/i);
  }, 60_000);

  it('refuses up front when the declared uncompressed total exceeds the budget', async () => {
    const file = await zipFile((z) => z.file('big.txt', 'A'.repeat(2_000_000)));
    await expect(readZipArchive(file, { maxTotalBytes: 1_000_000 })).rejects.toThrow(/limit|large/i);
  });

  it('still enforces the budget while reading when sizes are not declared', async () => {
    // The pre-flight sum is an optimization on a private field. The running total during
    // read() is the real guard, so it must hold when uncompressedSize is unavailable.
    const file = await zipFile((z) => z.file('big.txt', 'A'.repeat(2_000_000)));
    const { entries } = await readZipArchive(file, {
      maxTotalBytes: 1_000_000,
      trustDeclaredSizes: false,
    });
    await expect(entries[0].read()).rejects.toThrow(/limit|large/i);
  });

  it('stops a file that lies about its uncompressed size', async () => {
    // The central directory is attacker-controlled, so a bomb can declare eight bytes and inflate
    // to megabytes. The pre-flight sum waves it through; the read must not.
    const honest = await zipFile((z) => z.file('bomb.txt', 'A'.repeat(2_000_000)), {
      compression: 'DEFLATE',
    });
    const file = await lieAboutUncompressedSize(honest, 8);
    const { entries } = await readZipArchive(file, { maxTotalBytes: 1_000_000 });
    expect(entries[0].declaredSize).toBe(8);
    await expect(entries[0].read()).rejects.toThrow(/limit|large/i);
  });

  it('does not hold a whole oversized file in memory before refusing it', async () => {
    const honest = await zipFile((z) => z.file('bomb.txt', 'A'.repeat(20_000_000)), {
      compression: 'DEFLATE',
    });
    const file = await lieAboutUncompressedSize(honest, 8);
    const { entries } = await readZipArchive(file, { maxTotalBytes: 1_000_000 });
    const before = process.memoryUsage().heapUsed;
    await expect(entries[0].read()).rejects.toThrow(/limit|large/i);
    // A buffer-then-check read would have materialized all 20 MB by the time it threw.
    expect(process.memoryUsage().heapUsed - before).toBeLessThan(10_000_000);
  });

  it('counts bytes across entries, not per entry', async () => {
    const file = await zipFile((z) => {
      z.file('a.txt', 'A'.repeat(600_000));
      z.file('b.txt', 'B'.repeat(600_000));
    });
    const { entries } = await readZipArchive(file, {
      maxTotalBytes: 1_000_000,
      trustDeclaredSizes: false,
    });
    const sorted = [...entries].sort((a, b) => a.path.localeCompare(b.path));
    await expect(sorted[0].read()).resolves.toBeTruthy();
    await expect(sorted[1].read()).rejects.toThrow(/limit|large/i);
  });

  it('does not charge the budget twice for re-reading one entry', async () => {
    const file = await zipFile((z) => z.file('a.txt', 'A'.repeat(600_000)));
    const { entries } = await readZipArchive(file, {
      maxTotalBytes: 1_000_000,
      trustDeclaredSizes: false,
    });
    await entries[0].read();
    await expect(entries[0].read()).resolves.toBeTruthy();
  });

  it('reads content back intact', async () => {
    const file = await zipFile((z) => z.file('a.txt', 'hello'));
    const { entries } = await readZipArchive(file);
    expect(decode(await entries[0].read())).toBe('hello');
  });

  it('reads a zero-byte file back as empty rather than hanging', async () => {
    // A stream that never emits a data event still has to reach 'end'.
    const file = await zipFile((z) => z.file('.gitkeep', ''));
    const { entries } = await readZipArchive(file);
    expect((await entries[0].read()).byteLength).toBe(0);
  });

  it('returns nothing importable, without throwing, for an archive of only folders', async () => {
    const file = await zipFile((z) => {
      z.folder('a');
      z.folder('a/b');
    });
    const { entries, issues } = await readZipArchive(file);
    expect(entries).toEqual([]);
    expect(issues).toEqual([]);
  });

  it('reports an over-long path as its own issue rather than a rejection', async () => {
    const long = `${'d'.repeat(210)}.txt`;
    const file = await zipFile((z) => {
      z.file(long, 'x');
      z.file('ok.txt', 'y');
    });
    const { entries, issues } = await readZipArchive(file);
    expect(issues[0]).toMatchObject({ code: 'path-too-long', path: long });
    expect(entries.map((e) => e.path)).toEqual(['/ok.txt']);
  });

  it('reads binary content back byte for byte', async () => {
    const original = new Uint8Array([0, 255, 13, 10, 26, 128, 7]);
    const file = await zipFile((z) => z.file('logo.png', original), { compression: 'DEFLATE' });
    const { entries } = await readZipArchive(file);
    expect(new Uint8Array(await entries[0].read())).toEqual(original);
  });

  it('declares each entry size from the archive by default', async () => {
    const file = await zipFile((z) => z.file('a.txt', 'hello'));
    const { entries } = await readZipArchive(file);
    expect(entries[0].declaredSize).toBe(5);
  });

  it('omits declared sizes when they are not trusted', async () => {
    const file = await zipFile((z) => z.file('a.txt', 'hello'));
    const { entries } = await readZipArchive(file, { trustDeclaredSizes: false });
    expect(entries[0].declaredSize).toBeUndefined();
  });

  it('reports a file that is not a zip in terms the user can act on', async () => {
    const file = new File([new Uint8Array([1, 2, 3, 4, 5])], 'notazip.zip');
    await expect(readZipArchive(file)).rejects.toThrow(/zip/i);
  });
});
