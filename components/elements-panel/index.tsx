'use client';

import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ElementsTreeRow } from './tree-node';
import type { PreviewHostMessage, PreviewMessage, TreeNode } from '@/lib/preview/types';
import type { ProjectRuntime } from '@/lib/vfs/types';
import { getRuntimeConfig, isRuntimeBundled } from '@/lib/runtimes/registry';

/**
 * The Elements panel's state: a flat node map plus the level structure around it.
 *
 * Nodes are keyed by the frame's transient `data-osw-node` id, and the level map is keyed by parent
 * id with `null` for the body level — the same addressing the frame uses, so nothing here has to
 * invent a second identity for an element. Every id in here dies with the next `srcdoc`
 * reassignment; see {@link reduceTree}'s `frame-ready` case.
 */
export interface TreeState {
  nodes: Map<string, TreeNode>;
  /** Parent id (`null` = the body level) to the ordered ids of its serialized children. */
  children: Map<string | null, string[]>;
  /** Parent id to how many of its children the serializer dropped past its per-level cap. */
  truncated: Map<string | null, number>;
  expanded: Set<string>;
  selectedId: string | null;
}

export function emptyTreeState(): TreeState {
  return {
    nodes: new Map(),
    children: new Map(),
    truncated: new Map(),
    expanded: new Set(),
    selectedId: null,
  };
}

export type TreeEvent =
  /** The frame loaded a document — the first one, or a recompile's replacement. */
  | { type: 'frame-ready' }
  | { type: 'level'; parentId: string | null; nodes: TreeNode[]; truncated: number }
  /** The frame reported that an id the panel asked about no longer resolves. */
  | { type: 'stale' }
  | { type: 'toggle'; nodeId: string }
  | { type: 'select'; nodeId: string }
  | { type: 'hover'; nodeId: string | null }
  /** The user asked for the tree again — same handling as a load, without waiting for one. */
  | { type: 'refresh' };

export interface TreeTransition {
  state: TreeState;
  /** Messages the panel must post into the frame for this transition. */
  requests: PreviewHostMessage[];
}

const REQUEST_ROOT: PreviewHostMessage[] = [{ type: 'tree-request', nodeId: null }];

/**
 * The whole panel's logic, as one pure function over {@link TreeState}.
 *
 * Extracted from the component rather than written inside it because this is the part with
 * behaviour worth testing — the reload collapse, the empty-level collapse, which gestures cost a
 * round trip — and there is no React Testing Library in this repo to reach it through a render.
 *
 * ## Reload collapses to root
 *
 * `frame-ready` fires on every load, and every id the panel holds belongs to the document that has
 * just been replaced. There is no correlation mechanism that survives that: re-expanding the
 * previously expanded paths would mean matching by tag and position, which is exactly the
 * positional identity this design rejects everywhere else, and would need one sequential round trip
 * per level with nothing to check the answers against. Collapsing to root is honest, and the tree
 * recovers on the next expansion.
 *
 * ## An empty level collapses the branch
 *
 * The frame answers a `tree-request` for an id that no longer resolves with an *empty* `tree-level`
 * naming that parent, not with `tree-stale` — so the panel is never left waiting, but it does have
 * to decide what an empty answer means. A caret is only offered when the serializer saw
 * provenance-carrying children, so an empty answer means the element or its children are gone.
 * Rendering an expanded branch with nothing under it looks like a bug in the panel; the branch is
 * collapsed and its caret removed instead, and the row goes on being selectable in case it is still
 * there.
 */
export function reduceTree(state: TreeState, event: TreeEvent): TreeTransition {
  switch (event.type) {
    case 'frame-ready':
    case 'refresh':
    case 'stale':
      return { state: emptyTreeState(), requests: REQUEST_ROOT };

    case 'level': {
      if (event.parentId === null) {
        // The body level defines a document. Anything the panel held belonged to the previous one.
        const next = emptyTreeState();
        for (const node of event.nodes) next.nodes.set(node.id, node);
        next.children.set(null, event.nodes.map(n => n.id));
        if (event.truncated > 0) next.truncated.set(null, event.truncated);
        return { state: next, requests: [] };
      }

      // A level for a parent this panel does not know about is a reply from a document that has
      // since been replaced. Merging it would graft orphan rows onto the live tree.
      if (!state.nodes.has(event.parentId)) {
        return { state, requests: [] };
      }

      const nodes = new Map(state.nodes);
      const children = new Map(state.children);
      const truncated = new Map(state.truncated);
      const expanded = new Set(state.expanded);

      if (event.nodes.length === 0) {
        expanded.delete(event.parentId);
        children.delete(event.parentId);
        truncated.delete(event.parentId);
        const parent = nodes.get(event.parentId)!;
        nodes.set(event.parentId, { ...parent, hasChildren: false });
        return { state: { ...state, nodes, children, truncated, expanded }, requests: [] };
      }

      for (const node of event.nodes) nodes.set(node.id, node);
      children.set(event.parentId, event.nodes.map(n => n.id));
      if (event.truncated > 0) truncated.set(event.parentId, event.truncated);
      else truncated.delete(event.parentId);
      return { state: { ...state, nodes, children, truncated, expanded }, requests: [] };
    }

    case 'toggle': {
      const node = state.nodes.get(event.nodeId);
      if (!node) return { state, requests: [] };
      const expanded = new Set(state.expanded);
      if (expanded.has(event.nodeId)) {
        expanded.delete(event.nodeId);
        return { state: { ...state, expanded }, requests: [] };
      }
      expanded.add(event.nodeId);
      // A level already serialized stays cached: re-expanding it must not cost a round trip, and
      // the frame keeps the same ids for elements it has already stamped.
      const requests: PreviewHostMessage[] = state.children.has(event.nodeId)
        ? []
        : [{ type: 'tree-request', nodeId: event.nodeId }];
      return { state: { ...state, expanded }, requests };
    }

    case 'select': {
      if (!state.nodes.has(event.nodeId)) return { state, requests: [] };
      return {
        state: { ...state, selectedId: event.nodeId },
        requests: [{ type: 'tree-select', nodeId: event.nodeId }],
      };
    }

    case 'hover':
      // No state of its own: the highlight lives in the frame's shared overlay, and mirroring it
      // here would be a second source of truth for what is highlighted.
      return { state, requests: [{ type: 'tree-highlight', nodeId: event.nodeId }] };
  }
}

