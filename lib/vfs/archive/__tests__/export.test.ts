import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import 'fake-indexeddb/auto';
import JSZip from 'jszip';
import type { EdgeFunction, ScheduledFunction } from '../../types';
import { installLocalStorageStub } from '../../__tests__/local-storage-stub';

const { vfs } = await import('../../index');
const { exportProjectArchive } = await import('../export');

async function pathsOf(blob: Blob): Promise<string[]> {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  return Object.keys(zip.files).filter((p) => !zip.files[p].dir).sort();
}

async function zipOf(blob: Blob): Promise<JSZip> {
  return JSZip.loadAsync(await blob.arrayBuffer());
}

function edgeFunction(projectId: string, overrides: Partial<EdgeFunction> = {}): EdgeFunction {
  return {
    id: `edge-${overrides.name ?? 'fn'}-${projectId}`,
    projectId,
    name: 'send-email',
    code: 'Response.json({ ok: true });',
    method: 'POST',
    enabled: true,
    timeoutMs: 5000,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('exportProjectArchive', () => {
  beforeAll(async () => { await vfs.init(); });

  it('includes real dotfiles that the deployable export drops', async () => {
    const project = await vfs.createProject('Archive', 'test');
    await vfs.createFile(project.id, '/index.html', '<h1>hi</h1>');
    await vfs.createFile(project.id, '/.PROMPT.md', 'prompt');

    const { blob } = await exportProjectArchive(vfs, project.id);
    const paths = await pathsOf(blob);
    expect(paths).toContain('index.html');
    expect(paths).toContain('.PROMPT.md');
  });

  it('writes project.json, and the .server README only when there are backend features', async () => {
    const project = await vfs.createProject('Archive2', 'test');
    await vfs.createFile(project.id, '/index.html', 'x');

    const { blob, warnings } = await exportProjectArchive(vfs, project.id);
    const paths = await pathsOf(blob);
    expect(paths).toContain('project.json');
    expect(paths).not.toContain('AGENTS.md');            // no root doc is generated
    expect(paths).not.toContain('.server/README.md');    // no backend features, no folder
    expect(warnings).toEqual([]);
  });

  it('excludes generated build output', async () => {
    // isGeneratedPath consults an in-memory map populated by the bundler (index.ts:150),
    // NOT a name pattern — and getAllFilesAndDirectories injects those entries itself
    // (index.ts:1270-1278). So register it the way the bundler does.
    const project = await vfs.createProject('Archive3', 'test');
    await vfs.createFile(project.id, '/index.html', 'x');
    vfs.setGeneratedFile('/bundle.js', 'generated', 'application/javascript');

    const paths = await pathsOf((await exportProjectArchive(vfs, project.id)).blob);
    expect(paths.some((p) => p.endsWith('bundle.js'))).toBe(false);
  });

  it('keeps a real stored file that sits at a generated path', async () => {
    // The injection is skipped when the project owns the path (index.ts:1274), so a path-based
    // filter throws away the project's own source and the archive silently loses a file — but
    // only in a session where the bundler happened to run. Discriminate on the record, not the
    // path: checkpoint.ts:320 already screens generated output the same way.
    const project = await vfs.createProject('Archive12', 'test');
    await vfs.createFile(project.id, '/bundle.js', 'REAL SOURCE');
    vfs.setGeneratedFile('/bundle.js', 'GENERATED', 'application/javascript');
    vfs.setGeneratedFile('/bundle.css', 'GENERATED', 'text/css');
    try {
      const zip = await zipOf((await exportProjectArchive(vfs, project.id)).blob);
      expect(await zip.file('bundle.js')!.async('string')).toBe('REAL SOURCE');
      expect(Object.keys(zip.files)).not.toContain('bundle.css');
    } finally {
      vfs.clearGeneratedFiles();
    }
  });

  it('leaves a project-owned AGENTS.md alone', async () => {
    // No root AGENTS.md is generated at all, so a project's own copy is just a file.
    const project = await vfs.createProject('Archive6', 'test');
    await vfs.createFile(project.id, '/AGENTS.md', 'MY OWN NOTES');

    const zip = await zipOf((await exportProjectArchive(vfs, project.id)).blob);
    expect(await zip.file('AGENTS.md')!.async('string')).toBe('MY OWN NOTES');
  });

  it('does not overwrite a project file named project.json', async () => {
    // Nothing reserves /project.json, so this collision is real and JSZip.file() is silent.
    const project = await vfs.createProject('Archive7', 'test');
    await vfs.createFile(project.id, '/project.json', '{"mine":true}');

    const zip = await zipOf((await exportProjectArchive(vfs, project.id)).blob);
    expect(JSON.parse(await zip.file('project.json')!.async('string'))).toEqual({ mine: true });
    // the manifest steps aside rather than clobbering it
    const manifest = JSON.parse(await zip.file('osw-project.json')!.async('string'));
    expect(manifest.formatVersion).toBe(1);
    expect(manifest.name).toBe('Archive7');
  });

  it('keeps both manifest names when the project owns both, and says where the settings went', async () => {
    const project = await vfs.createProject('Archive7b', 'test');
    await vfs.createFile(project.id, '/project.json', '{"mine":true}');
    await vfs.createFile(project.id, '/osw-project.json', '{"also-mine":true}');

    const { blob, warnings } = await exportProjectArchive(vfs, project.id);
    const zip = await zipOf(blob);
    // Neither of the user's files is clobbered.
    expect(JSON.parse(await zip.file('project.json')!.async('string'))).toEqual({ mine: true });
    expect(JSON.parse(await zip.file('osw-project.json')!.async('string')))
      .toEqual({ 'also-mine': true });

    expect(warnings).toHaveLength(1);
    expect(warnings[0].path).toBe('/osw-project (2).json');
    const manifest = JSON.parse(await zip.file('osw-project (2).json')!.async('string'));
    expect(manifest.name).toBe('Archive7b');
  });

  it('reports a function with no code rather than exporting an archive that cannot be imported', async () => {
    const project = await vfs.createProject('Archive10', 'test');
    await vfs.createFile(project.id, '/index.html', 'x');
    const adapter = vfs.getStorageAdapter();
    await adapter.createEdgeFunction!(edgeFunction(project.id, { name: 'empty-fn', code: '' }));

    const { blob, warnings } = await exportProjectArchive(vfs, project.id);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({
      code: 'missing-code',
      path: '/.server/edge-functions/empty-fn.js',
    });
    // Still exported: it is what the project holds.
    const zip = await zipOf(blob);
    expect(await zip.file('.server/edge-functions/empty-fn.js')!.async('string')).toBe('');
  });

  it('preserves binary content byte-for-byte', async () => {
    const project = await vfs.createProject('Archive4', 'test');
    const bytes = new Uint8Array([0, 1, 2, 253, 254, 255]);
    await vfs.createFile(project.id, '/blob.bin', bytes.buffer);

    const zip = await zipOf((await exportProjectArchive(vfs, project.id)).blob);
    const out = new Uint8Array(await zip.file('blob.bin')!.async('arraybuffer'));
    expect(Array.from(out)).toEqual(Array.from(bytes));
  });

  it('produces identical bytes for an unchanged project', async () => {
    // Whole-blob, not just the manifest: zip headers carry a DOS timestamp, and JSZip stamps every
    // entry with new Date() unless one is passed. Comparing only project.json would leave that
    // nondeterminism invisible — and comparing the blobs *with* a clock-derived date only shows it
    // when the two exports straddle a 2-second boundary, so this must not depend on timing.
    const project = await vfs.createProject('Archive5', 'test');
    await vfs.createFile(project.id, '/index.html', 'x');

    const a = new Uint8Array(await (await exportProjectArchive(vfs, project.id)).blob.arrayBuffer());
    const b = new Uint8Array(await (await exportProjectArchive(vfs, project.id)).blob.arrayBuffer());
    expect(Array.from(b)).toEqual(Array.from(a));
  });

  it('derives entry timestamps from project state, not from the clock', async () => {
    // The same fixed state exported twice must give the same container bytes however much time
    // passes between the two calls, so the timestamps are asserted directly rather than by
    // sleeping between exports.
    const project = await vfs.createProject('Archive10', 'test');
    await vfs.createFile(project.id, '/index.html', 'x');
    const adapter = vfs.getStorageAdapter();
    await adapter.createEdgeFunction!(edgeFunction(project.id, { name: 'ping' }));

    const fileUpdatedAt = new Date(Date.UTC(2021, 4, 17, 8, 30, 0));
    const projectUpdatedAt = new Date(Date.UTC(2022, 10, 3, 14, 20, 0));
    const stored = await vfs.readFile(project.id, '/index.html');
    await adapter.updateFile({ ...stored, updatedAt: fileUpdatedAt });
    // preserveUpdatedAt, or updateProject stamps the current time over the value under test.
    await vfs.updateProject(
      { ...await vfs.getProject(project.id), updatedAt: projectUpdatedAt },
      { preserveUpdatedAt: true }
    );

    const zip = await zipOf((await exportProjectArchive(vfs, project.id)).blob);
    // DOS timestamps have 2-second resolution, so compare at that granularity.
    const dosSeconds = (date: Date) => Math.floor(date.getTime() / 2000);
    expect(dosSeconds(zip.file('index.html')!.date)).toBe(dosSeconds(fileUpdatedAt));
    expect(dosSeconds(zip.file('project.json')!.date)).toBe(dosSeconds(projectUpdatedAt));
    expect(dosSeconds(zip.file('.server/README.md')!.date)).toBe(dosSeconds(projectUpdatedAt));
    expect(dosSeconds(zip.file('.server/edge-functions/ping.js')!.date)).toBe(dosSeconds(projectUpdatedAt));
  });

  it('falls back to the project timestamp when a file has no usable one', async () => {
    // File records are not hydrated on the way out of IndexedDB (unlike projects), so updatedAt
    // really can arrive undefined or as an ISO string. Letting either reach JSZip would silently
    // reinstate new Date().
    const project = await vfs.createProject('Archive11', 'test');
    await vfs.createFile(project.id, '/index.html', 'x');
    await vfs.createFile(project.id, '/stringy.html', 'x');
    const adapter = vfs.getStorageAdapter();
    const projectUpdatedAt = new Date(Date.UTC(2019, 1, 2, 3, 4, 0));
    await adapter.updateFile({
      ...await vfs.readFile(project.id, '/index.html'),
      updatedAt: undefined as unknown as Date,
    });
    await adapter.updateFile({
      ...await vfs.readFile(project.id, '/stringy.html'),
      updatedAt: '2020-06-07T08:09:00.000Z' as unknown as Date,
    });
    await vfs.updateProject(
      { ...await vfs.getProject(project.id), updatedAt: projectUpdatedAt },
      { preserveUpdatedAt: true }
    );

    const dosSeconds = (date: Date) => Math.floor(date.getTime() / 2000);
    const zip = await zipOf((await exportProjectArchive(vfs, project.id)).blob);
    expect(dosSeconds(zip.file('index.html')!.date)).toBe(dosSeconds(projectUpdatedAt));
    // A serialized date is usable, so it is used rather than discarded.
    expect(dosSeconds(zip.file('stringy.html')!.date))
      .toBe(dosSeconds(new Date('2020-06-07T08:09:00.000Z')));
  });

  it('falls back to a fixed date when neither the file nor the project has one', async () => {
    // Not reachable through IndexedDB — hydrateProject substitutes new Date() for a missing
    // project.updatedAt (indexeddb-adapter.ts:617) — so the last resort is exercised against a
    // stub. Without it an undefined would reach JSZip and take the clock.
    const now = new Date();
    const stub = {
      getProject: async () => ({ id: 'p', name: 'Stub', updatedAt: undefined, settings: {} }),
      getAllFilesAndDirectories: async () => [
        { path: '/index.html', name: 'index.html', type: 'html', content: 'x', updatedAt: undefined },
      ],
      isGeneratedPath: () => false,
      getStorageAdapter: () => ({}),
    } as unknown as typeof vfs;

    const zip = await zipOf((await exportProjectArchive(stub, 'p')).blob);
    const entryDate = zip.file('index.html')!.date;
    expect(entryDate.getUTCFullYear()).toBe(1980);
    expect(entryDate.getUTCFullYear()).not.toBe(now.getUTCFullYear());
  });

  it('writes backend features and the .server README when the project has them', async () => {
    const project = await vfs.createProject('Archive8', 'test');
    await vfs.createFile(project.id, '/index.html', 'x');
    const adapter = vfs.getStorageAdapter();
    await adapter.createEdgeFunction!(edgeFunction(project.id));

    const { blob, warnings } = await exportProjectArchive(vfs, project.id);
    const paths = await pathsOf(blob);
    expect(paths).toContain('.server/edge-functions/send-email.js');
    expect(paths).toContain('.server/edge-functions/send-email.json');
    expect(paths).toContain('.server/README.md');
    expect(warnings).toEqual([]);

    const zip = await zipOf(blob);
    expect(await zip.file('.server/edge-functions/send-email.js')!.async('string'))
      .toBe('Response.json({ ok: true });');
  });

  it('reports a schedule whose edge function is gone instead of dropping it silently', async () => {
    const project = await vfs.createProject('Archive9', 'test');
    await vfs.createFile(project.id, '/index.html', 'x');
    const adapter = vfs.getStorageAdapter();
    const dangling: ScheduledFunction = {
      id: `sched-${project.id}`,
      projectId: project.id,
      name: 'nightly',
      functionId: 'no-such-edge-function',
      cronExpression: '0 3 * * *',
      timezone: 'UTC',
      config: {},
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await adapter.createScheduledFunction!(dangling);

    const { blob, warnings } = await exportProjectArchive(vfs, project.id);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].code).toBe('unresolved-reference');
    expect(warnings[0].message).toContain('nightly');
    expect(await pathsOf(blob)).not.toContain('.server/scheduled.json');
  });
});

describe('exportProjectArchive database schema', () => {
  let restore = () => {};

  beforeAll(async () => { await vfs.init(); restore = installLocalStorageStub(); });
  afterAll(() => { restore(); });

  it('reads the schema from the file system it was handed, not the singleton', async () => {
    // exportProjectArchive takes a VirtualFileSystem so a caller can pass another instance. Two
    // exist server-side. Reading the schema off the module singleton instead would pair one
    // instance's files with another's schema, and no project id is guaranteed to mean the same
    // thing in both — here 'p' does not exist in the singleton at all.
    const stub = {
      getProject: async () => ({
        id: 'p',
        name: 'Stub',
        updatedAt: new Date('2024-01-01T00:00:00.000Z'),
        settings: { databaseSchema: 'CREATE TABLE from_the_stub (id INTEGER);' },
      }),
      getAllFilesAndDirectories: async () => [],
      isGeneratedPath: () => false,
      getStorageAdapter: () => ({}),
    } as unknown as typeof vfs;

    const zip = await zipOf((await exportProjectArchive(stub, 'p')).blob);
    const manifest = JSON.parse(await zip.file('project.json')!.async('string'));
    expect(manifest.databaseSchema).toBe('CREATE TABLE from_the_stub (id INTEGER);');
  });

  it('exports a schema still held in localStorage', async () => {
    // Browser mode never mounts the server context, so a project created from a backend template
    // before the schema moved onto the record would otherwise download without it.
    const ddl = 'CREATE TABLE legacy (id INTEGER PRIMARY KEY);';
    const project = await vfs.createProject('LegacySchema', 'test');
    localStorage.setItem(`osw-db-schema-${project.id}`, ddl);

    const zip = await zipOf((await exportProjectArchive(vfs, project.id)).blob);
    const manifest = JSON.parse(await zip.file('project.json')!.async('string'));
    expect(manifest.databaseSchema).toBe(ddl);
  });
});
