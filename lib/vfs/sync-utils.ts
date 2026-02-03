/**
 * Sync Utilities
 *
 * Server-side helpers for file serialization during sync operations.
 */

import { VirtualFile } from './types';

/**
 * Serialize files for JSON response (ArrayBuffer -> base64)
 * Used by sync API routes to properly serialize binary file content.
 */
export function serializeFilesForResponse(files: VirtualFile[]): (VirtualFile & { _isBinaryBase64?: boolean })[] {
  return files.map(file => {
    if (file.content instanceof ArrayBuffer) {
      const buffer = Buffer.from(file.content);
      return {
        ...file,
        content: buffer.toString('base64'),
        _isBinaryBase64: true,
      };
    }
    return file;
  });
}
