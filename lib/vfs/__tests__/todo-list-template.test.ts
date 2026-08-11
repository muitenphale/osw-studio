import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { transformSync } from 'esbuild';
import { REACT_DEMO_PROJECT_TEMPLATE } from '@/lib/vfs/templates/react-demo';

/**
 * The list only means anything if it comes back, so the storage module is worth running rather than
 * reading. It ships as TypeScript inside a string, where a stray escape produces a file that is
 * only wrong once it reaches a browser.
 *
 * This runs in the `node` environment rather than jsdom, because esbuild cannot run inside jsdom:
 * its typed arrays come from another realm and esbuild checks for exactly that. So `window` is
 * stubbed here instead, which also makes it easy to have storage throw the way a private window
 * does.
 */

function file(path: string): string {
  const found = REACT_DEMO_PROJECT_TEMPLATE.files.find((f) => f.path === path);
  if (!found) throw new Error(`template has no ${path}`);
  return found.content;
}

interface Task {
  id: number;
  text: string;
  done: boolean;
}

interface Storage {
  STORAGE_KEY: string;
  loadTasks: () => Task[] | null;
  saveTasks: (tasks: Task[]) => boolean;
}

const PATH = '/deployments/abc123/';

let store: Map<string, string>;
let restore: () => void;

function installWindow(overrides: Partial<globalThis.Storage> = {}) {
  store = new Map();
  const had = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location: { pathname: PATH },
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        ...overrides,
      },
    },
  });
  return () => {
    if (had) Object.defineProperty(globalThis, 'window', had);
    else delete (globalThis as Record<string, unknown>).window;
  };
}

/**
 * Compiles and evaluates the shipped module.
 *
 * The same TypeScript that ships, through the same compiler the project's bundler uses, so the test
 * exercises the real logic rather than a paraphrase. Re-evaluated per call because STORAGE_KEY is
 * read once at module scope.
 */
function loadStorage(): Storage {
  const { code } = transformSync(file('/src/storage.ts'), { loader: 'ts', format: 'cjs' });
  // Not named `module`: Next forbids assigning that identifier, and this is the CommonJS shim the
  // compiled output writes its exports onto, so it only has to look like one to the generated code.
  const shim = { exports: {} as Record<string, unknown> };
  new Function('module', 'exports', code)(shim, shim.exports);
  return shim.exports as unknown as Storage;
}

const sample: Task[] = [
  { id: 1, text: 'Buy timber', done: false },
  { id: 2, text: 'Measure the alcove', done: true },
];

describe('the stored list', () => {
  beforeEach(() => {
    restore = installWindow();
  });
  afterEach(() => restore());

  it('comes back exactly as it went in', () => {
    const s = loadStorage();
    expect(s.saveTasks(sample)).toBe(true);
    expect(s.loadTasks()).toEqual(sample);
  });

  it('is nothing at all before anything has been saved', () => {
    // The distinction the app depends on: null means "never used", so the seed tasks appear.
    expect(loadStorage().loadTasks()).toBeNull();
  });

  it('keeps an empty list empty rather than treating it as never used', () => {
    // Otherwise clearing the list refills it with the example tasks on the next visit.
    const s = loadStorage();
    s.saveTasks([]);
    expect(s.loadTasks()).toEqual([]);
  });

  it('scopes its key to the page, so two published lists do not share one', () => {
    // localStorage belongs to the origin. Two deployments on one host would otherwise overwrite
    // each other, and the second would look like it had eaten the first.
    expect(loadStorage().STORAGE_KEY).toContain(PATH);
  });

  it('survives a stored value that is not a list', () => {
    const s = loadStorage();
    store.set(s.STORAGE_KEY, '{"not":"an array"}');
    expect(s.loadTasks()).toBeNull();
  });

  it('survives a stored value that is not JSON at all', () => {
    const s = loadStorage();
    store.set(s.STORAGE_KEY, 'half a writ');
    expect(s.loadTasks()).toBeNull();
  });

  it('drops entries that are not tasks instead of rendering blank rows', () => {
    const s = loadStorage();
    store.set(
      s.STORAGE_KEY,
      JSON.stringify([sample[0], { id: 'x' }, null, 7, { text: 'no id', done: false }])
    );
    expect(s.loadTasks()).toEqual([sample[0]]);
  });
});

describe('when the browser refuses', () => {
  afterEach(() => restore());

  it('reports a refused write rather than pretending it saved', () => {
    // A private window throws here. The page turns this into the line saying the list will not
    // survive the tab, which only works if the failure is reported rather than swallowed.
    restore = installWindow({
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    });
    expect(loadStorage().saveTasks(sample)).toBe(false);
  });

  it('reads as nothing stored when storage cannot be read at all', () => {
    restore = installWindow({
      getItem: () => {
        throw new Error('SecurityError');
      },
    });
    expect(loadStorage().loadTasks()).toBeNull();
  });
});
