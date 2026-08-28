import 'server-only';

import { getWebSearchProvider } from '@/lib/web-search';
import { assertPublicUrl } from '@/lib/web/ssrf-guard';
import type { SearchDelegationResult, ServerWebSearchConfig } from './types';

const TRUNCATE_CHARS = 100_000;
function truncate(out: string): string {
  if (out.length <= TRUNCATE_CHARS) return out;
  return out.slice(0, TRUNCATE_CHARS) + `\n\n… [${out.length - TRUNCATE_CHARS} chars truncated] …`;
}

/**
 * Server-side web search — the headless fallback used when a browser-delegated search times out
 * (no connected client). Runs the provider directly with the client-supplied config. Page-content
 * extraction (`--markdown` for non-native providers) is browser-only (CORS), so for those the
 * fallback returns snippets; native-content providers (e.g. Tavily) still include content.
 */
export async function runServerSideSearch(
  args: string[],
  config: ServerWebSearchConfig,
): Promise<SearchDelegationResult> {
  let count = 5;
  let markdown = false;
  const queryParts: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if ((a === '-n' || a === '--count') && args[i + 1]) { count = parseInt(args[++i], 10) || 5; continue; }
    if (a === '--markdown') { markdown = true; continue; }
    if (a) queryParts.push(a);
  }
  const query = queryParts.join(' ').trim();
  if (!query) return { stdout: '', stderr: 'Usage: search [-n N] [--markdown] "query"', exitCode: 1 };

  const provider = getWebSearchProvider(config.provider);
  if (provider.auth === 'key' && !config.key) {
    return { stdout: '', stderr: `search: provider ${provider.name} requires an API key`, exitCode: 1 };
  }
  if (provider.auth === 'url' && !config.searxngUrl) {
    return { stdout: '', stderr: `search: provider ${provider.name} requires an instance URL`, exitCode: 1 };
  }

  try {
    const signal = AbortSignal.timeout(20_000);
    let results: Array<{ title: string; url: string; snippet: string; content?: string }>;
    if ('search' in provider) {
      results = await provider.search(query, { count, markdown }, signal);
    } else {
      const auth = provider.auth === 'url' ? { searxngUrl: config.searxngUrl } : { key: config.key };
      const { url, init } = provider.buildRequest(query, { count, markdown }, auth);
      // SearXNG's endpoint is user-supplied — guard against SSRF, matching the /api/web/search route.
      if (provider.auth === 'url') await assertPublicUrl(url);
      const resp = await fetch(url, { ...init, signal });
      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        return { stdout: '', stderr: `search: provider error (${provider.name}): ${resp.status} ${text.slice(0, 200)}`, exitCode: 1 };
      }
      results = provider.normalize(await resp.json());
    }

    if (!results || results.length === 0) return { stdout: 'No results.', stderr: '', exitCode: 0 };

    const lines: string[] = [];
    results.forEach((r, i) => {
      lines.push(`${i + 1}. ${r.title}`);
      lines.push(`   ${r.url}`);
      if (r.snippet) lines.push(`   ${r.snippet}`);
      if (markdown && r.content) {
        lines.push('');
        lines.push(r.content.slice(0, 2000));
      }
      lines.push('');
    });
    return { stdout: truncate(lines.join('\n').trim()), stderr: '', exitCode: 0 };
  } catch (e: unknown) {
    const msg = e instanceof Error ? (e.name === 'TimeoutError' ? 'timeout after 20s' : e.message) : 'network error';
    return { stdout: '', stderr: `search: provider error (${provider.name}): ${msg}`, exitCode: 1 };
  }
}
