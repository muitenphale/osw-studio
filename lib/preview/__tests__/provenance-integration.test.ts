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

import { VirtualServer } from '../virtual-server';
import { vfs } from '@/lib/vfs';
import { compileStaticSite } from '@/lib/publishing/compile-static-site';
import type { CompiledProject } from '../types';

// One IDBFactory for the file, one project per test. `compile-project-reads.test.ts` swaps the
// factory per test instead, but it can only do that because it pairs the swap with
// `vi.resetModules()` and a dynamic re-import — `vfs` is a module singleton that caches its open
// database handle, so swapping the factory under a statically imported `vfs` leaves it talking to
// the discarded one.
globalThis.indexedDB = new IDBFactory();

const contentOf = (c: CompiledProject, path: string): string =>
  String(c.files.find(f => f.path === path)?.content ?? '');

let projectSeq = 0;

/** `createProject(name, description?, id?)` — the id is the third positional argument. */
async function seed(files: Record<string, string>): Promise<string> {
  await vfs.init();
  const project = await vfs.createProject('Provenance', 'fixture', `p-provenance-${++projectSeq}`);
  for (const [path, content] of Object.entries(files)) {
    await vfs.createFile(project.id, path, content, { silent: true });
  }
  return project.id;
}

describe('VirtualServer provenance option', () => {
  beforeEach(() => { blobCounter = 0; });

  it('emits no provenance by default', async () => {
    const id = await seed({ '/index.html': '<html><body><p>hi</p></body></html>' });
    const compiled = await new VirtualServer(vfs, id, { runtime: 'static' }).compileProject();
    expect(contentOf(compiled, '/index.html')).not.toContain('data-osw-src');
  });

  it('emits provenance when asked', async () => {
    const id = await seed({ '/index.html': '<html><body><p>hi</p></body></html>' });
    const compiled = await new VirtualServer(vfs, id, { runtime: 'static', provenance: true }).compileProject();
    expect(contentOf(compiled, '/index.html')).toContain('<p data-osw-src="/index.html:');
  });

  it('never emits the attribute twice on one tag', async () => {
    // The handlebars path runs an extra compile step. Injecting in both processHTML and
    // processHandlebarsTemplates would double-tag, and a naive count assertion would not notice.
    const id = await seed({
      '/index.html': '<html><body><main><p>hi</p></main></body></html>',
      '/data.json': '{}',
    });
    const compiled = await new VirtualServer(vfs, id, { runtime: 'handlebars', provenance: true }).compileProject();
    const html = contentOf(compiled, '/index.html');
    expect(html).not.toMatch(/data-osw-src="[^"]*"\s+data-osw-src=/);
    // One attribute per source tag: main and p. Pins the count as well as the adjacency, so a
    // double-tag that somehow landed non-adjacently still fails.
    expect(html.match(/data-osw-src=/g)).toHaveLength(2);
  });

  it('names the partial\'s own file for an element inside a partial', async () => {
    const id = await seed({
      '/index.html': '<html><body>{{> navigation}}</body></html>',
      '/templates/navigation.hbs': '<nav><a href="/">Home</a></nav>',
      '/data.json': '{}',
    });
    const compiled = await new VirtualServer(vfs, id, { runtime: 'handlebars', provenance: true }).compileProject();
    const html = contentOf(compiled, '/index.html');
    expect(html).toContain('<nav data-osw-src="/templates/navigation.hbs:');
    expect(html).not.toContain('<nav data-osw-src="/index.html:');
  });

  it('gives every rendered instance of a loop the same source index', async () => {
    const id = await seed({
      '/index.html': '<html><body>{{#each posts}}<article>{{title}}</article>{{/each}}</body></html>',
      '/data.json': JSON.stringify({ posts: [{ title: 'a' }, { title: 'b' }, { title: 'c' }] }),
    });
    const compiled = await new VirtualServer(vfs, id, { runtime: 'handlebars', provenance: true }).compileProject();
    const matches = contentOf(compiled, '/index.html').match(/<article data-osw-src="([^"]+)"/g) ?? [];
    expect(matches).toHaveLength(3);
    expect(new Set(matches).size).toBe(1);
  });

  it('keeps the doctype first', async () => {
    const id = await seed({ '/index.html': '<!DOCTYPE html>\n<html>\n<head></head>\n<body><p>x</p></body>\n</html>' });
    const compiled = await new VirtualServer(vfs, id, { runtime: 'static', provenance: true }).compileProject();
    expect(contentOf(compiled, '/index.html').trimStart().startsWith('<!DOCTYPE html>')).toBe(true);
  });

  it('survives asset-reference rewriting unchanged', async () => {
    // processInternalReferences rewrites on /src="([^"]+)"/g and /href="([^"]+)"/g. Neither is
    // anchored, so `src="…"` substring-matches the tail of `data-osw-src="…"` and the rewriter does
    // inspect every provenance value. It leaves them alone only because `<path>:<index>` never
    // resolves to a project path — a property, not a guard. This pins it.
    const id = await seed({
      '/index.html':
        '<html><head><link rel="stylesheet" href="/styles.css"></head>' +
        '<body><img src="/logo.png" alt="logo"><a href="/guide.pdf">g</a><p>hi</p></body></html>',
      '/styles.css': 'body{color:red}',
      '/logo.png': 'png-bytes',
      '/guide.pdf': 'pdf-bytes',
    });
    const compiled = await new VirtualServer(vfs, id, { runtime: 'static', provenance: true }).compileProject();
    const html = contentOf(compiled, '/index.html');

    // The rewriter really ran over this document, on both pattern families — otherwise the
    // provenance assertions below would hold vacuously. The img's provenance attribute sits
    // immediately before the src it rewrote, so the scan demonstrably passed through one to
    // reach the other.
    expect(html).toMatch(/<img data-osw-src="[^"]*" src="blob:/);
    expect(html).toMatch(/<a data-osw-src="[^"]*" href="blob:/);
    // The stylesheet is deliberately not asserted to be a blob: CSS blob URLs are created in a
    // pass that runs after HTML processing, so `<link href>` still holds the project path here
    // and the injected VFS interceptor resolves it at runtime.

    const values = [...html.matchAll(/data-osw-src="([^"]*)"/g)].map(m => m[1]);
    expect(values).toHaveLength(3); // img, a, p — link/head/body are excluded from tagging
    for (const value of values) {
      expect(value.startsWith('/')).toBe(true);
      expect(value).not.toContain('blob:');
    }
  });

  it('publish output carries no provenance', async () => {
    const id = await seed({ '/index.html': '<html><body><p>hi</p></body></html>' });
    const result = await compileStaticSite(vfs, id);
    expect(JSON.stringify(result)).not.toContain('data-osw-src');
  });
});
