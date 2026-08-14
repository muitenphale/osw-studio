// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';

vi.mock('@/lib/utils', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// VirtualServer makes a blob URL per asset; jsdom has no implementation.
let blobCounter = 0;
URL.createObjectURL = (() => `blob:http://localhost/${++blobCounter}`) as typeof URL.createObjectURL;
URL.revokeObjectURL = (() => {}) as typeof URL.revokeObjectURL;

/**
 * How many times one compile reads the project.
 *
 * `processInternalReferences` runs per HTML file and used to call `listDirectory` itself, purely
 * to answer whether a referenced path exists. `listDirectory` goes to `adapter.listFiles`, which
 * returns every file *including its content* and is not cached, so a compile read the whole
 * project once per page. On a 621-page project that is the project read 621 times, and the
 * preview reported "Compile timed out after 30000ms" without anything having stalled.
 *
 * Asserting the read count rather than elapsed time: the cost is the reads, and a timing
 * assertion would be flaky on a loaded machine while saying less.
 */
describe('compileProject project reads', () => {
  beforeEach(async () => {
    globalThis.indexedDB = new IDBFactory();
    vi.resetModules();
  });

  async function compileWithPages(pageCount: number) {
    const { vfs } = await import('@/lib/vfs');
    const { VirtualServer } = await import('../virtual-server');
    await vfs.init();

    const project = await vfs.createProject('Reads', 'fixture');
    for (let i = 0; i < pageCount; i++) {
      await vfs.createFile(
        project.id,
        `/page-${i}.html`,
        `<html><body><img src="/img/logo.png"><a href="/page-0.html">l</a></body></html>`,
        { silent: true }
      );
    }
    await vfs.createFile(project.id, '/img/logo.png', 'binary-ish', { silent: true });
    // Nothing links to this one. A page carrying the whole map carries this asset's blob URL too,
    // which is what tells a baked map from an injected one.
    await vfs.createFile(project.id, '/img/unreferenced.png', 'nobody-links-me', { silent: true });

    const listFiles = vi.spyOn(vfs.getStorageAdapter(), 'listFiles');
    const server = new VirtualServer(vfs as never, project.id, { runtime: 'static' });
    const compiled = await server.compileProject();

    return { reads: listFiles.mock.calls.length, compiled };
  }

  it('does not read the project again for each page', async () => {
    const few = await compileWithPages(3);
    const many = await compileWithPages(30);

    // Ten times the pages must not mean ten times the reads.
    expect(many.reads).toBe(few.reads);
    // A fixed two, whatever the page count. Pinned rather than bounded so that a change which
    // reintroduces a per-project read has to be a deliberate edit here, not a number under a cap.
    expect(many.reads).toBe(2);
  });

  it('does not carry a copy of the blob-URL map in every page', async () => {
    // The map is the same for every page, so baking it into each one cost a project of several
    // hundred pages a copy per page. Whoever renders the compiled page supplies it instead:
    // the preview host and the thumbnail capture both inject `window.__oswVfsBlobUrls`.
    const { compiled } = await compileWithPages(2);
    const page = String(compiled.files.find((f) => f.path === '/page-0.html')?.content);

    expect(page).toContain('VFS Asset Interceptor');
    expect(page).toContain('__oswVfsBlobUrls');

    // The page holds no map of its own. Asserted through an asset the page never refers to: its
    // blob URL can only appear here by having been baked in wholesale, which catches a map carried
    // under any name. Matching on the name of the variable that used to hold it would not.
    const unreferenced = compiled.blobUrls.get('/img/unreferenced.png');
    expect(unreferenced).toBeTruthy();
    expect(page).not.toContain(unreferenced);
    // The asset the page does refer to is still resolved, so absence above means absence of the
    // map rather than absence of blob URLs altogether.
    expect(page).toContain(compiled.blobUrls.get('/img/logo.png'));
  });

  it('still resolves asset references against what the project holds', async () => {
    // The path set replaced a scan of the file records; a page's references must still be
    // rewritten to blob URLs, and a reference to a file that is not there left alone.
    const { compiled } = await compileWithPages(1);
    const page = compiled.files.find((f) => f.path === '/page-0.html');

    expect(String(page?.content)).toContain('blob:http://localhost/');
    expect(String(page?.content)).not.toContain('src="/img/logo.png"');
    expect(String(page?.content)).toContain('href="/page-0.html"');
  });
});
