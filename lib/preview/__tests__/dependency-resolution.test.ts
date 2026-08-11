import { describe, it, expect } from 'vitest';
import { resolveDependencyUrl } from '@/lib/preview/esbuild-bundler';

/**
 * Dependencies are fetched at build time and inlined, so an exported project is
 * self-contained. Before this, bare imports were left `external` and rewrote to
 * esm.sh URLs, which meant every visitor to a published site downloaded the
 * framework from a third party and the site broke when that party did. Svelte
 * was the worst of it: its client runtime arrives as 42 separate modules.
 */
describe('resolveDependencyUrl', () => {
  const CDN = 'https://esm.sh';

  it('sends a bare package import to the CDN', () => {
    expect(resolveDependencyUrl('react', '/src/main.tsx', CDN)).toBe('https://esm.sh/react');
    expect(resolveDependencyUrl('vue', '/src/main.ts', CDN)).toBe('https://esm.sh/vue');
  });

  it('keeps a scoped package intact', () => {
    expect(resolveDependencyUrl('@vue/runtime-dom', '/src/main.ts', CDN))
      .toBe('https://esm.sh/@vue/runtime-dom');
  });

  it('resolves an absolute path inside a fetched module against the CDN, not the project', () => {
    // esm.sh emits these. Read as a project path they would 404; worse, resolving
    // them inconsistently yields two copies of React in one bundle.
    expect(
      resolveDependencyUrl('/react@19.2.8/es2022/react.mjs', 'https://esm.sh/react-dom/client', CDN)
    ).toBe('https://esm.sh/react@19.2.8/es2022/react.mjs');
  });

  it('resolves a relative import inside a fetched module against its own URL', () => {
    expect(
      resolveDependencyUrl('./shared.mjs', 'https://esm.sh/svelte@5/es2022/internal/client.mjs', CDN)
    ).toBe('https://esm.sh/svelte@5/es2022/internal/shared.mjs');
  });

  it('gives one module one identity, so it is inlined once', () => {
    // The same file reached two ways has to produce the same URL or esbuild
    // treats it as two modules and ships React twice.
    const viaAbsolute = resolveDependencyUrl(
      '/react@19.2.8/es2022/react.mjs', 'https://esm.sh/react-dom/client', CDN
    );
    const viaRelative = resolveDependencyUrl(
      '../react@19.2.8/es2022/react.mjs', 'https://esm.sh/other/thing.mjs', CDN
    );
    expect(viaAbsolute).toBe(viaRelative);
  });

  it('leaves a full URL alone', () => {
    expect(resolveDependencyUrl('https://esm.sh/react/jsx-runtime', '/src/App.tsx', CDN))
      .toBe('https://esm.sh/react/jsx-runtime');
  });

  it('honours a different CDN base', () => {
    expect(resolveDependencyUrl('preact', '/src/main.tsx', 'https://cdn.example'))
      .toBe('https://cdn.example/preact');
  });
});
