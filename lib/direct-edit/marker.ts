import { readOpenTagAt } from '@/lib/preview/provenance';

/**
 * Stable per-element markers stamped into project *source*.
 *
 * A marker is the anchor a style override hangs from. `data-osw-src` is compile-time
 * instrumentation that never reaches source and is regenerated (with different indices) on every
 * compile; `data-osw-id` is authored into the file and ships with the project, which is what makes
 * an override survive an edit, a rebuild and an export.
 *
 * Pure — no VFS, no DOM. The orchestrator reads the file, calls these on the string, and writes.
 */

import type { OpenTag } from '@/lib/preview/provenance';
import { findAttributeIn } from './attributes';

/**
 * The attribute name. Changing it invalidates every marker already stamped into every project's
 * source *and* every rule already written into their `/overrides.css`, so it is effectively frozen.
 */
export const MARKER_ATTR = 'data-osw-id';

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const ID_LENGTH = 8;

/** Ids we are willing to write into an attribute. Nothing here can terminate the value. */
const SAFE_ID = /^[A-Za-z0-9_-]+$/;

/**
 * A fresh marker id: 8 characters of `[a-z0-9]`.
 *
 * 36^8 ~ 2.8 x 10^12 keeps collision negligible; not enforced, only improbable.
 */
export function newMarkerId(): string {
  const c = globalThis.crypto;
  let out = '';
  if (c && typeof c.getRandomValues === 'function') {
    const buf = new Uint32Array(ID_LENGTH);
    c.getRandomValues(buf);
    for (let i = 0; i < ID_LENGTH; i++) out += ID_ALPHABET[buf[i] % ID_ALPHABET.length];
    return out;
  }
  for (let i = 0; i < ID_LENGTH; i++) {
    out += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)];
  }
  return out;
}

/** Delegates to findAttributeIn. */
function readMarkerIn(s: string, tag: OpenTag): string | null {
  return findAttributeIn(s, tag, MARKER_ATTR)?.value ?? null;
}

/**
 * Read the marker on the element whose open tag starts at `index`, or `null`.
 *
 * Scoped to that one tag — never the whole file — so a marker on the previous or the next element
 * cannot be mistaken for this one's. `index` arrives from a document that may be one compile stale,
 * which is exactly when an unscoped search returns a confidently wrong id.
 */
export function readMarkerAt(content: string, index: number): string | null {
  const tag = readOpenTagAt(content, index);
  if (!tag) return null;
  return readMarkerIn(content, tag);
}

export interface StampResult {
  changed: boolean;
  content: string;
  /** The id already present, when `changed` is false. */
  existing?: string;
}

/**
 * Stamp `id` onto the element whose open tag starts at `index`.
 *
 * Idempotent: an element that already carries a marker keeps it, and its id is returned so the
 * caller writes the override against the *existing* id rather than one nothing in the file uses.
 *
 * The attribute goes immediately after the tag name, before author attributes, so an author's
 * diff shows one insertion at a predictable place instead of a change at the end of a long
 * attribute list.
 *
 * Throws when `index` is not an element open tag. That is the stale-index signal: the caller's
 * index came from a compile that may no longer describe the file, and a silent no-op would be
 * reported to the user as a successful edit that did nothing.
 */
export function stampMarker(content: string, index: number, id: string): StampResult {
  if (!SAFE_ID.test(id)) {
    throw new Error(`Refusing to stamp unsafe marker id ${JSON.stringify(id)}`);
  }

  const tag = readOpenTagAt(content, index);
  if (!tag) {
    throw new Error(`Index ${index} is not an open tag`);
  }

  const existing = readMarkerIn(content, tag);
  if (existing !== null) return { changed: false, content, existing };

  const insert = ` ${MARKER_ATTR}="${id}"`;
  return {
    changed: true,
    content: content.slice(0, tag.nameEnd) + insert + content.slice(tag.nameEnd),
  };
}
