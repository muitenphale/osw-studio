import type { StyleDeclaration } from './types';
import { MARKER_ATTR } from './marker';

/**
 * `/overrides.css` — the stylesheet direct editing accumulates into.
 *
 * Line-oriented parser; indexOf plus brace counting corrupts comments, strings, nested blocks
 * and media queries.
 */

/**
 * Header written only into an empty file. Deliberately free of any `[data-osw-id="…"]` text: the
 * scan throws on the marker selector appearing inside a comment, and a header that spelled one out
 * would poison every later upsert.
 */
export const OVERRIDES_HEADER = `/* OSW Studio style overrides.
 *
 * Each block below is keyed to one element by the data-osw-id attribute stamped on it in source.
 * Direct edits in the preview rewrite these blocks; anything you write outside them is preserved
 * byte for byte. The selector is doubled so it has the specificity of two classes, which lets it
 * beat an ordinary compound selector on source order alone, without forcing priority.
 *
 * A block whose marker no longer exists anywhere in the project has no effect and is safe to
 * delete.
 */`;

/** CSS property names, including custom properties and vendor prefixes. */
const PROPERTY_RE = /^-{0,2}[a-zA-Z][a-zA-Z0-9-]*$/;

/** Marker ids safe inside both an HTML attribute and a CSS attribute selector. */
const SAFE_ID = /^[A-Za-z0-9_-]+$/;

/** Exported as a pattern (not a function) because the frame script needs the same selector as a string. */
export const MARKER_SELECTOR_TEMPLATE = `[${MARKER_ATTR}="{id}"][${MARKER_ATTR}]`;

/** The canonical selector for one marker. Doubled — see OVERRIDES_HEADER. */
function selectorFor(markerId: string): string {
  // A replacement *function*, so a `$&` or `$'` in the id cannot be read as a replacement pattern.
  return MARKER_SELECTOR_TEMPLATE.replace('{id}', () => markerId);
}

/** The substring that identifies a mention of this marker anywhere in the file. */
function needleFor(markerId: string): string {
  return `[${MARKER_ATTR}="${markerId}"]`;
}

/**
 * Reject anything that could terminate the declaration and continue as CSS of its own.
 *
 * The property is validated as strictly as the value. An injected property name escapes the block
 * exactly as well as an injected value does — `color; } body { color` is a complete escape and
 * looks harmless next to a plain `red`.
 *
 * A consequence worth knowing: a legitimate value containing `}` (`content: "}"`) is refused. That
 * is a deliberate trade — direct editing sets lengths, colours and spacing, and no shelf control
 * produces such a value, so the check costs nothing real and removes a whole class of escape.
 */
function assertSafeDeclaration(decl: StyleDeclaration): void {
  if (!PROPERTY_RE.test(decl.property)) {
    throw new Error(`Refusing unsafe CSS property ${JSON.stringify(decl.property)}`);
  }
  const value = decl.value.trim();
  if (value === '') {
    throw new Error('Refusing an empty CSS value');
  }
  if (/[;{}]/.test(value) || value.includes('/*') || value.includes('*/')) {
    throw new Error(`Refusing unsafe CSS value ${JSON.stringify(decl.value)}`);
  }
}

function assertSafeMarkerId(markerId: string): void {
  if (!SAFE_ID.test(markerId)) {
    throw new Error(`Refusing unsafe marker id ${JSON.stringify(markerId)}`);
  }
}

interface TopLevelBlock {
  /** Selector text as written, before normalisation. */
  selector: string;
  /** Index of the first non-whitespace character of the selector — never the preceding newline. */
  start: number;
  braceOpen: number;
  /** Index just past the closing `}`. */
  end: number;
}

/**
 * Locate every top-level `{ … }` block, and refuse outright if this marker is mentioned somewhere
 * we must not edit.
 *
 * Throws when the marker's selector appears inside a comment (the next `{` would belong to someone
 * else's rule) or at brace depth > 0 (inside `@media`, `@supports`, or a nested rule — editing
 * there would silently scope the override to that context).
 */
