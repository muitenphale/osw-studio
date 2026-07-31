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

/**
 * Inverse of serializeFilesForResponse: base64 -> ArrayBuffer.
 *
 * Sync routes must call this on the way in. Without it the flag was simply dropped and the storage
 * layer was handed a base64 string, which is indistinguishable from ordinary text — so every
 * binary file a client pushed was stored, served and published as text.
 */
export function deserializeFilesFromRequest(
  files: (VirtualFile & { _isBinaryBase64?: boolean })[]
): VirtualFile[] {
  return files.map(file => {
    const { _isBinaryBase64, ...rest } = file;
    if (_isBinaryBase64 && typeof rest.content === 'string') {
      const buffer = Buffer.from(rest.content, 'base64');
      return {
        ...rest,
        content: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
      };
    }
    return rest;
  });
}
