// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('@/lib/utils', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { vfs } from '@/lib/vfs';
import { applyStyleOverride, countMarkerOccurrences, OVERRIDES_PATH } from '../apply-style';
import { MARKER_ATTR } from '../marker';

// One IDBFactory for the file, one project per test — the same arrangement as
// `lib/preview/__tests__/provenance-integration.test.ts`, and for the same reason: `vfs` is a
// module singleton that caches its open database handle, so swapping the factory between tests
// under a statically imported `vfs` leaves it talking to the discarded one.
globalThis.indexedDB = new IDBFactory();

let projectSeq = 0;

/** `createProject(name, description?, id?)` — the id is the third positional argument. */
async function seed(files: Record<string, string>): Promise<string> {
  await vfs.init();
  const project = await vfs.createProject('Direct edit', 'fixture', `p-direct-${++projectSeq}`);
  for (const [path, content] of Object.entries(files)) {
    await vfs.createFile(project.id, path, content, { silent: true });
  }
  return project.id;
}

const read = async (projectId: string, path: string): Promise<string> =>
  String((await vfs.readFile(projectId, path)).content);

const src = (path: string, content: string, needle: string) =>
  `${path}:${content.indexOf(needle)}`;

const RED = { property: 'color', value: 'red' };

afterEach(() => { vi.restoreAllMocks(); });

const PAGE = '<html><head><title>t</title></head><body><p class="a">hi</p></body></html>';
const OTHER = '<html><head></head><body><p>other</p></body></html>';

describe('applyStyleOverride — first edit', () => {
  it('stamps the marker, writes the rule, and links every page', async () => {
    const projectId = await seed({ '/index.html': PAGE, '/about.html': OTHER });

    const result = await applyStyleOverride(
      projectId,
      { srcAttr: src('/index.html', PAGE, '<p'), tagName: 'p', attributes: {} },
      { property: 'padding-block', value: '3rem' },
    );

    expect(result.ok).toBe(true);
    expect(result.markerId).toMatch(/^[a-z0-9]{8}$/);

    const source = await read(projectId, '/index.html');
    // Both the marker AND the link in one file. Two writes would have clobbered one of them,
    // because the second write's content was read before the first landed.
    expect(source).toContain(`<p ${MARKER_ATTR}="${result.markerId}" class="a">hi</p>`);
    expect(source).toContain('href="/overrides.css"');
    expect(source.indexOf('/overrides.css')).toBeLessThan(source.indexOf('</head>'));

    const css = await read(projectId, OVERRIDES_PATH);
    expect(css).toContain(`[${MARKER_ATTR}="${result.markerId}"][${MARKER_ATTR}]`);
    expect(css).toContain('padding-block: 3rem;');

    expect(await read(projectId, '/about.html')).toContain('href="/overrides.css"');

    expect([...(result.filesWritten ?? [])].sort())
      .toEqual(['/about.html', '/index.html', OVERRIDES_PATH]);
    expect(result.skippedPages).toEqual([]);
  });

  it('writes the marker into the partial, not the page that includes it', async () => {
    const partial = '<nav><a href="/">Home</a></nav>';
    const projectId = await seed({
      '/index.html': '<html><head></head><body>{{> nav}}</body></html>',
      '/templates/nav.hbs': partial,
    });

    const result = await applyStyleOverride(
      projectId,
      { srcAttr: src('/templates/nav.hbs', partial, '<nav'), tagName: 'nav', attributes: {} },
      RED,
    );

    expect(result.ok).toBe(true);
    expect(await read(projectId, '/templates/nav.hbs'))
      .toBe(`<nav ${MARKER_ATTR}="${result.markerId}"><a href="/">Home</a></nav>`);
    // A partial must not grow a stylesheet link: it is included into a page's body. Nor may it be
    // reported as a page that could not be linked — every partial in the project would qualify, and
    // a warning that always fires is one the user learns to ignore.
    expect(await read(projectId, '/templates/nav.hbs')).not.toContain('overrides.css');
    expect(result.skippedPages).toEqual([]);
    // The including page still gets one, from the sweep.
    expect(await read(projectId, '/index.html')).toContain('href="/overrides.css"');
    expect(await read(projectId, '/index.html')).not.toContain(MARKER_ATTR);
  });
});

