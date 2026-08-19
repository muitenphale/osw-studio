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
 * `'runtime-unsupported'` is in the union for forward compatibility.
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

/** Every refusal is reported rather than thrown; all are ordinary UI states. */
export interface ApplyResult {
  ok: boolean;
  /**
   * Shared union across all action paths. Unrecognised reasons fall through to unresolvable.
   */
  reason?: 'unresolvable' | 'generating' | 'needs-confirmation' | 'stale-index'
         | 'missing-file' | 'ambiguous-stylesheet' | 'no-src' | 'expression-src'
         | 'has-children' | 'has-expression' | 'unclosed' | 'void-element';
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
