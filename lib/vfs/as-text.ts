/** Narrows string | ArrayBuffer to string. TextDecoder handles cross-realm ArrayBuffers. */
export function asText(content: string | ArrayBuffer): string {
  return typeof content === 'string' ? content : new TextDecoder().decode(content);
}