describe('applyStyleOverride — the second edit on the same element', () => {
  it('writes only /overrides.css, touching no source file', async () => {
    const projectId = await seed({ '/index.html': PAGE, '/about.html': OTHER });
    const first = await applyStyleOverride(
      projectId,
      { srcAttr: src('/index.html', PAGE, '<p'), tagName: 'p', attributes: {} },
      RED,
    );
    const sourceAfterFirst = await read(projectId, '/index.html');
    const aboutAfterFirst = await read(projectId, '/about.html');

    // No srcAttr at all: the marker on the payload is the only thing that can locate this edit.
    const second = await applyStyleOverride(
      projectId,
      { attributes: { [MARKER_ATTR]: first.markerId! }, tagName: 'p' },
      { property: 'color', value: 'blue' },
    );

    expect(second.ok).toBe(true);
    expect(second.markerId).toBe(first.markerId);
    expect(second.filesWritten).toEqual([OVERRIDES_PATH]);
    expect(await read(projectId, '/index.html')).toBe(sourceAfterFirst);
    expect(await read(projectId, '/about.html')).toBe(aboutAfterFirst);

    const css = await read(projectId, OVERRIDES_PATH);
    expect(css).toContain('color: blue;');
    expect(css).not.toContain('color: red;');
  });

  it('reuses the marker already in source when the payload did not carry it', async () => {
    // `gatherAttributes` caps its output, so an attribute-heavy element can arrive without its
    // marker. The slow path must read the existing id back out of source rather than mint a second
    // one — a fresh id would key the rule to a marker that exists nowhere in the project.
    const projectId = await seed({ '/index.html': PAGE });
    const first = await applyStyleOverride(
      projectId,
      { srcAttr: src('/index.html', PAGE, '<p'), tagName: 'p', attributes: {} },
      RED,
    );
    const stamped = await read(projectId, '/index.html');

    const second = await applyStyleOverride(
      projectId,
      { srcAttr: src('/index.html', stamped, '<p'), tagName: 'p', attributes: {} },
      { property: 'color', value: 'blue' },
    );

    expect(second.markerId).toBe(first.markerId);
    expect(second.filesWritten).toEqual([OVERRIDES_PATH]);
    expect(await read(projectId, '/index.html')).toBe(stamped);
    expect(second.duplicateCount).toBe(1);
  });
});

describe('applyStyleOverride — which write is silent', () => {
  it('writes source non-silently and /overrides.css silently', async () => {
    const projectId = await seed({ '/index.html': PAGE, '/about.html': OTHER });
    const createSpy = vi.spyOn(vfs, 'createFile');
    const updateSpy = vi.spyOn(vfs, 'updateFile');

    const first = await applyStyleOverride(
      projectId,
      { srcAttr: src('/index.html', PAGE, '<p'), tagName: 'p', attributes: {} },
      RED,
    );

    const optionsFor = (spy: typeof updateSpy, path: string) =>
      spy.mock.calls.filter((call) => call[1] === path).map((call) => call[3]);

    // Source writes shift every data-osw-src index after the insertion point, and those indices are
    // already in the live document with nothing to correct them — so they must recompile.
    expect(optionsFor(updateSpy, '/index.html')).toHaveLength(1);
    expect(optionsFor(updateSpy, '/index.html')[0]?.silent).toBeFalsy();
    expect(optionsFor(updateSpy, '/about.html')[0]?.silent).toBeFalsy();
    // /overrides.css carries no provenance indices, so a silent write invalidates nothing.
    expect(optionsFor(createSpy, OVERRIDES_PATH)).toEqual([{ silent: true }]);

    updateSpy.mockClear();
    await applyStyleOverride(
      projectId,
      { attributes: { [MARKER_ATTR]: first.markerId! }, tagName: 'p' },
      { property: 'color', value: 'blue' },
    );
    // …and so does the update that follows the create.
    expect(optionsFor(updateSpy, OVERRIDES_PATH)).toEqual([{ silent: true }]);
  });
});