export type TreeRow =
  | { kind: 'node'; node: TreeNode; depth: number; expanded: boolean; selected: boolean }
  | { kind: 'loading'; parentId: string; depth: number }
  | { kind: 'truncated'; parentId: string | null; count: number; depth: number };

/**
 * The visible rows, in document order, from the levels the panel has actually received.
 *
 * Only nodes reachable from the body level are emitted, so a level whose parent was collapsed and
 * whose ids are still cached contributes nothing.
 */
export function flattenTree(state: TreeState): TreeRow[] {
  const rows: TreeRow[] = [];

  const walk = (parentId: string | null, depth: number) => {
    const ids = state.children.get(parentId) || [];
    for (const id of ids) {
      const node = state.nodes.get(id);
      if (!node) continue;
      const expanded = state.expanded.has(id);
      rows.push({ kind: 'node', node, depth, expanded, selected: state.selectedId === id });
      if (!expanded) continue;
      if (state.children.has(id)) {
        walk(id, depth + 1);
      } else {
        rows.push({ kind: 'loading', parentId: id, depth: depth + 1 });
      }
    }
    const dropped = state.truncated.get(parentId) || 0;
    if (dropped > 0) rows.push({ kind: 'truncated', parentId, count: dropped, depth });
  };

  walk(null, 0);
  return rows;
}

/**
 * Why the tree cannot be shown, or `null` when it can be tried.
 *
 * Runtime is checked before the preview panel: a Python project's preview is a terminal, so telling
 * the user to open it would be sending them somewhere that cannot help.
 */
export type TreeUnavailable = 'no-project' | 'terminal-runtime' | 'bundled-runtime' | 'preview-closed';

export function describeUnavailable(input: {
  hasProject: boolean;
  previewOpen: boolean;
  runtime: ProjectRuntime;
}): TreeUnavailable | null {
  if (!input.hasProject) return 'no-project';
  if (getRuntimeConfig(input.runtime).previewMode === 'terminal') return 'terminal-runtime';
  if (isRuntimeBundled(input.runtime)) return 'bundled-runtime';
  if (!input.previewOpen) return 'preview-closed';
  return null;
}

export interface ElementsPanelHandle {
  /** A level arrived from the frame, lifted through the workspace. */
  handleTreeLevel: (message: Extract<PreviewMessage, { type: 'tree-level' }>) => void;
  /** The frame could not resolve an id the panel sent. */
  handleTreeStale: () => void;
  /** The frame loaded a document — the reload signal, and the only safe moment to send. */
  handleFrameReady: () => void;
}

export interface ElementsPanelProps {
  projectId: string | null;
  runtime: ProjectRuntime;
  /** Whether the preview panel is open. Closed means there is no frame to query. */
  previewOpen: boolean;
  onOpenPreview: () => void;
  /** Post into the preview frame. A no-op when no frame is mounted. */
  sendToFrame: (message: PreviewHostMessage) => void;
}

function Unavailable({ title, hint, action }: { title: string; hint: string; action?: React.ReactNode }) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-2 px-6 text-center">
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground">{hint}</p>
      {action}
    </div>
  );
}

/**
 * The rendered document as a tree, one lazily serialized level at a time.
 *
 * The panel is a sibling of the preview in the workspace's panel map, not a child of it, so it
 * neither owns the frame nor hears its messages: the workspace lifts `tree-level` / `tree-stale` /
 * frame-ready into this handle and hands down a `sendToFrame` bound to the preview's ref.
 *
 * Nothing is requested on mount. `postMessageToIframe` drops a message silently while the frame is
 * not ready and nothing retries, so the first request waits for `handleFrameReady` — which the
 * preview always reaches here, because opening this panel switches provenance on and that
 * recompiles.
 */
