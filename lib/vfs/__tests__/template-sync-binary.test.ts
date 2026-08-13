import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { encodeTemplateFiles, decodeTemplateFiles } from '../binary-encoding';

/**
 * Syncing a custom template to the server and back.
 *
 * The template travels as JSON and is stored as JSON on the server, so its file contents have to be
 * encoded at that boundary. Without it an ArrayBuffer becomes `{}` on the way out; the server keeps
 * the empty object, then reports itself newer and the Pull button writes that empty copy over the
 * good local one.
 */

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 250]);

function templateWithImage() {
  return {
    id: 't1',
    name: 'Has an image',
    description: 'a template containing a binary file',
    version: '1.0.0',
    files: [
      { path: '/index.html', content: '<h1>hi</h1>' },
      { path: '/logo.png', content: PNG.buffer.slice(0) as ArrayBuffer },
    ],
    directories: [],
    metadata: { license: 'personal', tags: [] },
    importedAt: new Date('2026-07-30T10:00:00.000Z'),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', mocks.fetch);
});
afterEach(() => vi.unstubAllGlobals());

describe('template file encoding', () => {
  it('survives the JSON round trip the sync uses', () => {
    const encoded = encodeTemplateFiles(templateWithImage().files);

    // What actually goes over the wire.
    const overTheWire = JSON.parse(JSON.stringify(encoded));
    const png = overTheWire.find((f: { path: string }) => f.path === '/logo.png');
    expect(png.content).not.toEqual({});

    const decoded = decodeTemplateFiles(overTheWire);
    const restored = decoded.find((f) => f.path === '/logo.png')!;
    expect(Object.prototype.toString.call(restored.content)).toBe('[object ArrayBuffer]');
    expect(Array.from(new Uint8Array(restored.content as ArrayBuffer))).toEqual(Array.from(PNG));
  });

  it('leaves text files untouched', () => {
    const decoded = decodeTemplateFiles(
      JSON.parse(JSON.stringify(encodeTemplateFiles(templateWithImage().files)))
    );
    expect(decoded.find((f) => f.path === '/index.html')!.content).toBe('<h1>hi</h1>');
  });

  it('passes through templates saved before encoding existed', () => {
    const legacy = [{ path: '/index.html', content: '<h1>old</h1>' }];
    expect(decodeTemplateFiles(legacy)).toEqual(legacy);
  });
});

describe('pushing a template to the server', () => {
  it('sends the image as encoded content, not an empty object', async () => {
    const { getSyncManager } = await import('../sync-manager');
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ success: true }) });

    await getSyncManager('w1').pushTemplate(templateWithImage());

    const body = JSON.parse(mocks.fetch.mock.calls[0][1].body);
    const png = body.template.files.find((f: { path: string }) => f.path === '/logo.png');
    expect(png.content).not.toEqual({});
    expect(png.encoding).toBe('base64');
    expect(Buffer.from(png.content, 'base64')).toEqual(Buffer.from(PNG));
  });

  it('encodes every template in a bulk push too', async () => {
    const { getSyncManager } = await import('../sync-manager');
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ success: true }) });

    await getSyncManager('w1').pushTemplates([templateWithImage()]);

    const body = JSON.parse(mocks.fetch.mock.calls[0][1].body);
    const png = body.templates[0].files.find((f: { path: string }) => f.path === '/logo.png');
    expect(png.encoding).toBe('base64');
    expect(Buffer.from(png.content, 'base64')).toEqual(Buffer.from(PNG));
  });
});

/**
 * A template made from a project carries that project's whole file set
 * (`lib/vfs/template-service.ts`), so it hits the same request body limit a project push does.
 * Next truncates past the limit rather than refusing, so the failure reads as corrupt JSON.
 */
describe('pushing a template too large for one request', () => {
  const big = 'x'.repeat(3 * 1024 * 1024);

  function bigTemplate() {
    return {
      ...templateWithImage(),
      files: [
        { path: '/a.txt', content: big },
        { path: '/b.txt', content: big },
        { path: '/c.txt', content: big },
      ],
    };
  }

  it('sends it in batches, appending to what the first request stored', async () => {
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ template: { files: [] }, action: 'created' }) });

    const { getSyncManager } = await import('../sync-manager');
    const result = await getSyncManager('w1').pushTemplate(bigTemplate() as never);

    const bodies = mocks.fetch.mock.calls.map((call) => JSON.parse(call[1].body));
    expect(bodies.length).toBeGreaterThan(1);
    // The first request stores the record; the rest add their files to it, or each would
    // overwrite the files the one before it wrote.
    expect(bodies.map((b) => b.appendFiles)).toEqual([false, ...bodies.slice(1).map(() => true)]);
    expect(bodies.flatMap((b) => b.template.files.map((f: { path: string }) => f.path)).sort())
      .toEqual(['/a.txt', '/b.txt', '/c.txt']);
    expect(result.success).toBe(true);
  });

  it('stops at the first request the server rejects', async () => {
    mocks.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ template: { files: [] } }) })
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: 'boom' }) });

    const { getSyncManager } = await import('../sync-manager');
    const result = await getSyncManager('w1').pushTemplate(bigTemplate() as never);

    expect(result).toEqual({ success: false, error: 'boom' });
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });
});
