// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import JSZip from 'jszip';

/**
 * Template files carry `content: string | ArrayBuffer`, and an .oswt archive keeps them inside
 * template.json. JSON.stringify turns an ArrayBuffer into `{}`, and import reads the file list
 * straight back out of that JSON — so every image and font in a template was lost on export.
 */

vi.mock('@/lib/utils', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
// Importing a template fires a background push; keep the test off the network.
vi.mock('../auto-sync', () => ({ autoSyncTemplate: vi.fn() }));

import { templateService } from '../template-service';

const PNG_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 250]);

const METADATA = {
  name: 'Binary Template',
  description: 'A template that contains an image file',
  version: '1.0.0',
  license: 'personal' as const,
  tags: [],
};

/** Minimal stand-in for the VFS surface exportProjectAsTemplate uses. */
function fakeVfs() {
  return {
    getProject: async () => ({ id: 'p1', settings: { runtime: 'static' } }),
    getAllFilesAndDirectories: async () => [
      { type: 'file', path: '/index.html', content: '<h1>hi</h1>' },
      { type: 'file', path: '/logo.png', content: PNG_BYTES.buffer },
    ],
    getStorageAdapter: () => ({}),
  };
}

async function readTemplateJson(blob: Blob): Promise<any> {
  const zip = await new JSZip().loadAsync(blob);
  return JSON.parse(await zip.file('template.json')!.async('string'));
}

function bytesOf(content: unknown): number[] {
  return Array.from(new Uint8Array(content as ArrayBuffer));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('.oswt template export', () => {
  it('encodes binary file content instead of writing an empty object', async () => {
    const blob = await templateService.exportProjectAsTemplate(fakeVfs(), 'p1', METADATA);
    const json = await readTemplateJson(blob);

    const png = json.files.find((f: any) => f.path === '/logo.png');
    expect(png.content).not.toEqual({});
    expect(png.encoding).toBe('base64');
    expect(Buffer.from(png.content, 'base64')).toEqual(Buffer.from(PNG_BYTES));

    // Text content is untouched and carries no encoding marker.
    const html = json.files.find((f: any) => f.path === '/index.html');
    expect(html.content).toBe('<h1>hi</h1>');
    expect(html.encoding).toBeUndefined();
  });

  it('round-trips binary content back to an ArrayBuffer on import', async () => {
    const blob = await templateService.exportProjectAsTemplate(fakeVfs(), 'p1', METADATA);
    const file = new File([blob], 'template.oswt');

    const imported = await templateService.importTemplateFile(file);

    const png = imported.files.find((f) => f.path === '/logo.png')!;
    expect(Object.prototype.toString.call(png.content)).toBe('[object ArrayBuffer]');
    expect(bytesOf(png.content)).toEqual(Array.from(PNG_BYTES));

    const html = imported.files.find((f) => f.path === '/index.html')!;
    expect(html.content).toBe('<h1>hi</h1>');
  });

  it('still reads older archives that stored plain text content', async () => {
    const legacy = {
      version: '1.0.0',
      name: 'Legacy',
      description: 'An archive written before binary encoding existed',
      templateVersion: '1.0.0',
      license: 'personal',
      tags: [],
      directories: [],
      files: [{ path: '/index.html', content: '<h1>legacy</h1>' }],
    };
    const zip = new JSZip();
    zip.file('template.json', JSON.stringify(legacy));
    const file = new File([await zip.generateAsync({ type: 'blob' })], 'legacy.oswt');

    const imported = await templateService.importTemplateFile(file);

    expect(imported.files[0].content).toBe('<h1>legacy</h1>');
  });
});

describe('applying a custom template to a project', () => {
  it('hands binary content over base64-encoded rather than decoding it as text', async () => {
    const { customTemplateToProjectTemplate } = await import('../templates/utils');

    const converted = customTemplateToProjectTemplate({
      name: 'Binary Template',
      description: 'has an image',
      files: [
        { path: '/index.html', content: '<h1>hi</h1>' },
        { path: '/logo.png', content: PNG_BYTES.buffer },
      ],
      directories: [],
    });

    const png = converted.files.find((f) => f.path === '/logo.png')!;
    expect(png.isBase64).toBe(true);
    // TextDecoder would have reinterpreted these bytes as UTF-8 and lost them.
    expect(Buffer.from(png.content, 'base64')).toEqual(Buffer.from(PNG_BYTES));

    const html = converted.files.find((f) => f.path === '/index.html')!;
    expect(html.content).toBe('<h1>hi</h1>');
    expect(html.isBase64).toBeUndefined();
  });
});

describe('re-exporting a saved template', () => {
  const saved = {
    id: 't1',
    name: 'Saved Template',
    description: 'A saved template that contains an image file',
    version: '2.1.0',
    files: [
      { path: '/index.html', content: '<h1>hi</h1>' },
      { path: '/logo.png', content: PNG_BYTES.buffer },
    ],
    directories: [],
    metadata: {
      author: 'Otto',
      license: 'mit',
      tags: ['demo'],
      thumbnail: 'data:image/png;base64,AAAA',
    },
    importedAt: new Date(),
  } as any;

  it('keeps binary content and the template details', async () => {
    const json = await readTemplateJson(await templateService.exportTemplateAsFile(saved));

    const png = json.files.find((f: any) => f.path === '/logo.png');
    expect(png.encoding).toBe('base64');
    expect(Buffer.from(png.content, 'base64')).toEqual(Buffer.from(PNG_BYTES));

    // The metadata this release moved into the flat .oswt shape.
    expect(json.author).toBe('Otto');
    expect(json.license).toBe('mit');
    expect(json.tags).toEqual(['demo']);
    expect(json.thumbnail).toBe('data:image/png;base64,AAAA');
    expect(json.templateVersion).toBe('2.1.0');
  });

  it('writes only template.json — every reader ignores per-file entries', async () => {
    const blob = await templateService.exportTemplateAsFile(saved);
    const zip = await new JSZip().loadAsync(blob);

    expect(Object.keys(zip.files)).toEqual(['template.json']);
  });

  it('round-trips back through import with its binary intact', async () => {
    const blob = await templateService.exportTemplateAsFile(saved);
    const imported = await templateService.importTemplateFile(new File([blob], 'saved.oswt'));

    const png = imported.files.find((f) => f.path === '/logo.png')!;
    expect(Object.prototype.toString.call(png.content)).toBe('[object ArrayBuffer]');
    expect(bytesOf(png.content)).toEqual(Array.from(PNG_BYTES));
    expect(imported.metadata.author).toBe('Otto');
  });
});