function scanTopLevel(css: string, needle: string): TopLevelBlock[] {
  const n = css.length;
  const blocks: TopLevelBlock[] = [];
  let i = 0;
  let depth = 0;
  let segStart = 0;
  let braceOpen = -1;

  while (i < n) {
    if (css.startsWith('/*', i)) {
      const e = css.indexOf('*/', i + 2);
      const end = e === -1 ? n : e + 2;
      if (css.slice(i, end).includes(needle)) {
        throw new Error(
          `Refusing to edit /overrides.css: ${needle} appears inside a comment, so the block it ` +
          `belongs to cannot be identified. Remove the mention or the block by hand.`,
        );
      }
      // A comment sitting between the previous block and this one belongs to neither. Leaving it
      // inside the segment would make it part of the next block's "selector" — so the file header
      // would be prepended to the first rule's selector, which then matches nothing and causes a
      // duplicate block on every write — and would put it inside the range upsert replaces.
      if (depth === 0 && css.slice(segStart, i).trim() === '') segStart = end;
      i = end;
      continue;
    }

    const c = css[i];

    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n) {
        if (css[j] === '\\') { j += 2; continue; }
        if (css[j] === c) { j++; break; }
        if (css[j] === '\n') break;   // unterminated string; CSS ends it at the newline
        j++;
      }
      i = j;
      continue;
    }

    if (css.startsWith(needle, i)) {
      if (depth > 0) {
        throw new Error(
          `Refusing to edit /overrides.css: ${needle} is nested inside an at-rule or another ` +
          `block, where an edit would apply only in that context. Move it to the top level.`,
        );
      }
      // Top level: part of a selector. Fall through and keep scanning.
    }

    if (c === '{') {
      if (depth === 0) braceOpen = i;
      depth++;
      i++;
      continue;
    }

    if (c === '}') {
      if (depth > 0) depth--;
      if (depth === 0 && braceOpen !== -1) {
        const raw = css.slice(segStart, braceOpen);
        const lead = raw.length - raw.replace(/^\s+/, '').length;
        blocks.push({ selector: raw, start: segStart + lead, braceOpen, end: i + 1 });
        braceOpen = -1;
        segStart = i + 1;
      }
      i++;
      continue;
    }

    // A top-level statement that is not a block — `@import url(x);`, `@charset "utf-8";`. The next
    // selector starts after it, not at the top of the file.
    if (c === ';' && depth === 0) { segStart = i + 1; i++; continue; }

    i++;
  }

  return blocks;
}

/**
 * Compare selectors on structure rather than bytes, so a reformatted or minified copy of our own
 * block is still recognised as ours.
 *
 * Whitespace is collapsed, not stripped: `[…="a"] [data-osw-id]` is a descendant selector matching
 * different elements than `[…="a"][data-osw-id]`, and stripping would merge the two. Comments are
 * removed because the CSS tokenizer removes them: a comment between two compound selectors is not
 * a descendant combinator, so `.a`-comment-`.b` selects what `.a.b` selects.
 */
function normalizeSelector(selector: string): string {
  return selector.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').trim();
}

type BodyItem =
  | { kind: 'comment'; text: string }
  | { kind: 'decl'; property: string; value: string };

/**
 * Split a block body into declarations, keeping hand-written comments as items so re-emitting the
 * block does not delete them.
 */
function parseBody(body: string): BodyItem[] {
  const items: BodyItem[] = [];
  const n = body.length;
  let buf = '';
  let i = 0;

  const flush = () => {
    const text = buf.trim();
    buf = '';
    if (text === '') return;
    const colon = firstTopLevelColon(text);
    if (colon === -1) return;   // not a declaration; drop rather than re-emit as garbage
    items.push({
      kind: 'decl',
      property: text.slice(0, colon).trim(),
      value: text.slice(colon + 1).trim(),
    });
  };

  while (i < n) {
    if (body.startsWith('/*', i)) {
      const e = body.indexOf('*/', i + 2);
      const end = e === -1 ? n : e + 2;
      items.push({ kind: 'comment', text: body.slice(i, end) });
      i = end;
      continue;
    }
    const c = body[i];
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n) {
        if (body[j] === '\\') { j += 2; continue; }
        if (body[j] === c) { j++; break; }
        if (body[j] === '\n') break;
        j++;
      }
      buf += body.slice(i, j);
      i = j;
      continue;
    }
    if (c === '(') {
      let j = i + 1;
      let par = 1;
      while (j < n && par > 0) {
        if (body[j] === '(') par++;
        else if (body[j] === ')') par--;
        j++;
      }
      buf += body.slice(i, j);
      i = j;
      continue;
    }
    if (c === ';') { flush(); i++; continue; }
    buf += c;
    i++;
  }
  flush();
  return items;
}

/**
 * Index of the colon that separates property from value.
 *
 * The FIRST colon at paren depth zero — the opposite of `data-osw-src`, which splits on the last.
 * A value may contain colons (`url(https://…)`, `background: linear-gradient(…)`), a property name
 * may not, so splitting late would move part of the value into the property and fail validation on
 * the next write.
 */
function firstTopLevelColon(text: string): number {
  let par = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '(') par++;
    else if (c === ')') { if (par > 0) par--; }
    else if (c === ':' && par === 0) return i;
  }
  return -1;
}

function renderBlock(selector: string, items: BodyItem[]): string {
  const lines = items.map((item) =>
    item.kind === 'comment' ? `  ${item.text}` : `  ${item.property}: ${item.value};`);
  return `${selector} {\n${lines.join('\n')}\n}`;
}

