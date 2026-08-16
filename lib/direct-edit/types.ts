/**
 * Shared types for the direct-edit write path.
 *
 * Direct editing turns a click in the preview into a durable style override: a stable
 * `data-osw-id` marker stamped into project *source*, plus a rule in `/overrides.css`. These types
 * describe the two ends of that path — where a selection resolves to in source, and what a single
 * apply did.
 */

/**
 * Where a preview selection came from in project source.
 *
 * `'runtime-unsupported'` is in the union although nothing emits it yet. The spec defines it, and
 * adding a member to a union later breaks every exhaustive `switch` already written against the
 * narrower type — cheaper to carry it from the start than to widen it under callers.
 */
export type SourceResolution =
  | { kind: 'resolved'; file: string; tagStart: number }
  | { kind: 'one-to-many'; file: string; tagStart: number; instances: number }
  | { kind: 'unresolvable'; reason: 'generated' | 'malformed' | 'runtime-unsupported' };

/**
 * The part of the preview's selection payload the write path reads.
 *
 * Structural and partial by design. The selector script sends more (`domPath`, `outerHTML`, …) and
 * will send more still; naming only what is consumed keeps `lib/direct-edit/` from depending on the
 * payload's shape. Every field is optional because every one of them can legitimately be absent —
 * a JS-generated element has no `srcAttr`, and `gatherAttributes` caps its output, so `attributes`
 * may not contain the marker even when the element carries one.
 */
export interface PreviewSelection {
  /** The `data-osw-src` value the preview compile stamped, as `<path>:<index>`. */
  srcAttr?: string | null;
  /** How many rendered elements share that one source tag. Absent means one. */
  instanceCount?: number;
  /** Lowercased tag name, used to detect a `tagStart` that has gone stale. */
  tagName?: string;
  attributes?: Record<string, string>;
}

/** A single CSS declaration to write into `/overrides.css`. */
export interface StyleDeclaration {
  property: string;
  value: string;
}

/**
 * What one `applyStyleOverride` call did, or why it did nothing.
 *
 * Every refusal is reported rather than thrown, because all of them are ordinary states a UI has to
 * render — a selection the compile cannot place, a shared partial awaiting confirmation, a preview
 * that has gone stale — not programmer errors.
 */
export interface ApplyResult {
  ok: boolean;
  reason?: 'unresolvable' | 'generating' | 'needs-confirmation' | 'stale-index'
         | 'missing-file' | 'ambiguous-stylesheet';
  /** The marker the override is keyed to. Present whenever one was read or stamped. */
  markerId?: string;
  /** Every path actually written, in write order. Empty on every refusal. */
  filesWritten?: string[];
  /** The source file a refusal concerns — the shared partial, the missing or stale file. */
  file?: string;
  /** How many rendered elements share the source tag. Set with `needs-confirmation`. */
  instances?: number;
  /** Pages that carry no `</head>`, so the stylesheet link could not be added to them. */
  skippedPages?: string[];
  /**
   * How many elements in the project carry this marker. Above 1 the override is mis-targeted
   * rather than merely inert — the agent has duplicated a marked element. See Task 5.
   */
  duplicateCount?: number;
  /** The refusal's detail, where there is one worth showing — currently the thrown CSS message. */
  message?: string;
}
