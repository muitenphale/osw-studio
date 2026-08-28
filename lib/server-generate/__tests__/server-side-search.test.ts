import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ServerWebSearchConfig } from '../types';

// server-side-search.ts is marked 'server-only'; neutralize the guard so it loads under vitest.
vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  getWebSearchProvider: vi.fn(),
  assertPublicUrl: vi.fn(async () => {}),
}));
vi.mock('@/lib/web-search', () => ({ getWebSearchProvider: mocks.getWebSearchProvider }));
vi.mock('@/lib/web/ssrf-guard', () => ({ assertPublicUrl: mocks.assertPublicUrl }));

import { runServerSideSearch } from '../server-side-search';

const keyConfig = { provider: 'tavily', key: 'secret' } as ServerWebSearchConfig;

beforeEach(() => {
  mocks.getWebSearchProvider.mockReset();
  mocks.assertPublicUrl.mockClear();
});

describe('runServerSideSearch', () => {
  it('returns a usage error and never reaches a provider when the query is empty', async () => {
    const r = await runServerSideSearch(['--markdown'], keyConfig);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/Usage:/);
    expect(mocks.getWebSearchProvider).not.toHaveBeenCalled();
  });

  it('errors when a key-auth provider has no key configured', async () => {
    mocks.getWebSearchProvider.mockReturnValue({ name: 'Tavily', auth: 'key', search: vi.fn() });
    const r = await runServerSideSearch(['hello'], { provider: 'tavily' } as ServerWebSearchConfig);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/requires an API key/);
  });

  it('parses -n/query args and formats results from a direct-search provider', async () => {
    const search = vi.fn().mockResolvedValue([
      { title: 'First', url: 'https://a.example', snippet: 'snip a' },
      { title: 'Second', url: 'https://b.example', snippet: '' },
    ]);
    mocks.getWebSearchProvider.mockReturnValue({ name: 'Tavily', auth: 'key', search });

    const r = await runServerSideSearch(['-n', '3', 'weather', 'today'], keyConfig);

    expect(search).toHaveBeenCalledWith('weather today', { count: 3, markdown: false }, expect.any(AbortSignal));
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('1. First');
    expect(r.stdout).toContain('https://a.example');
    expect(r.stdout).toContain('snip a');
    expect(r.stdout).toContain('2. Second');
  });

  it('reports "No results." when the provider returns an empty list', async () => {
    mocks.getWebSearchProvider.mockReturnValue({ name: 'Tavily', auth: 'key', search: vi.fn().mockResolvedValue([]) });
    const r = await runServerSideSearch(['nothing here'], keyConfig);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe('No results.');
  });

  it('SSRF-guards the user-supplied SearXNG URL before fetching', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{ title: 'X', url: 'https://x.example', snippet: 's' }] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    mocks.getWebSearchProvider.mockReturnValue({
      name: 'SearXNG',
      auth: 'url',
      buildRequest: () => ({ url: 'https://searx.local/search', init: {} }),
      normalize: (raw: { results: unknown[] }) => raw.results,
    });

    const r = await runServerSideSearch(['hi'], { provider: 'searxng', searxngUrl: 'https://searx.local' } as ServerWebSearchConfig);

    expect(mocks.assertPublicUrl).toHaveBeenCalledWith('https://searx.local/search');
    expect(fetchMock).toHaveBeenCalled();
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('1. X');
    vi.unstubAllGlobals();
  });
});
