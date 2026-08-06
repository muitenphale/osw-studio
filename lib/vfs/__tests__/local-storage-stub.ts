/**
 * A localStorage stub for tests that exercise the legacy project-schema migration.
 *
 * The suite runs in the `node` environment, so there is no localStorage and no window. The
 * migration path is the reason `lib/vfs/project-schema.ts` exists, so it gets a stub rather than
 * being skipped. Returns a restore function; call it in `afterAll` so the globals do not leak into
 * whatever runs next in the same file.
 */
export function installLocalStorageStub(): () => void {
  const store = new Map<string, string>();
  const had = {
    localStorage: Object.getOwnPropertyDescriptor(globalThis, 'localStorage'),
    window: Object.getOwnPropertyDescriptor(globalThis, 'window'),
  };

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    },
  });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: globalThis });

  return () => {
    for (const [key, descriptor] of Object.entries(had)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete (globalThis as Record<string, unknown>)[key];
    }
  };
}
