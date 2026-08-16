/**
 * The direct-edit orchestrator — the only module in `lib/direct-edit/` that touches the VFS.
 *
 * One call turns "this element, this declaration" into durable project files: a `data-osw-id`
 * stamped into source, a rule in `/overrides.css`, and a `<link>` to it in every page. Everything
 * it needs to locate the element comes from the selection payload's `data-osw-src`; nothing here
 * matches positions between the rendered tree and the source tree.
 *
 * **The order of operations is the design.** Two parts of it are load-bearing and invisible when
 * wrong:
 *
 * 1. *The source file is read once and written once.* The marker stamp and the `<link>` insertion
 *    are applied to the same string. Two writes would clobber — the second write's content was read
 *    before the first landed — and doing the link first would shift every index after `<head>`,
 *    including the `tagStart` the stamp needs.
 * 2. *`/overrides.css` is written silently; source files are not.* That file carries no provenance
 *    indices, so a silent write invalidates nothing and avoids a recompile. A source write shifts
 *    every `data-osw-src` after the insertion point, and those indices are already rendered into the
 *    live document with nothing to correct them — so it must announce itself. Getting this backwards
 *    produces identical file content and breaks the *next* edit.
 *
 * Nothing calls this yet; the shelf UI is a later plan.
 */

import { vfs } from '@/lib/vfs';
import { readOpenTagAt } from '@/lib/preview/provenance';
import { resolveSelection } from './resolution';
import { MARKER_ATTR, newMarkerId, readMarkerAt, stampMarker } from './marker';
import { ensureOverridesLink } from './link-invariant';
import { upsertDeclaration } from './overrides-css';
import type { ApplyResult, PreviewSelection, StyleDeclaration } from './types';

/** Where the override stylesheet lives. Root and undotted, so no export filter drops it. */
export const OVERRIDES_PATH = '/overrides.css';

/**
 * Elements whose content is text rather than markup, so the duplicate scan must jump to the closing
 * tag. Not imported from `lib/preview/provenance.ts`, which keeps its copy private; the two lists
 * are independent by intent — provenance's exists to avoid *tagging* inside raw text, this one to
 * avoid *counting* a marker that is only a string in a script.
 */
const RAW_TEXT_TAGS = new Set(['script', 'style', 'title', 'textarea']);

/** Pages that can hold a `<head>`. `.hbs` partials are swept by nothing: they have no head. */
const PAGE_RE = /\.html?$/i;

/** Files a marker can be stamped into, for the duplicate scan. */
const MARKUP_RE = /\.(html?|hbs|handlebars)$/i;

/** `/.skills/…`, `/.server/…` and friends never ship and are never edit targets. */
function isHidden(path: string): boolean {
  const first = path.split('/').filter(Boolean)[0];
  return !!first && first.startsWith('.');
}

function isPage(path: string): boolean {
  return PAGE_RE.test(path) && !isHidden(path);
}

/**
 * File content as text.
 *
 * A markup or CSS file is stored as a string by every writer in the codebase; the ArrayBuffer arm
 * exists because `VirtualFile.content` permits one and decoding is strictly better than the
 * alternative, which is treating the file as empty and overwriting it.
 */
function asText(content: string | ArrayBuffer): string {
  return typeof content === 'string' ? content : new TextDecoder().decode(content);
}

/**
 * Apply one CSS declaration to the selected element, durably.
 *
 * `isGenerating` is injected rather than imported: `lib/stores/` pulls in the orchestrator, sonner,
 * telemetry and the provider registry, and nothing under `lib/` imports the store today. The UI
 * passes `() => useWorkspaceStore.getState().isProjectGenerating(projectId)`.
 *
 * `confirmedMultiInstance` is required — not advisory — when the element resolves to a shared
 * partial. Editing one is a global effect from a local gesture, so the refusal lives at the API
 * rather than in whichever UI happens to remember.
 */
