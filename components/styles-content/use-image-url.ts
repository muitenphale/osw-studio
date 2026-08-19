'use client';

import { useEffect, useState } from 'react';
import { vfs } from '@/lib/vfs';
import { getSpecificMimeType } from '@/lib/vfs/types';
import { resolveImageSrc } from './content-state';

/** VFS read in its own hook, called by the workspace so the panel imports neither lib/vfs nor lib/stores. */
export function useSelectedImageUrl(
  projectId: string | null,
  src: string | null | undefined,
  refreshKey: number,
): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const source = resolveImageSrc(src);
    if (!projectId || !source) {
      setUrl(null);
      return;
    }
    if (source.kind === 'external') {
      setUrl(source.url);
      return;
    }

    let cancelled = false;
    let minted: string | null = null;
    (async () => {
      try {
        await vfs.init();
        const file = await vfs.readFile(projectId, source.path);
        if (cancelled) return;
        const blob = new Blob([file.content], { type: getSpecificMimeType(source.path) });
        minted = URL.createObjectURL(blob);
        setUrl(minted);
      } catch {
        // A path that is not in the project has no preview. The Replace control still works — the
        // picker is what says why the `src` cannot be written, and it says it against the source
        // file rather than against a missing thumbnail.
        if (!cancelled) setUrl(null);
      }
    })();

    return () => {
      cancelled = true;
      // Revoked on the way out, so a session of clicking around the tree does not leave every image
      // the user looked at alive in the document.
      if (minted) URL.revokeObjectURL(minted);
    };
  }, [projectId, src, refreshKey]);

  return url;
}
