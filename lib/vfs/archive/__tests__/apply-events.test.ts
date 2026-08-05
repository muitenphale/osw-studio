// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';
import 'fake-indexeddb/auto';
import type { ArchiveEntry, ImportResolutions } from '../types';

// jsdom rather than the suite default of node: `filesChanged` is a window event, and under node
// there is no window to dispatch it on, so the whole behaviour under test is invisible.
const { vfs } = await import('../../index');
const { analyzeImport } = await import('../analyze');
const { applyImport } = await import('../apply');

function entriesFrom(map: Record<string, string>): ArchiveEntry[] {
  return Object.entries(map).map(([path, content]) => {
    const bytes = new TextEncoder().encode(content);
    return {
      path,
      read: async () => bytes.buffer.slice(0) as ArrayBuffer,
      declaredSize: bytes.byteLength,
    };
  });
}

function resolutions(overrides: Partial<ImportResolutions> = {}): ImportResolutions {
  return { files: {}, backend: {}, settings: {}, skipBlocked: true, ...overrides };
}

async function countEvents(run: () => Promise<void>): Promise<number> {
  let count = 0;
  const listener = () => {
    count += 1;
  };
  window.addEventListener('filesChanged', listener);
  try {
    await run();
  } finally {
    window.removeEventListener('filesChanged', listener);
  }
  return count;
}

describe('applyImport event batching', () => {
  beforeAll(async () => {
    await vfs.init();
  });

  // apply writes files with { silent: true } and dispatches one event at the end, so a large
  // archive does not recompile the preview once per file. ensureAncestorDirs went around that:
  // createDirectory had no silent option and dispatched per directory, so an import into new
  // nested folders fired an event per folder, each one mid-import.
  it('dispatches exactly one filesChanged for an import that creates many directories', async () => {
    const project = await vfs.createProject('BatchedEvents', 'test');
    const entries = entriesFrom({
      '/a/one.css': '.a{}',
      '/a/b/two.css': '.b{}',
      '/a/b/c/three.css': '.c{}',
      '/d/e/four.css': '.d{}',
      '/f/five.css': '.f{}',
    });
    const target = { kind: 'existing-project' as const, projectId: project.id };
    const plan = await analyzeImport(vfs, entries, target);

    const events = await countEvents(async () => {
      const result = await applyImport(vfs, plan, resolutions(), entries, target);
      expect(result.failed).toEqual([]);
      expect(result.applied.files).toBe(5);
    });

    expect(events).toBe(1);
    const items = await vfs.getAllFilesAndDirectories(project.id);
    const dirs = items.filter((item) => item.type === 'directory').map((item) => item.path);
    expect(dirs).toEqual(expect.arrayContaining(['/a', '/a/b', '/a/b/c', '/d', '/d/e', '/f']));
  });

  // The option is opt-in: a directory created on its own is a change the file explorer has to be
  // told about, and every existing caller relies on that.
  it('still dispatches per directory when silent is not asked for', async () => {
    const project = await vfs.createProject('LoudDirectories', 'test');

    const events = await countEvents(async () => {
      await vfs.createDirectory(project.id, '/plain');
      await vfs.createDirectory(project.id, '/plain/nested');
    });

    expect(events).toBe(2);
  });

  it('dispatches nothing when a directory is created silently', async () => {
    const project = await vfs.createProject('SilentDirectories', 'test');

    const events = await countEvents(async () => {
      await vfs.createDirectory(project.id, '/quiet', { silent: true });
      // Already exists — no node written, and still no event either way.
      await vfs.createDirectory(project.id, '/quiet', { silent: true });
    });

    expect(events).toBe(0);
  });
});
