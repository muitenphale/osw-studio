/**
 * Base64 helpers for serializing binary file content (images, video, fonts) to
 * and from JSON. VirtualFile binary content is an ArrayBuffer, which
 * JSON.stringify turns into `{}` — so JSON project exports must encode it as a
 * base64 string and decode it back on import.
 */

/** Encode an ArrayBuffer as a base64 string (chunked to avoid call-stack limits). */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000; // 32KB per chunk keeps String.fromCharCode within limits
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

/** Decode a base64 string back into an ArrayBuffer. */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * A file inside a template. `encoding: 'base64'` means content holds encoded bytes rather than
 * text — the same marker project export uses.
 */
interface EncodableFile {
  path: string;
  content: string | ArrayBuffer;
  encoding?: 'base64';
}

/**
 * Encode template file contents for JSON transport or storage.
 *
 * Template files carry `string | ArrayBuffer`, and JSON.stringify turns an ArrayBuffer into `{}`.
 * Anywhere a template crosses into JSON — the .oswt archive, the sync wire, the server's database —
 * has to go through this or its binary files arrive empty.
 *
 * A tag check rather than `instanceof`: content read back out of IndexedDB is a structured clone
 * and can carry a constructor from another realm.
 */
export function encodeTemplateFiles(files: EncodableFile[]): EncodableFile[] {
  return (files ?? []).map((file) =>
    Object.prototype.toString.call(file.content) === '[object ArrayBuffer]'
      ? { path: file.path, content: arrayBufferToBase64(file.content as ArrayBuffer), encoding: 'base64' as const }
      : { path: file.path, content: file.content }
  );
}

/** Inverse of encodeTemplateFiles. Files stored before encoding existed pass through untouched. */
export function decodeTemplateFiles(files: EncodableFile[]): EncodableFile[] {
  return (files ?? []).map((file) =>
    file.encoding === 'base64' && typeof file.content === 'string'
      ? { path: file.path, content: base64ToArrayBuffer(file.content) }
      : file
  );
}

