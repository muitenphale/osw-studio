// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';

vi.mock('@/lib/utils', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// VirtualServer makes a blob URL per asset; jsdom has no implementation. Each URL names its file,
// so a test can tell which file a reference was pointed at.
let current = '';
URL.createObjectURL = (() => `blob:test/${current}`) as typeof URL.createObjectURL;
URL.revokeObjectURL = (() => {}) as typeof URL.revokeObjectURL;
const RealBlob = globalThis.Blob;

/**
 * A stylesheet's relative url() resolves against the stylesheet's own folder, as a browser does. It
 * was resolved from the project root, so a self-hosted font's `url("./x.woff2")` found nothing,
 * stayed relative inside a blob: stylesheet, and the font (or icon font) was missing in the preview.
 */
describe('url() in a stylesheet, in the preview', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    vi.resetModules();
  });

  async function compiledCss(files: Record<string, string>, cssPath: string) {
    const { vfs } = await import('@/lib/vfs');
    const { VirtualServer } = await import('../virtual-server');
    await vfs.init();
    const project = await vfs.createProject('Fonts', 'fixture');
    for (const [path, content] of Object.entries(files)) await vfs.createFile(project.id, path, content, { silent: true });

    // Name each blob after the path being compiled, read off the Blob's content.
    const byContent = new Map(Object.entries(files).map(([p, c]) => [c, p]));
    globalThis.Blob = class extends RealBlob {
      constructor(parts: BlobPart[], opts?: BlobPropertyBag) {
        super(parts, opts);
        const text = parts.map((p) => (typeof p === 'string' ? p : '')).join('');
        current = byContent.get(text) ?? 'css';
      }
    } as typeof Blob;

    const server = new VirtualServer(vfs as never, project.id, { runtime: 'static' });
    const compiled = await server.compileProject();
    globalThis.Blob = RealBlob;
    const css = compiled.files.find((f) => f.path === cssPath);
    return String(css?.content ?? '');
  }

  it('resolves ./, a subfolder and ../ from the stylesheet’s folder', async () => {
    const css = await compiledCss({
      '/index.html': '<html><head><link rel="stylesheet" href="/assets/fonts/icons/style.css"></head><body></body></html>',
      '/assets/fonts/icons/style.css':
        '@font-face { src: url("./Icons.woff2") format("woff2"); }\n' +
        '@font-face { src: url(files/sub.woff2); }\n' +
        '.bg { background: url(\'../../bg.png\'); }',
      '/assets/fonts/icons/Icons.woff2': 'icons-font',
      '/assets/fonts/icons/files/sub.woff2': 'sub-font',
      '/assets/bg.png': 'bg-image',
    }, '/assets/fonts/icons/style.css');

    expect(css).toContain("url('blob:test//assets/fonts/icons/Icons.woff2')");
    expect(css).toContain("url('blob:test//assets/fonts/icons/files/sub.woff2')");
    expect(css).toContain("url('blob:test//assets/bg.png')");
    expect(css).not.toMatch(/url\(["']?\.\//);
  });

  it('keeps a fragment and ignores a query when looking the file up', async () => {
    const css = await compiledCss({
      '/index.html': '<html><head></head><body></body></html>',
      '/fonts/f.css': '@font-face { src: url("./F.svg?v=2#F") format("svg"); }',
      '/fonts/F.svg': 'svg-font',
    }, '/fonts/f.css');

    expect(css).toContain("url('blob:test//fonts/F.svg#F')");
  });

  it('still finds root-absolute references, and leaves remote ones alone', async () => {
    const css = await compiledCss({
      '/index.html': '<html><head></head><body></body></html>',
      '/styles/site.css': '.a { background: url(/img/a.png); } .b { background: url(https://cdn.example/b.png); }',
      '/img/a.png': 'a-image',
    }, '/styles/site.css');

    expect(css).toContain("url('blob:test//img/a.png')");
    expect(css).toContain('url(https://cdn.example/b.png)');
  });
});
