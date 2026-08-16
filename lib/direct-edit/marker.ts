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
 * Lowercase-only and digit-inclusive so the id is safe in an attribute value, in a CSS attribute
 * selector, and in a filename, without escaping anywhere. 36^8 ≈ 2.8e12 keeps accidental collision
 * within one project negligible; uniqueness is not enforced, only made improbable — the duplicate
 * check in the §6 sweep exists because the *agent copying a marked element* is the realistic way
 * two elements end up sharing an id, not chance.
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

function isSpace(ch: string | undefined): boolean {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\f' || ch === '\r';
}

/**
 * Find `data-osw-id`'s value among the attributes of one open tag, or `null`.
 *
 * Walks attributes rather than regex-matching the region, because a regex matches the marker's
 * spelling wherever it appears — including inside *another attribute's value*
 * (`title=" data-osw-id='x'"`). That reads as a false positive, `stampMarker` then declares the
 * element already marked, and the rule written for it targets nothing. Attribute values are
 * consumed as values here, so they cannot be mistaken for names.
 *
 * Mustaches are opaque for the same reason they are in `findTagEnd`: `{{#if a}}title="x>y"{{/if}}`
 * is not attribute syntax and must not be tokenized as if it were.
 */
function readMarkerIn(s: string, tag: OpenTag): string | null {
  const to = tag.tagEnd;
  let i = tag.nameEnd;

  while (i < to) {
    if (s.startsWith('{{{', i)) { const e = s.indexOf('}}}', i + 3); i = e === -1 || e >= to ? to : e + 3; continue; }
    if (s.startsWith('{{', i))  { const e = s.indexOf('}}', i + 2);  i = e === -1 || e >= to ? to : e + 2; continue; }

    const c = s[i];
    if (isSpace(c) || c === '/') { i++; continue; }
    // Redundant with `to` on well-formed markup — both land on the same character — and kept
    // because each covers the other's failure mode: without `to` a truncated tag scans to end of
    // file, and without this break a `>` at an attribute-name position advances nothing and spins.
    if (c === '>') break;
    // A quote where an attribute name should be is malformed markup; skip the span rather than
    // reading its contents as names.
    if (c === '"' || c === "'") { const e = s.indexOf(c, i + 1); i = e === -1 || e >= to ? to : e + 1; continue; }

    const nameStart = i;
    while (i < to && !isSpace(s[i]) && s[i] !== '=' && s[i] !== '/' && s[i] !== '>' &&
           s[i] !== '"' && s[i] !== "'" && !s.startsWith('{{', i)) i++;
    const name = s.slice(nameStart, i).toLowerCase();

    while (i < to && isSpace(s[i])) i++;
    if (s[i] !== '=') continue;              // valueless attribute — next name starts here
    i++;
    while (i < to && isSpace(s[i])) i++;

    let value: string;
    const q = s[i];
    if (q === '"' || q === "'") {
      const e = s.indexOf(q, i + 1);
      const end = e === -1 || e >= to ? to : e;
      value = s.slice(i + 1, end);
      i = end + 1;
    } else {
      const vStart = i;
      while (i < to && !isSpace(s[i]) && s[i] !== '>') i++;
      value = s.slice(vStart, i);
    }

    if (name === MARKER_ATTR) return value;
  }

  return null;
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
