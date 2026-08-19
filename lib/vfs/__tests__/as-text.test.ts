import { describe, it, expect } from 'vitest';
import { asText } from '../as-text';

/**
 * The narrowing every direct-edit write does before it splices a file.
 *
 * Tested on its own because the four call sites — `apply-style`, `apply-image`, `apply-text` and
 * `styles-content/use-tokens` — are all driven through VFS fakes that hand back strings, so the
 * buffer branch was reachable in production and unreachable in the suite. `String(buffer)` passes
 * every one of those tests and yields `"[object ArrayBuffer]"`, or for a view the comma-joined byte
 * values, either of which would be written into the user's source file.
 */

const bytes = (text: string): ArrayBuffer => {
  const encoded = new TextEncoder().encode(text);
  // A fresh buffer, not `encoded.buffer`: a view's buffer may be a slice of a larger pool, and
  // decoding the whole pool is a different string.
  const copy = new ArrayBuffer(encoded.byteLength);
  new Uint8Array(copy).set(encoded);
  return copy;
};

describe('asText', () => {
  it('passes a string through untouched', () => {
    expect(asText('<h1>Hello</h1>')).toBe('<h1>Hello</h1>');
  });

  it('decodes a buffer as UTF-8 rather than stringifying it', () => {
    expect(asText(bytes('<h1>Hello</h1>'))).toBe('<h1>Hello</h1>');
  });

  it('decodes multi-byte characters as one character each', () => {
    // The index provenance hands over is a UTF-16 code-unit offset into this string. A decode that
    // produced one character per *byte* would put every offset after the first non-ASCII character
    // in the wrong place, and the splice would land mid-word.
    const text = '<p>Grüße — naïve 🎨</p>';
    expect(asText(bytes(text))).toBe(text);
    expect(asText(bytes(text)).length).toBe(text.length);
  });

  it('reads an empty buffer as an empty string, not as a stringified object', () => {
    // A file that exists and is empty is an ordinary state — `/overrides.css` before the first
    // override is written is exactly this, and it is parsed rather than special-cased.
    expect(asText(bytes(''))).toBe('');
  });

  it('preserves the exact bytes of a file that is about to be rewritten', () => {
    // The round-trip property the write paths depend on: read, splice, write. Anything lossy here
    // corrupts a file that was only meant to have one attribute changed.
    const source = '<!doctype html>\n<html>\n  <body>\n    <img src="/a.png">\n  </body>\n</html>\n';
    expect(asText(bytes(source))).toBe(source);
  });
});
