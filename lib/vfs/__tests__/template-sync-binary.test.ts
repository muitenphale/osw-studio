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