describe('applyStyleOverride — refusals write nothing', () => {
  it('refuses a one-to-many edit without confirmation', async () => {
    const partial = '<nav><a href="/">Home</a></nav>';
    const projectId = await seed({
      '/index.html': '<html><head></head><body>{{> nav}}</body></html>',
      '/templates/nav.hbs': partial,
    });

    const result = await applyStyleOverride(
      projectId,
      {
        srcAttr: src('/templates/nav.hbs', partial, '<nav'),
        tagName: 'nav',
        instanceCount: 6,
        attributes: {},
      },
      RED,
    );

    expect(result).toEqual({
      ok: false,
      reason: 'needs-confirmation',
      file: '/templates/nav.hbs',
      instances: 6,
      filesWritten: [],
    });
    expect(await read(projectId, '/templates/nav.hbs')).toBe(partial);
    expect(await vfs.fileExists(projectId, OVERRIDES_PATH)).toBe(false);
  });

  it('writes the one-to-many edit once it is confirmed', async () => {
    const partial = '<nav><a href="/">Home</a></nav>';
    const projectId = await seed({
      '/index.html': '<html><head></head><body>{{> nav}}</body></html>',
      '/templates/nav.hbs': partial,
    });

    const result = await applyStyleOverride(
      projectId,
      {
        srcAttr: src('/templates/nav.hbs', partial, '<nav'),
        tagName: 'nav',
        instanceCount: 6,
        attributes: {},
      },
      RED,
      { confirmedMultiInstance: true },
    );

    expect(result.ok).toBe(true);
    expect(await read(projectId, '/templates/nav.hbs')).toContain(MARKER_ATTR);
    expect(await read(projectId, OVERRIDES_PATH)).toContain('color: red;');
  });

  it('refuses an unresolvable selection', async () => {
    const projectId = await seed({ '/index.html': PAGE });

    const result = await applyStyleOverride(projectId, { tagName: 'p', attributes: {} }, RED);

    expect(result).toEqual({ ok: false, reason: 'unresolvable', filesWritten: [] });
    expect(await read(projectId, '/index.html')).toBe(PAGE);
    expect(await vfs.fileExists(projectId, OVERRIDES_PATH)).toBe(false);
  });

  it('refuses an index whose tag name no longer matches', async () => {
    // The stale index lands on a *different valid open tag* — which is the realistic failure, and
    // which a `<`-plus-letter check would wave through, stamping the marker onto the wrong element.
    const page = '<html><head></head><body><div id="wrap"><p>hi</p></div></body></html>';
    const projectId = await seed({ '/index.html': page });

    const result = await applyStyleOverride(
      projectId,
      { srcAttr: src('/index.html', page, '<div'), tagName: 'p', attributes: {} },
      RED,
    );

    expect(result).toEqual({
      ok: false, reason: 'stale-index', file: '/index.html', filesWritten: [],
    });
    expect(await read(projectId, '/index.html')).toBe(page);
    expect(await vfs.fileExists(projectId, OVERRIDES_PATH)).toBe(false);
  });

  it('reports a deleted source file rather than throwing', async () => {
    const projectId = await seed({ '/index.html': PAGE });

    const result = await applyStyleOverride(
      projectId,
      { srcAttr: '/gone.html:0', tagName: 'p', attributes: {} },
      RED,
    );

    expect(result).toEqual({
      ok: false, reason: 'missing-file', file: '/gone.html', filesWritten: [],
    });
    expect(await vfs.fileExists(projectId, OVERRIDES_PATH)).toBe(false);
  });

  it('refuses while the agent is generating', async () => {
    const projectId = await seed({ '/index.html': PAGE });

    const result = await applyStyleOverride(
      projectId,
      { srcAttr: src('/index.html', PAGE, '<p'), tagName: 'p', attributes: {} },
      RED,
      { isGenerating: () => true },
    );

    expect(result).toEqual({ ok: false, reason: 'generating', filesWritten: [] });
    expect(await read(projectId, '/index.html')).toBe(PAGE);
    expect(await vfs.fileExists(projectId, OVERRIDES_PATH)).toBe(false);
  });

  it('surfaces an ambiguous /overrides.css instead of rejecting', async () => {
    const hand = `/* [${MARKER_ATTR}="aaaaaaaa"][${MARKER_ATTR}] is mentioned here */\n` +
      '.victim { color: hotpink; }\n';
    const projectId = await seed({ '/index.html': PAGE, [OVERRIDES_PATH]: hand });

    const result = await applyStyleOverride(
      projectId,
      { attributes: { [MARKER_ATTR]: 'aaaaaaaa' }, tagName: 'p' },
      RED,
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('ambiguous-stylesheet');
    expect(result.message).toMatch(/comment/i);
    expect(await read(projectId, OVERRIDES_PATH)).toBe(hand);
  });
});

describe('applyStyleOverride — pages with no head', () => {
  it('still writes the rule and reports the page it could not link', async () => {
    const fragment = '<div class="frag"><p>hi</p></div>';
    const projectId = await seed({ '/index.html': PAGE, '/fragment.html': fragment });

    const result = await applyStyleOverride(
      projectId,
      { srcAttr: src('/index.html', PAGE, '<p'), tagName: 'p', attributes: {} },
      RED,
    );

    expect(result.ok).toBe(true);
    expect(result.skippedPages).toEqual(['/fragment.html']);
    expect(await read(projectId, '/fragment.html')).toBe(fragment);
    expect(await read(projectId, OVERRIDES_PATH)).toContain('color: red;');
  });

  it('reports the source page itself when it has no head', async () => {
    const fragment = '<div class="frag"><p>hi</p></div>';
    const projectId = await seed({ '/fragment.html': fragment });

    const result = await applyStyleOverride(
      projectId,
      { srcAttr: src('/fragment.html', fragment, '<p'), tagName: 'p', attributes: {} },
      RED,
    );

    expect(result.ok).toBe(true);
    expect(result.skippedPages).toEqual(['/fragment.html']);
    expect(await read(projectId, '/fragment.html')).toContain(MARKER_ATTR);
    expect(await read(projectId, '/fragment.html')).not.toContain('overrides.css');
    expect(await read(projectId, OVERRIDES_PATH)).toContain('color: red;');
  });
});

describe('/overrides.css survives the export filters', () => {
  // Root and undotted placement is what makes it ship, and nothing else pins that. Both filters are
  // asserted against known-excluded paths first, so a broken harness fails loudly rather than
  // passing vacuously.
  it('is not excluded by lib/vfs/index.ts', () => {
    expect(vfs.shouldExcludeFromExportPublic('/data.json')).toBe(true);
    expect(vfs.shouldExcludeFromExportPublic('/templates/nav.hbs')).toBe(true);
    expect(vfs.shouldExcludeFromExportPublic('/.PROMPT.md')).toBe(true);
    expect(vfs.shouldExcludeFromExportPublic(OVERRIDES_PATH)).toBe(false);
  });

  it('is not excluded by lib/compiler/static-builder.ts', () => {
    // The predicate there is module-private and the module imports `fs` and the server adapters,
    // so it is lifted out of source rather than imported. If it ever stops being plain JS the
    // Function construction throws, and the vacuity guards below fail if it stops being the
    // predicate at all.
    const source = readFileSync(resolve(process.cwd(), 'lib/compiler/static-builder.ts'), 'utf8');
    const start = source.indexOf('function shouldExcludeFromExport(');
    expect(start, 'shouldExcludeFromExport not found in static-builder.ts').toBeGreaterThan(-1);

    const bodyStart = source.indexOf('{', start);
    let depth = 0;
    let i = bodyStart;
    for (; i < source.length; i++) {
      if (source[i] === '{') depth++;
      else if (source[i] === '}' && --depth === 0) break;
    }
    const shouldExclude = new Function('filePath', source.slice(bodyStart + 1, i)) as
      (filePath: string) => boolean;

    expect(shouldExclude('/data.json')).toBe(true);
    expect(shouldExclude('/templates/nav.hbs')).toBe(true);
    expect(shouldExclude('/.PROMPT.md')).toBe(true);
    expect(shouldExclude('/src/app.css')).toBe(true);
    expect(shouldExclude(OVERRIDES_PATH)).toBe(false);
  });
});

describe('countMarkerOccurrences', () => {
  it('returns 1 for a marker on one element', async () => {
    const projectId = await seed({
      '/index.html': `<html><head></head><body><p ${MARKER_ATTR}="aaaaaaaa">hi</p></body></html>`,
    });
    expect(await countMarkerOccurrences(projectId, 'aaaaaaaa')).toBe(1);
    expect(await countMarkerOccurrences(projectId, 'bbbbbbbb')).toBe(0);
  });

  it('returns 2 when the same marker appears twice in one file', async () => {
    const projectId = await seed({
      '/index.html': `<html><head></head><body>` +
        `<p ${MARKER_ATTR}="aaaaaaaa">a</p><p ${MARKER_ATTR}="aaaaaaaa">b</p></body></html>`,
    });
    expect(await countMarkerOccurrences(projectId, 'aaaaaaaa')).toBe(2);
  });

  it('counts across files', async () => {
    const projectId = await seed({
      '/index.html': `<html><head></head><body><p ${MARKER_ATTR}="aaaaaaaa">a</p></body></html>`,
      '/templates/nav.hbs': `<nav ${MARKER_ATTR}="aaaaaaaa"><a href="/">Home</a></nav>`,
    });
    expect(await countMarkerOccurrences(projectId, 'aaaaaaaa')).toBe(2);
  });

  it('does not count a marker inside a comment or a script', async () => {
    const projectId = await seed({
      '/index.html': '<html><head></head><body>' +
        `<p ${MARKER_ATTR}="aaaaaaaa">a</p>` +
        `<!-- <p ${MARKER_ATTR}="aaaaaaaa">commented out</p> -->` +
        `<script>var s = '<p ${MARKER_ATTR}="aaaaaaaa"></p>';</script>` +
        '</body></html>',
    });
    expect(await countMarkerOccurrences(projectId, 'aaaaaaaa')).toBe(1);
  });

  it('counts elements only — not markup quoted in a script file or the rule in /overrides.css', async () => {
    const projectId = await seed({
      '/index.html': `<html><head></head><body><p ${MARKER_ATTR}="aaaaaaaa">a</p></body></html>`,
      '/app.js': `document.body.innerHTML = '<p ${MARKER_ATTR}="aaaaaaaa"></p>';`,
      [OVERRIDES_PATH]: `[${MARKER_ATTR}="aaaaaaaa"][${MARKER_ATTR}] { color: red; }\n`,
    });
    expect(await countMarkerOccurrences(projectId, 'aaaaaaaa')).toBe(1);
  });
});

describe('applyStyleOverride — duplicate markers', () => {
  it('reports 1 for the element it just stamped', async () => {
    const projectId = await seed({ '/index.html': PAGE });
    const result = await applyStyleOverride(
      projectId,
      { srcAttr: src('/index.html', PAGE, '<p'), tagName: 'p', attributes: {} },
      RED,
    );
    expect(result.duplicateCount).toBe(1);
  });

  it('surfaces the count when the agent has duplicated a marked element', async () => {
    const projectId = await seed({
      '/index.html': '<html><head></head><body>' +
        `<p ${MARKER_ATTR}="aaaaaaaa">a</p><p ${MARKER_ATTR}="aaaaaaaa">b</p></body></html>`,
    });

    const result = await applyStyleOverride(
      projectId,
      { attributes: { [MARKER_ATTR]: 'aaaaaaaa' }, tagName: 'p' },
      RED,
    );

    expect(result.ok).toBe(true);
    expect(result.duplicateCount).toBe(2);
  });
});
