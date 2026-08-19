/**
 * Type narrowing, commit scheduling, and optimistic overlay for style writes.
 * Dependencies (VFS, stores) are injected so the module is testable without side effects.
 */

import type { FocusContextPayload } from '@/lib/preview/types';
import type { ApplyResult, PreviewSelection, StyleDeclaration } from '@/lib/direct-edit/types';
import { WRITABLE_PROPERTIES, valueNames, type StyleProperty, type StyleUnit } from './properties';
import { pxPerUnit, unknownUnitContext, type UnitContext } from './controls';

/**
 * How long a stepper press waits before it is written.
 *
 * `applyStyleOverride` runs `countMarkerOccurrences` on every success, which char-scans every markup
 * file in the project. Unthrottled that runs on every press of `+`.
 */
export const COMMIT_DEBOUNCE_MS = 300;

/** Narrows FocusContextPayload to the fields the write path needs. */
export function toPreviewSelection(payload: FocusContextPayload): PreviewSelection {
  return {
    srcAttr: payload.srcAttr ?? null,
    instanceCount: payload.instanceCount,
    tagName: payload.tagName,
    attributes: payload.attributes,
  };
}

/** The shape of `applyStyleOverride`, as this module needs it. */
export type StyleWriter = (
  projectId: string,
  selection: PreviewSelection,
  declaration: StyleDeclaration,
  opts: { confirmedMultiInstance: boolean; isGenerating: () => boolean },
) => Promise<ApplyResult>;

export interface StyleApplyDeps {
  apply: StyleWriter;
  /** Injected, not imported: lib/direct-edit/ must not depend on lib/stores/. */
  isGenerating: () => boolean;
}

/** One committed declaration, against whichever element is selected when it runs. */
export type ApplyStyle = (
  selection: FocusContextPayload,
  declaration: StyleDeclaration,
  confirmedMultiInstance: boolean,
) => Promise<ApplyResult>;

/**
 * Bind a project and its dependencies to the write path.
 *
 * The *selection* is not bound: it is passed per call, so a commit that was scheduled before the
 * user clicked elsewhere is still written against the element it was made on.
 */
export function buildApplyStyle(projectId: string, deps: StyleApplyDeps): ApplyStyle {
  return (selection, declaration, confirmedMultiInstance) =>
    deps.apply(projectId, toPreviewSelection(selection), declaration, {
      confirmedMultiInstance,
      isGenerating: deps.isGenerating,
    });
}

/** The shape of `removeStyleOverride`, as this module needs it. */
export type StyleRemover = (
  projectId: string,
  selection: PreviewSelection,
  markerId: string,
  property: string,
  opts: { confirmedMultiInstance: boolean; isGenerating: () => boolean },
) => Promise<ApplyResult>;

/** Drop one property from the selected element's override block. */
export type RemoveStyle = (
  selection: FocusContextPayload,
  markerId: string,
  property: string,
  confirmedMultiInstance: boolean,
) => Promise<ApplyResult>;

export interface StyleRemoveDeps {
  remove: StyleRemover;
  /** Same gate, same reason as {@link StyleApplyDeps.isGenerating}. */
  isGenerating: () => boolean;
}

/** Bind a project and its dependencies to the removal path. The selection is passed per call. */
export function buildRemoveStyle(projectId: string, deps: StyleRemoveDeps): RemoveStyle {
  return (selection, markerId, property, confirmedMultiInstance) =>
    deps.remove(projectId, toPreviewSelection(selection), markerId, property, {
      confirmedMultiInstance,
      isGenerating: deps.isGenerating,
    });
}

/**
 * Reads which properties have overrides so Reset survives a reload.
 * No generation gate: reads cannot race the agent.
 */
export type ReadOverrides = (markerId: string) => Promise<readonly string[]>;

/** The number out of a value this panel wrote itself: `1.5rem` + `rem` → `1.5`, `2` + `` → `2`. */
export function writtenNumber(written: string, unit: string): number | null {
  const text = written.trim();
  const body = unit && text.endsWith(unit) ? text.slice(0, -unit.length) : text;
  const n = Number.parseFloat(body);
  return Number.isFinite(n) ? n : null;
}

/** Reads the unit from the value, not the entry default, so the overlay uses the unit the user picked. */
function writtenUnit(written: string): StyleUnit {
  const text = written.trim().toLowerCase();
  if (text.endsWith('rem')) return 'rem';
  if (text.endsWith('px')) return 'px';
  return '';
}

/** A written value in the computed shape the frame would answer with, or `null` if it has none. */
function computedForm(
  entry: StyleProperty,
  written: string,
  values: Record<string, string>,
  ctx: UnitContext,
): string | null {
  if (entry.control === 'swatch' || entry.kind === 'keyword') return written;
  const unit = writtenUnit(written);
  const n = writtenNumber(written, unit);
  if (n === null) return null;
  const per = pxPerUnit(entry, values, ctx, unit);
  // No divisor, no overlay. Showing the request against a guessed root size would put a number on
  // screen the element does not have.
  if (per === null) return null;
  return `${n * per}px`;
}

export function overlayRequested(
  computed: Record<string, string>,
  requested: Record<string, string>,
  ctx: UnitContext = unknownUnitContext,
): Record<string, string> {
  const values = { ...computed };
  // Sides included: a side is written like any other value, and iterating the table of *rows* meant
  // `padding-block-start` was never found here, so stepping a side moved nothing on screen until the
  // frame answered — which reads as a dead button.
  for (const entry of WRITABLE_PROPERTIES) {
    const written = requested[entry.property];
    if (typeof written !== 'string') continue;
    const resolved = computedForm(entry, written, values, ctx);
    if (resolved === null) continue;
    for (const name of valueNames(entry)) values[name] = resolved;
  }
  return values;
}

export interface CommitScheduler {
  /** Record a declaration and (re)arm the timer. A second call for the same property replaces it. */
  schedule: (declaration: StyleDeclaration) => void;
  /** Commit whatever is outstanding, now. A no-op when nothing is. */
  flush: () => void;
  /** Throw away whatever is outstanding. */
  cancel: () => void;
  /** What is outstanding, for the host's own bookkeeping. */
  pending: () => StyleDeclaration[];
}

/** Trailing-edge debounce. Multiple properties in one window commit together in touch order. */
export function createCommitScheduler(
  delayMs: number,
  commit: (declarations: StyleDeclaration[]) => void,
): CommitScheduler {
  const outstanding = new Map<string, string>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const disarm = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const flush = () => {
    disarm();
    if (outstanding.size === 0) return;
    const declarations = Array.from(outstanding, ([property, value]) => ({ property, value }));
    outstanding.clear();
    commit(declarations);
  };

  return {
    schedule(declaration) {
      outstanding.set(declaration.property, declaration.value);
      disarm();
      timer = setTimeout(flush, delayMs);
    },
    flush,
    cancel() {
      disarm();
      outstanding.clear();
    },
    pending() {
      return Array.from(outstanding, ([property, value]) => ({ property, value }));
    },
  };
}
