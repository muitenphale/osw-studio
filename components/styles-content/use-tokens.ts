'use client';

import { useEffect, useState } from 'react';
import { vfs } from '@/lib/vfs';
import { discoverColorTokens, type ColorToken, type CssSource } from './tokens';
import { asText } from '@/lib/vfs/as-text';

/** VFS read in its own hook, called by the workspace. Reads stylesheets only; excludes /overrides.css. */
const OVERRIDES_PATH = '/overrides.css';

export function useProjectColorTokens(projectId: string | null, refreshKey: number): ColorToken[] {
  const [tokens, setTokens] = useState<ColorToken[]>([]);

  useEffect(() => {
    if (!projectId) {
      setTokens([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        await vfs.init();
        const files = await vfs.listFiles(projectId);
        const sources: CssSource[] = files
          .filter(file => file.path.toLowerCase().endsWith('.css') && file.path !== OVERRIDES_PATH)
          .sort((a, b) => a.path.localeCompare(b.path))
          .map(file => ({ path: file.path, content: asText(file.content) }));
        if (cancelled) return;
        setTokens(discoverColorTokens(sources));
      } catch {
        // A project that cannot be read has no tokens to offer. The colour controls still work;
        // they just never detect a token match, which is the same state as a project with none.
        if (!cancelled) setTokens([]);
      }
    })();
    return () => { cancelled = true; };
  }, [projectId, refreshKey]);

  return tokens;
}
