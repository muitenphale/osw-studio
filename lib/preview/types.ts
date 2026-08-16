export interface ProcessedFile {
  path: string;
  content: string | ArrayBuffer;
  mimeType: string;
  blobUrl?: string;
}

export interface Route {
  path: string;
  file: string;
  title?: string;
}

export interface CompiledProject {
  entryPoint: string;
  files: ProcessedFile[];
  routes: Route[];
  blobUrls: Map<string, string>;
}

export interface FocusContextPayload {
  domPath: string;
  tagName: string;
  /**
   * The element's `data-osw-node` value, stamped by the frame as the payload is built.
   *
   * The only stable handle the host has to a *clicked* element: `domPath` is positional, `srcAttr`
   * is ambiguous whenever `instanceCount > 1`, and before this field existed the ids
   * `__oswResolveNode` accepts were minted only by the tree serializer — so an element the user
   * clicked in the preview had none.
   *
   * Same lifetime and same alphabet as {@link TreeNode.id}, and deliberately the same counter: an
   * element the tree already serialized keeps the id the host is holding for it. Frame-scoped, so a
   * recompile invalidates it.
   */
  nodeId: string;
  attributes: Record<string, string>;
  /** Provenance-stripped: `data-osw-src` never reaches a consumer of this payload. */
  outerHTML: string;
  /**
   * Raw `data-osw-src` value: `"<path>:<index>"`. Split on the *last* colon — a path may contain
   * one. Absent when the preview was compiled without provenance, and for elements built by JS at
   * runtime rather than emitted by the compiler.
   */
  srcAttr?: string;
  /**
   * How many rendered elements in the page share this `srcAttr`. `> 1` means one source tag
   * produced many elements — a `{{#each}}` loop, or a partial included more than once.
   */
  instanceCount?: number;
}

/**
 * One row of the Elements tree, as serialized inside the preview frame.
 *
 * `instances` is the same concept as `FocusContextPayload.instanceCount` and is deliberately spelled
 * differently only because that field already shipped; do not introduce a third spelling.
 */
export interface TreeNode {
  /**
   * The element's `data-osw-node` value. Frame-scoped and transient: every `srcdoc` reassignment
   * mints a new document, so an id held by the host after a recompile resolves to nothing.
   */
  id: string;
  tag: string;
  className?: string;
  /** Path part of `data-osw-src` — the substring before its *last* colon. */
  file?: string;
  /** Index part of `data-osw-src`, a UTF-16 code-unit offset into that file. */
  line?: number;
  /** How many rendered elements in the page share this node's `data-osw-src`. */
  instances: number;
  hasChildren: boolean;
}

export interface PlacementBlockInfo {
  id: string;
  name: string;
  wireframeHtml: string;
}

export interface PlacementResult {
  blockId: string;
  placementId: string;
  domPath: string;
  position: 'before' | 'after';
  htmlContext: string;
}

export type ConsoleLevel = 'log' | 'warn' | 'error' | 'info' | 'debug';

export type PreviewMessage =
  | { type: 'navigate'; path: string }
  | { type: 'preview:external'; href: string }
  | { type: 'reload' }
  | { type: 'error'; error: string }
  | { type: 'selector-selection'; payload: FocusContextPayload }
  | { type: 'selector-cancelled' }
  | { type: 'console'; level: ConsoleLevel; args: string[] }
  | { type: 'placement-complete'; payload: PlacementResult }
  | { type: 'placement-cancelled' }
  | { type: 'iframe-click' }
  /**
   * One expanded level of the Elements tree. `parentId` is null for the body level. `truncated` is
   * how many siblings were dropped past the per-level cap, so the panel can say so rather than
   * silently showing a short list.
   */
  | { type: 'tree-level'; parentId: string | null; nodes: TreeNode[]; truncated: number }
  /**
   * The id the host asked to select no longer resolves to an element in the frame — the document was
   * replaced by a recompile, or the element was edited away. Nothing was selected; the panel's rows
   * for that document are dead and it should collapse to root rather than keep offering them.
   */
  | { type: 'tree-stale'; nodeId: string }
  /**
   * The answer to a `style-query`, always sent — an id that no longer resolves gets `values: {}`
   * rather than silence, which the host cannot tell apart from a frame that has not replied yet.
   *
   * Keyed by the *expanded* property names: a request for `padding` comes back as its four sides.
   * See `SHORTHAND_LONGHANDS` in `lib/preview/style-preview.ts` for why. A property the engine has
   * no value for is present with an empty string, so the key set is the request's, not the engine's.
   */
  | { type: 'style-computed'; nodeId: string; values: Record<string, string> }
  /**
   * The answer to a `style-probe`: which of the asked-about properties the override did **not**
   * actually produce, and — when something did beat it — where the winning declaration came from.
   *
   * `lost` is keyed the same way `style-computed`'s `values` is, on the *expanded* property names,
   * so a request about `padding` names the side that lost. Empty means the override is in force for
   * everything asked about, which is also the answer for a stale `nodeId` or a marker with no rule
   * anywhere: the host is waiting on a reply and cannot tell silence from a slow frame.
   *
   * `winner` is a VFS path where one is knowable, else `inline style` / `a stylesheet` — never a
   * blob id. Absent when nothing was lost, and also when something was lost to a cause the scan
   * cannot name (a UA default, or a rule inside an `@media` block, which is deliberately not walked).
   */
  | { type: 'style-probe-result'; nodeId: string; lost: string[]; winner?: string }
  /**
   * A fresh payload for a `selection-resolve`, or `null` when that `domPath` no longer resolves.
   *
   * A full payload rather than the rectangle the spec first asked for: what the recompile actually
   * invalidated is `nodeId`, which is frame-scoped and is what every node-keyed message is keyed on.
   * A rectangle would leave the host holding a selection it could no longer ask anything about.
   */
  | { type: 'selection-resolved'; payload: FocusContextPayload | null };