export async function applyStyleOverride(
  projectId: string,
  selection: PreviewSelection,
  declaration: StyleDeclaration,
  opts?: { confirmedMultiInstance?: boolean; isGenerating?: () => boolean },
): Promise<ApplyResult> {
  // 1. Gate. A write landing mid-generation races the agent's own edits over the same files.
  if (opts?.isGenerating?.()) return { ok: false, reason: 'generating', filesWritten: [] };

  const filesWritten: string[] = [];
  const skippedPages: string[] = [];

  // 2. Fast path. After the first edit the element carries its marker, so re-editing it is a pure
  //    `/overrides.css` update: no resolution, no source write. `attributes` can miss the marker on
  //    an attribute-heavy element (gatherAttributes caps its output), which costs the slow path but
  //    is not wrong — the slow path reads the same id back out of source.
  let markerId = selection.attributes?.[MARKER_ATTR];
  let sourceFile: string | undefined;

  if (!markerId) {
    // 3. Resolve.
    const resolution = resolveSelection(selection);
    if (resolution.kind === 'unresolvable') {
      return { ok: false, reason: 'unresolvable', filesWritten: [] };
    }
    if (resolution.kind === 'one-to-many' && !opts?.confirmedMultiInstance) {
      return {
        ok: false,
        reason: 'needs-confirmation',
        file: resolution.file,
        instances: resolution.instances,
        filesWritten: [],
      };
    }

    const file = resolution.file;

    // 4. Read the source once. `readFile` throws when the file is gone, which is the likeliest
    //    stale case: the agent deleted or renamed it since the preview compiled.
    let original: string;
    try {
      original = asText((await vfs.readFile(projectId, file)).content);
    } catch {
      return { ok: false, reason: 'missing-file', file, filesWritten: [] };
    }

    // 5. Validate the index against the tag name the payload carries. A stale `tagStart` usually
    //    still lands on *some* valid open tag, which passes a `<`-plus-letter check and stamps the
    //    marker onto the wrong element permanently. The tag name is what narrows it.
    const tag = readOpenTagAt(original, resolution.tagStart);
    if (!tag || (selection.tagName && tag.tagName !== selection.tagName.toLowerCase())) {
      return { ok: false, reason: 'stale-index', file, filesWritten: [] };
    }

    // 6. Stamp, then link, then write — once, in that order. See the module comment.
    const candidate = newMarkerId();
    const stamp = stampMarker(original, resolution.tagStart, candidate);
    markerId = stamp.existing ?? candidate;

    let next = stamp.content;
    if (isPage(file)) {
      const linked = ensureOverridesLink(next);
      if (linked.skipped === 'no-head') skippedPages.push(file);
      next = linked.content;
    }
    if (next !== original) {
      await vfs.updateFile(projectId, file, next);
      filesWritten.push(file);
    }
    sourceFile = file;
  }

  // 7. The override stylesheet. Silent — see the module comment.
  try {
    const exists = await vfs.fileExists(projectId, OVERRIDES_PATH);
    const current = exists ? asText((await vfs.readFile(projectId, OVERRIDES_PATH)).content) : '';
    const nextCss = upsertDeclaration(current, markerId, declaration);
    if (!exists) {
      await vfs.createFile(projectId, OVERRIDES_PATH, nextCss, { silent: true });
      filesWritten.push(OVERRIDES_PATH);
    } else if (nextCss !== current) {
      await vfs.updateFile(projectId, OVERRIDES_PATH, nextCss, { silent: true });
      filesWritten.push(OVERRIDES_PATH);
    }
  } catch (error) {
    // `upsertDeclaration` throws rather than guessing which block is ours — the selector found in a
    // comment or nested in an at-rule — and on an unsafe property, value or marker id. A
    // hand-edited stylesheet must reach the user as a message, not an unhandled rejection. Any
    // marker already stamped above stays; an unreferenced marker is inert.
    return {
      ok: false,
      reason: 'ambiguous-stylesheet',
      message: error instanceof Error ? error.message : String(error),
      markerId,
      filesWritten,
    };
  }

  // 8. Link sweep over every other page. Running it on every apply is what makes the link an
  //    invariant rather than a one-time write: a page the agent adds later picks it up on the next
  //    edit instead of silently losing every override on it.
  for (const page of await vfs.listDirectory(projectId, '/')) {
    if (!isPage(page.path) || page.path === sourceFile) continue;
    const linked = ensureOverridesLink(asText(page.content));
    if (linked.skipped === 'no-head') {
      skippedPages.push(page.path);
      continue;
    }
    if (linked.changed) {
      await vfs.updateFile(projectId, page.path, linked.content);
      filesWritten.push(page.path);
    }
  }

  return {
    ok: true,
    markerId,
    filesWritten,
    skippedPages,
    duplicateCount: await countMarkerOccurrences(projectId, markerId),
  };
}

/**
 * How many elements in the project carry `markerId`.
 *
 * The one case where direct editing's inert-failure property does not hold: an override whose
 * element was deleted does nothing, but an override whose element the agent *duplicated* applies to
 * both copies. Only the second is worth warning about, so this counts elements rather than
 * substrings — a false positive here is a warning the user cannot act on, which teaches them to
 * ignore the real one.
 */
export async function countMarkerOccurrences(projectId: string, markerId: string): Promise<number> {
  let count = 0;
  for (const file of await vfs.listDirectory(projectId, '/')) {
    if (!MARKUP_RE.test(file.path) || isHidden(file.path)) continue;
    count += countMarkerInMarkup(asText(file.content), markerId);
  }
  return count;
}

/**
 * Count open tags carrying `markerId` in one markup string.
 *
 * Skips comments, mustaches and raw-text content, so commented-out markup and a marker quoted
 * inside a `<script>` are not counted as live elements. The tag reading itself is `readOpenTagAt`
 * and `readMarkerAt` — the shared scanner, not a third hand-rolled copy of the tag-name rule.
 */
function countMarkerInMarkup(content: string, markerId: string): number {
  const n = content.length;
  let count = 0;
  let i = 0;
  let lower: string | undefined;

  while (i < n) {
    if (content.startsWith('{{!--', i)) { const e = content.indexOf('--}}', i + 5); i = e === -1 ? n : e + 4; continue; }
    if (content.startsWith('{{{', i))   { const e = content.indexOf('}}}', i + 3);  i = e === -1 ? n : e + 3; continue; }
    if (content.startsWith('{{', i))    { const e = content.indexOf('}}', i + 2);   i = e === -1 ? n : e + 2; continue; }
    if (content.startsWith('<!--', i)) {
      // `<!-->` and `<!--->` are legal abrupt-closing empty comments; searching from i + 4 would
      // start past their terminator and swallow the rest of the file.
      if (content.startsWith('>', i + 4))  { i += 5; continue; }
      if (content.startsWith('->', i + 4)) { i += 6; continue; }
      const e = content.indexOf('-->', i + 4); i = e === -1 ? n : e + 3; continue;
    }

    const tag = readOpenTagAt(content, i);
    if (!tag) { i++; continue; }

    if (readMarkerAt(content, i) === markerId) count++;

    if (RAW_TEXT_TAGS.has(tag.tagName)) {
      lower ??= content.toLowerCase();
      const close = lower.indexOf(`</${tag.tagName}`, tag.tagEnd);
      i = close === -1 ? n : close;
    } else {
      i = tag.tagEnd;
    }
  }

  return count;
}