export const ElementsPanel = forwardRef<ElementsPanelHandle, ElementsPanelProps>(function ElementsPanel(
  { projectId, runtime, previewOpen, onOpenPreview, sendToFrame },
  ref
) {
  const [state, setState] = useState<TreeState>(emptyTreeState);
  // The reducer runs against this rather than against a `setState` updater: the transition emits
  // messages, and an updater is not allowed to have side effects (StrictMode invokes it twice).
  const stateRef = useRef(state);
  const sendRef = useRef(sendToFrame);
  sendRef.current = sendToFrame;

  const dispatch = useCallback((event: TreeEvent) => {
    const { state: next, requests } = reduceTree(stateRef.current, event);
    stateRef.current = next;
    setState(next);
    for (const request of requests) sendRef.current(request);
  }, []);

  useImperativeHandle(ref, () => ({
    handleTreeLevel: (message) => {
      dispatch({
        type: 'level',
        parentId: message.parentId,
        nodes: message.nodes,
        truncated: message.truncated,
      });
    },
    handleTreeStale: () => dispatch({ type: 'stale' }),
    handleFrameReady: () => dispatch({ type: 'frame-ready' }),
  }), [dispatch]);

  const unavailable = describeUnavailable({ hasProject: Boolean(projectId), previewOpen, runtime });

  // Drop the tree when there is nothing behind it — a closed preview unmounts the frame, and its
  // ids die with it. Keeping the rows on screen would offer selections that all resolve to nothing.
  useEffect(() => {
    if (!unavailable) return;
    stateRef.current = emptyTreeState();
    setState(stateRef.current);
  }, [unavailable]);

  // Leaving the panel — closing it, or a reorder that unmounts it — must not strand the overlay in
  // the frame, which has no idea the panel is gone.
  useEffect(() => {
    const send = sendRef;
    return () => {
      send.current({ type: 'tree-highlight', nodeId: null });
    };
  }, []);

  if (unavailable === 'no-project') {
    return (
      <div className="flex-1 min-h-0">
        <Unavailable title="No project open" hint="Open a project to inspect its rendered elements." />
      </div>
    );
  }

  if (unavailable === 'terminal-runtime') {
    return (
      <div className="flex-1 min-h-0">
        <Unavailable
          title="No document to inspect"
          hint={`${getRuntimeConfig(runtime).label} projects run in a terminal preview and render no HTML document.`}
        />
      </div>
    );
  }

  if (unavailable === 'bundled-runtime') {
    return (
      <div className="flex-1 min-h-0">
        <Unavailable
          title="Not supported for this runtime"
          hint={`${getRuntimeConfig(runtime).label} builds its DOM at runtime, so no element can be traced back to a source file yet.`}
        />
      </div>
    );
  }

  if (unavailable === 'preview-closed') {
    return (
      <div className="flex-1 min-h-0">
        <Unavailable
          title="Preview is closed"
          hint="The tree is read out of the live preview, so it needs the preview panel open."
          action={
            <Button variant="outline" size="sm" onClick={onOpenPreview}>
              Open preview
            </Button>
          }
        />
      </div>
    );
  }

  const rows = flattenTree(state);

  return (
    <div
      className="flex-1 min-h-0 overflow-auto p-1"
      onMouseLeave={() => dispatch({ type: 'hover', nodeId: null })}
    >
      {rows.length === 0 ? (
        <Unavailable
          title="No elements yet"
          hint="Nothing has been read out of the preview yet. It arrives once the preview finishes loading."
          action={
            <Button variant="outline" size="sm" onClick={() => dispatch({ type: 'refresh' })}>
              Refresh
            </Button>
          }
        />
      ) : (
        rows.map((row) => {
          if (row.kind === 'node') {
            return (
              <ElementsTreeRow
                key={row.node.id}
                node={row.node}
                depth={row.depth}
                expanded={row.expanded}
                selected={row.selected}
                onToggle={(nodeId) => dispatch({ type: 'toggle', nodeId })}
                onSelect={(nodeId) => dispatch({ type: 'select', nodeId })}
                onHover={(nodeId) => dispatch({ type: 'hover', nodeId })}
              />
            );
          }
          if (row.kind === 'loading') {
            return (
              <div
                key={`loading-${row.parentId}`}
                className="text-xs text-muted-foreground py-1"
                style={{ paddingLeft: `${row.depth * 12 + 24}px` }}
              >
                Loading…
              </div>
            );
          }
          return (
            <div
              key={`truncated-${row.parentId ?? 'root'}`}
              className="text-xs text-muted-foreground italic py-1"
              style={{ paddingLeft: `${row.depth * 12 + 24}px` }}
            >
              {row.count} more {row.count === 1 ? 'element' : 'elements'} not shown
            </div>
          );
        })
      )}
    </div>
  );
});