/** The owned top-level blocks for a marker, in document order. */
function ownedBlocks(css: string, markerId: string): TopLevelBlock[] {
  const canonical = selectorFor(markerId);
  return scanTopLevel(css, needleFor(markerId))
    .filter((b) => normalizeSelector(b.selector) === canonical);
}

/**
 * Set one declaration on a marker's block, creating the block (and the file body) if needed.
 *
 * Returns the new file content; never mutates. Throws rather than editing whenever the marker's
 * ownership of a block is ambiguous — see the module comment for which cases and why.
 *
 * When more than one top-level block carries the marker's selector (only reachable by hand
 * editing), the LAST is edited, because that is the one that wins the cascade and therefore the one
 * whose values the user is actually seeing.
 */
export function upsertDeclaration(
  css: string,
  markerId: string,
  declaration: StyleDeclaration,
): string {
  assertSafeMarkerId(markerId);
  assertSafeDeclaration(declaration);

  const property = declaration.property;
  const value = declaration.value.trim();
  const selector = selectorFor(markerId);
  const owned = ownedBlocks(css, markerId);

  if (owned.length > 0) {
    const block = owned[owned.length - 1];
    const items = parseBody(css.slice(block.braceOpen + 1, block.end - 1));
    const existing = items.find(
      (item) => item.kind === 'decl' && item.property.toLowerCase() === property.toLowerCase(),
    );
    if (existing && existing.kind === 'decl') {
      existing.property = property;
      existing.value = value;
    } else {
      items.push({ kind: 'decl', property, value });
    }
    return css.slice(0, block.start) + renderBlock(selector, items) + css.slice(block.end);
  }

  const rendered = renderBlock(selector, [{ kind: 'decl', property, value }]);

  if (css.trim() === '') {
    return `${OVERRIDES_HEADER}\n\n${rendered}\n`;
  }
  // Append rather than prepend: hand-written rules keep their source order, and ours loads last,
  // which is what the (0,2,0) specificity tie depends on.
  return css + (css.endsWith('\n') ? '' : '\n') + rendered + '\n';
}

/** Cut one block out of the file, taking the newline that terminated it. */
function cutBlock(css: string, block: TopLevelBlock): string {
  const end = css[block.end] === '\n' ? block.end + 1 : block.end;
  return css.slice(0, block.start) + css.slice(end);
}

/**
 * Removes one declaration from a marker block; removes the block if empty.
 * Does not remove the marker from source. Returns input unchanged when no match.
 */
export function removeDeclaration(css: string, markerId: string, property: string): string {
  assertSafeMarkerId(markerId);
  if (!PROPERTY_RE.test(property)) {
    throw new Error(`Refusing unsafe CSS property ${JSON.stringify(property)}`);
  }

  const owned = ownedBlocks(css, markerId);
  if (owned.length === 0) return css;
  const wanted = property.toLowerCase();

  let out = css;
  // Back to front, so an earlier block's indices are still valid after a later one is rewritten.
  for (let i = owned.length - 1; i >= 0; i--) {
    const block = owned[i];
    const items = parseBody(out.slice(block.braceOpen + 1, block.end - 1));
    const kept = items.filter(
      (item) => !(item.kind === 'decl' && item.property.toLowerCase() === wanted),
    );
    if (kept.length === items.length) continue;
    out = kept.some((item) => item.kind === 'decl')
      ? out.slice(0, block.start) + renderBlock(selectorFor(markerId), kept) + out.slice(block.end)
      : cutBlock(out, block);
  }
  return out;
}

/** What properties this element has in /overrides.css. Throws on parse failure rather than returning []. */
export function declaredProperties(css: string, markerId: string): string[] {
  assertSafeMarkerId(markerId);
  const seen: string[] = [];
  for (const block of ownedBlocks(css, markerId)) {
    for (const item of parseBody(css.slice(block.braceOpen + 1, block.end - 1))) {
      if (item.kind !== 'decl') continue;
      const property = item.property.toLowerCase();
      if (!seen.includes(property)) seen.push(property);
    }
  }
  return seen;
}

/**
 * Removes the entire block for a marker.
 *
 * Returns the input unchanged when the marker owns nothing. Throws on the same ambiguity cases as
 * `upsertDeclaration`.
 */
export function removeMarkerBlock(css: string, markerId: string): string {
  assertSafeMarkerId(markerId);
  const owned = ownedBlocks(css, markerId);
  if (owned.length === 0) return css;

  let out = css;
  // Back to front, so an earlier block's indices are still valid after a later one is removed.
  for (let i = owned.length - 1; i >= 0; i--) {
    out = cutBlock(out, owned[i]);
  }
  return out;
}
