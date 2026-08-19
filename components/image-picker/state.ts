/** Pure functions for the image picker. */

import type { ApplyResult } from '@/lib/direct-edit/types';

/** Includes svg (text format but an image) and avif (not in SUPPORTED_EXTENSIONS.image but valid in projects). */
const IMAGE_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp', 'svg', 'avif',
]);

export function isImagePath(path: string): boolean {
  const name = path.split('/').pop() ?? '';
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return false;
  return IMAGE_EXTENSIONS.has(name.slice(dot + 1).toLowerCase());
}

/** `/.skills/…`, `/.server/…` and friends never ship, so they are never a `src` worth offering. */
function isHidden(path: string): boolean {
  const first = path.split('/').filter(Boolean)[0];
  return !!first && first.startsWith('.');
}

/**
 * The images in a project, in path order.
 *
 * Takes the fields it reads rather than `VirtualFile`, so a test does not have to build one. Sorted
 * by path so the list is stable across reloads — the adapter's order is not.
 */
export function projectImages<T extends { path: string; type?: string }>(files: T[]): T[] {
  return files
    .filter(file => file.type !== 'directory' && !isHidden(file.path) && isImagePath(file.path))
    .sort((a, b) => a.path.localeCompare(b.path));
}

/** Most common parent directory of existing images in the project. */
export function uploadDirectory(imagePaths: string[]): string {
  const counts = new Map<string, number>();
  for (const path of [...imagePaths].sort()) {
    const slash = path.lastIndexOf('/');
    const dir = slash <= 0 ? '/' : path.slice(0, slash);
    counts.set(dir, (counts.get(dir) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [dir, count] of counts) {
    if (count > bestCount) { best = dir; bestCount = count; }
  }
  return best ?? '/images';
}

/** The refusals a `applyImageSrc` can produce. `needs-confirmation` is handled separately. */
export type ImageRefusalReason =
  | 'unresolvable'
  | 'generating'
  | 'stale-index'
  | 'missing-file'
  | 'no-src'
  | 'expression-src';

const IMAGE_REFUSAL_REASONS: readonly ImageRefusalReason[] = [
  'unresolvable', 'generating', 'stale-index', 'missing-file', 'no-src', 'expression-src',
];

export interface ImageRefusal {
  reason: ImageRefusalReason;
  file?: string;
}

/** Narrows ApplyResult reasons to those the image picker can render. */
export function imageRefusal(result: ApplyResult): ImageRefusal | null {
  if (result.ok || result.reason === 'needs-confirmation') return null;
  const reason = IMAGE_REFUSAL_REASONS.includes(result.reason as ImageRefusalReason)
    ? (result.reason as ImageRefusalReason)
    : 'unresolvable';
  return { reason, file: result.file };
}

/** Separate from message so the headline does not contradict the detail. */
export function imageRefusalTitle(refusal: ImageRefusal): string {
  switch (refusal.reason) {
    case 'generating':      return 'The agent is working';
    case 'stale-index':     return 'The preview is out of date';
    case 'missing-file':    return 'The source file is gone';
    case 'no-src':          return 'Nothing to replace';
    case 'expression-src':  return 'This image is set by the template';
    case 'unresolvable':    return 'Nothing to replace here';
  }
}

/**
 * What the picker says about a refusal.
 *
 * Each says what happened and, separately, whether trying again can help — different questions
 * whose answers do not line up. `expression-src` is the one worth spelling out: the refusal is not
 * a limitation to work around but the reason the image is right in the first place, and writing the
 * literal would both put a wrong path in the file and delete the binding that computes the real one.
 */
export function imageRefusalMessage(refusal: ImageRefusal): string {
  switch (refusal.reason) {
    case 'generating':
      return 'The agent is editing this project. Image changes wait until it finishes.';
    case 'stale-index':
      return `The preview is out of date${refusal.file ? `: ${refusal.file} has changed since it was compiled` : ''}. `
        + 'Refresh the preview and select the image again.';
    case 'missing-file':
      return `${refusal.file ?? 'The source file'} no longer exists, so there is nothing to edit. `
        + 'Refreshing will not help — ask the agent to rebuild it.';
    case 'no-src':
      return `This image has no src to change${refusal.file ? ` in ${refusal.file}` : ''} — it is set somewhere else, `
        + 'most likely by a script or a condition. Ask the agent to change it instead.';
    case 'expression-src':
      return 'This image\'s address comes from the template, not from the page, so replacing it here '
        + 'would break the link and still show the wrong picture. Ask the agent to change what the '
        + 'template points at.';
    case 'unresolvable':
      return 'This image is built at runtime, so there is no source tag to edit. '
        + 'Ask the agent to change it instead.';
  }
}

/** Whether the refusal is worth offering the agent. A wait or a refresh is not. */
export function imageRefusalOffersAgent(refusal: ImageRefusal): boolean {
  return refusal.reason === 'unresolvable' || refusal.reason === 'missing-file'
    || refusal.reason === 'no-src' || refusal.reason === 'expression-src';
}

/** What the picker says before writing to a source tag that renders more than once. */
export function imageConfirmationMessage(instances: number, file?: string): string {
  const where = file ? ` from ${file}` : '';
  return instances > 1
    ? `This image${where} is rendered ${instances} times. Replacing it replaces all ${instances}.`
    : `This image${where} is shared. Replacing it replaces every place it renders.`;
}