export type PreviewHostMessage =
  | { type: 'selector-toggle'; active: boolean }
  | { type: 'placement-start'; block: PlacementBlockInfo }
  | { type: 'placement-hover'; x: number; y: number }
  | { type: 'placement-drop' }
  | { type: 'placement-cancel' }
  | { type: 'placement-remove'; placementId: string }
  /** Serialize one level of the tree and post it back. `nodeId` null means the body level. */
  | { type: 'tree-request'; nodeId: string | null }
  /** Show the shared highlight overlay on this node; `nodeId` null hides it. */
  | { type: 'tree-highlight'; nodeId: string | null }
  /**
   * Select this node, producing the same `selector-selection` a click on it would. A node id that no
   * longer resolves gets `tree-stale` back instead.
   */
  | { type: 'tree-select'; nodeId: string }
  /**
   * Read this node's rendered style. `nodeId` is a {@link FocusContextPayload.nodeId} — the same
   * frame-scoped id the tree mints — so a clicked element can be asked about, not just a tree row.
   * Shorthands in `properties` are expanded before they are read; the reply names what came back.
   */
  | { type: 'style-query'; nodeId: string; properties: string[] }
  /**
   * Show an uncommitted style change on the element carrying this marker, or clear it with
   * `css: null`.
   *
   * `markerId` and a block body rather than a selector: the frame builds the selector itself, from
   * the pattern `lib/direct-edit/overrides-css.ts` writes the file with, so the two cannot drift.
   *
   * `css` is the element's **whole accumulated block**, not the one declaration that just changed —
   * the transient style is replaced on every send, so a single declaration would visually revert
   * every earlier edit in the session.
   *
   * Needed because a repeat edit writes `/overrides.css` silently, without a recompile: the live
   * document would otherwise never see the new rule and the edit would look like it did nothing.
   */
  | { type: 'style-preview'; markerId: string; css: string | null }
  /**
   * Ask whether the override on `markerId` is actually producing these properties on this node, and
   * what beat it if not.
   *
   * Both ids, because they answer different halves: `nodeId` says *which element* to measure,
   * `markerId` says *which rule* to lift out. They are not derivable from one another — a marker can
   * be carried by several rendered elements, and an element the user clicked has a `nodeId` long
   * before anything writes a marker block for it.
   *
   * The frame answers by removing the rule and looking, so this is only meaningful once the rule is
   * in the document: after a silent `/overrides.css` write the transient `<style>` carries it, and
   * after a recompile the file does. Probing between a non-silent write and the recompile it
   * triggers reports a loss on every property, because the marker is not in the document yet.
   */
  | { type: 'style-probe'; nodeId: string; markerId: string; properties: string[] }
  /**
   * Find the element this `domPath` names and send back a fresh payload for it, or `null`.
   *
   * The recompile a first edit triggers mints a new document, and with it a new set of node ids —
   * so the host's `nodeId` is dead while its `focusContext` is not. `domPath` is the only handle
   * that survives, and this is how it is turned back into one that can be asked questions.
   *
   * It carries no page identity, so the host must not send it after the preview has navigated: the
   * same path resolves perfectly well to a different element on another page.
   */
  | { type: 'selection-resolve'; domPath: string };
