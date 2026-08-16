'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo, forwardRef, useImperativeHandle } from 'react';
import { VirtualServer } from '@/lib/preview/virtual-server';
import {
  CompiledProject,
  PreviewMessage,
  FocusContextPayload,
  PreviewHostMessage
} from '@/lib/preview/types';
import { vfs } from '@/lib/vfs';
import { PreviewLifecycle } from '@/lib/preview/preview-lifecycle';
import { STRIP_PROVENANCE_JS } from '@/lib/preview/provenance';
import { SERIALIZE_TREE_JS } from '@/lib/preview/element-tree';
import { STYLE_QUERY_JS, STYLE_PREVIEW_JS, STYLE_LOCATOR_JS, STYLE_PROBE_JS } from '@/lib/preview/style-preview';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  RefreshCw,
  Smartphone,
  Tablet,
  Monitor,
  ChevronLeft,
  ChevronRight,
  Home,
  Eye,
  Crosshair,
  Camera,
  Loader2,
  Maximize,
  Minimize,
  LayoutGrid,
} from 'lucide-react';
import { PanelHeader } from '@/components/ui/panel';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn, logger } from '@/lib/utils';
import { captureIframeScreenshot } from '@/lib/utils/screenshot';
import type { ProjectRuntime } from '@/lib/vfs/types';
import type { PlacementResult, PlacementBlockInfo } from '@/lib/preview/types';
import { pushRuntimeError, clearRuntimeErrors } from '@/lib/preview/runtime-errors';
import { PalettePanel } from '@/components/semantic-blocks/palette-panel';
import type { SemanticBlock } from '@/lib/semantic-blocks/types';
import { useWorkspaceStore } from '@/lib/stores/workspace';

export interface MultipagePreviewHandle {
  captureScreenshot: (waitForContent?: boolean) => Promise<string | null>;
  startBlockDrag: (block: PlacementBlockInfo) => void;
  getActivePath: () => string;
  removePlaceholder: (placementId: string) => void;
  /**
   * Post a message to the preview frame.
   *
   * For panels that are siblings of the preview rather than children of it — the Elements tree is
   * the first — so they can talk to the frame without a second copy of the posting logic.
   *
   * There is no queue: a message sent before the frame holds the compiled document is delivered to
   * `about:blank`, or dropped outright when there is no contentWindow, and nothing retries it. Wait
   * for `onFrameReady` before the first send, and again after every reload.
   */
  sendToFrame: (message: PreviewHostMessage) => void;
}

interface MultipagePreviewProps {
  projectId: string;
  refreshTrigger?: number;
  onFocusSelection?: (selection: FocusContextPayload | null) => void;
  hasFocusTarget?: boolean;
  onClose?: () => void;
  deploymentId?: string | null;
  onCaptureScreenshot?: (screenshot: string) => void;
  entryPoint?: string;
  runtime?: ProjectRuntime;
  onFullscreen?: () => void;
  isFullscreen?: boolean;
  placementActive?: boolean;
  onPlacementToggle?: () => void;
  onPlacementComplete?: (payload: PlacementResult) => void;
  /**
   * Render outside the workspace, from a dialog that opened this project itself.
   *
   * The compile normally waits for `workspaceReady`, which the workspace sets once it has finished
   * opening a project. A dialog in the project list or the template browser has no workspace to
   * wait for, so that flag is never set and the preview sits on "Compiling project..." forever.
   * This says there is nothing to wait for.
   */
  standalone?: boolean;
  /**
   * Compile with element provenance (`data-osw-src`) so a selected element can name its source.
   *
   * Off by default and per-instance rather than global: the publish, export and thumbnail paths
   * construct their own VirtualServer in the same browser tab, and this instrumentation must never
   * reach any of them. Toggling it recompiles in place without navigating.
   */
  provenance?: boolean;
  /**
   * A level of the Elements tree arrived from the frame.
   *
   * Lifted through the host because the panel is a sibling in the workspace's panel map, not a
   * child of this component, so it cannot receive the frame's messages itself.
   */
  onTreeLevel?: (message: Extract<PreviewMessage, { type: 'tree-level' }>) => void;
  /**
   * An id the consumer sent could not be resolved in the frame.
   *
   * Lifted for the same reason as `onTreeLevel`. Without this route the frame's `tree-stale` reply
   * reaches the host's listener and stops there, so a selection of a vanished element would look to
   * the panel exactly like a selection that was simply never answered.
   */
  onTreeStale?: (message: Extract<PreviewMessage, { type: 'tree-stale' }>) => void;
  /**
   * The computed values a `style-query` asked for.
   *
   * Lifted for the same reason as `onTreeLevel`: the panel that asked is a sibling in the
   * workspace's panel map, not a child of this component, so the frame's reply cannot reach it
   * directly. Must be `useCallback`-stable — this component is `React.memo` and this prop sits in
   * the message listener's dependency array.
   */
  onStyleComputed?: (message: Extract<PreviewMessage, { type: 'style-computed' }>) => void;
  /**
   * Whether an override actually took effect, and what beat it. Same routing and same stability
   * requirement as `onStyleComputed`.
   */
  onStyleProbeResult?: (message: Extract<PreviewMessage, { type: 'style-probe-result' }>) => void;
  /**
   * A fresh payload for a `selection-resolve`, or `null` when that path no longer resolves.
   *
   * The consumer here is the workspace rather than a panel: it owns the focus context, and a
   * recompile is exactly when the `nodeId` in it stops resolving.
   */
  onSelectionResolved?: (message: Extract<PreviewMessage, { type: 'selection-resolved' }>) => void;
  /**
   * The frame has loaded the document this component wrote, verified by its load marker.
   *
   * Fires on every load, so it is also the reload signal: a `srcdoc` reassignment mints a new
   * document and every id a consumer holds for the old one is dead. A consumer that requests
   * anything on mount instead of on this callback is usually posting into `about:blank`.
   */
  onFrameReady?: () => void;
}

type DeviceSize = 'mobile' | 'tablet' | 'desktop' | 'responsive';

const DEVICE_SIZES: Record<DeviceSize, { width?: string; height?: string; maxHeight?: string; maxWidth?: string }> = {
  mobile: { width: '375px', height: '100%', maxHeight: '667px' },
  tablet: { width: '768px', height: '100%', maxHeight: '1024px' },
  desktop: { width: '100%', height: '100%', maxHeight: '900px', maxWidth: '1440px' },
  responsive: { width: '100%', height: '100%' }
};

// Watchdog for an *asynchronous* compile stall (e.g. a hung CDN fetch for an SFC compiler): reject
// so the catch clears the in-flight flag and shows an error instead of freezing recompiles forever.
// (A synchronous main-thread hang can't be timed out — the event loop is blocked; that's the
// heartbeat's job, not this.)
const COMPILE_TIMEOUT_MS = 30000;
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

/**
 * Strip the Elements tree's transient node id, as JavaScript source for injection into the iframe.
 *
 * `data-osw-node` is stamped onto live elements as the tree is serialized, so anything read out of
 * the frame's DOM after an expansion carries it: the focus payload's `outerHTML` and the placement
 * request's `htmlContext` both do, and both end up in the agent's prompt.
 *
 * Authored here rather than inside the script template literals, for the reason
 * `STRIP_PROVENANCE_JS` is authored in `lib/preview/provenance.ts`: `\\s` below is `\s` in the
 * emitted JavaScript, and the same regex hand-written inside a template literal would collapse to a
 * literal `s`. The tests extract this function out of the *emitted* text and run it.
 *
 * No `:\d+` guard, unlike the provenance stripper: that guard exists because `stripProvenance`
 * writes its result back into project source via `curl -o`, where a false positive is data loss.
 * This attribute is stamped at runtime and never appears in compiled output, so it has no such
 * path.
 */
export const STRIP_NODE_ID_JS =
  `function __oswStripNodeId(h){return String(h||'').replace(/\\s?data-osw-node="[^"]*"/g,'');}`;

/**
 * Escape an element id for use inside a CSS selector, as JavaScript source for the iframe.
 *
 * **`CSS.escape` is absent in jsdom** — measured — and every test of frame script runs in jsdom, so
 * an unguarded call throws `ReferenceError` and takes the whole script down at parse-and-run time,
 * not just the one branch. That is the entire reason this is hand-written rather than a one-liner
 * delegating to the platform.
 *
 * Authored as a character loop and **not as a regex**, for this file's standing reason: a regex
 * hand-written inside the script template literals below loses one level of escaping before it is
 * emitted, and a replacement string of `'\\$1'` is exactly the shape that silently arrives as
 * `'$1'`. The backslash it emits is spelled as its code unit for the same reason — a literal one
 * would need doubling in this template literal and would still be one edit away from collapsing.
 *
 * A leading digit gets the hex form with its terminating space (`1abc` → `\31 abc`) rather than a
 * bare backslash: `\1abc` is a valid CSS escape for codepoint U+1ABC, so the cheap spelling does not
 * fail loudly — it silently selects a different id, or nothing.
 */
export const ESCAPE_CSS_IDENT_JS = `
function __oswEscapeIdent(value) {
  var s = String(value == null ? '' : value);
  var bs = String.fromCharCode(92);
  var out = '';
  for (var i = 0; i < s.length; i++) {
    var c = s.charAt(i);
    if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_' || c === '-' || c > '~') {
      out += c;
      continue;
    }
    if (c >= '0' && c <= '9') {
      // A digit is an ordinary ident character anywhere but the front.
      out += i === 0 ? bs + '3' + c + ' ' : c;
      continue;
    }
    out += bs + c;
  }
  return out;
}
`;

/**
 * The preview's semantic-block placement script, as source for the iframe.
 *
 * Exported for the same reason as generateNavigationScript below: the escaping of anything authored
 * inside this template literal is only observable in the emitted string.
 */
export function generatePlacementScript(): string {
  return `<script>(function() {
    ${STRIP_PROVENANCE_JS}
    ${STRIP_NODE_ID_JS}
    var state = {
      active: false,
      block: null,
      indicator: null,
      currentTarget: null,
      currentPosition: 'after',
      lastX: 0,
      lastY: 0,
      scrollRaf: null,
      scrollSpeed: 0
    };

    function createIndicator() {
      if (state.indicator) return state.indicator;
      var el = document.createElement('div');
      el.setAttribute('data-semantic-indicator', 'true');
      el.style.cssText = 'position:fixed;height:0;border:2px solid rgba(99,102,241,0.95);border-radius:12px;box-shadow:0 0 0 4px rgba(99,102,241,0.32);pointer-events:none;transition:top 0.15s ease-out,left 0.15s ease-out,width 0.15s ease-out,opacity 0.15s;opacity:0;z-index:2147483646;box-sizing:border-box;';
      document.body.appendChild(el);
      state.indicator = el;
      return el;
    }

    function removeIndicator() {
      if (state.indicator) {
        state.indicator.style.opacity = '0';
      }
    }

    function isPlaceholderOrIndicator(el) {
      if (!el || !el.getAttribute) return false;
      return el.getAttribute('data-semantic-placeholder') === 'true' ||
             el.getAttribute('data-semantic-indicator') === 'true' ||
             // The selector's highlight overlay. It stays in the document once created — hidden
             // rather than detached — so findDropTarget's fallback, which returns the last body
             // child when the pointer is over bare body, would otherwise pick it and hand the agent
             // a domPath into preview furniture.
             el.getAttribute('data-osw-overlay') !== null;
    }

    function getInsertPosition(el, x, y) {
      var rect = el.getBoundingClientRect();
      var style = window.getComputedStyle(el.parentNode || el);
      var isHorizontal = style.display === 'flex' && (style.flexDirection === 'row' || style.flexDirection === 'row-reverse');

      if (isHorizontal) {
        return (x - rect.left) < (rect.width / 2) ? 'before' : 'after';
      }
      return (y - rect.top) < (rect.height / 2) ? 'before' : 'after';
    }

    function findDropTarget(x, y) {
      var el = document.elementFromPoint(x, y);
      if (!el || el === document.documentElement || el === document.body) {
        var children = document.body.children;
        for (var i = children.length - 1; i >= 0; i--) {
          if (!isPlaceholderOrIndicator(children[i]) && children[i].tagName !== 'SCRIPT') {
            return children[i];
          }
        }
        return null;
      }
      while (el && (isPlaceholderOrIndicator(el) || el.tagName === 'SCRIPT')) {
        el = el.parentElement;
      }
      if (el && el !== document.body && el !== document.documentElement) {
        var pos = window.getComputedStyle(el).position;
        if (pos === 'absolute' || pos === 'fixed') {
          el = el.parentElement;
        }
      }
      return el && el !== document.body && el !== document.documentElement ? el : null;
    }

    function buildDomPath(el) {
      var parts = [];
      while (el && el !== document.body && el !== document.documentElement) {
        var tag = el.tagName.toLowerCase();
        if (el.id) {
          parts.unshift(tag + '#' + el.id);
          break;
        }
        var parent = el.parentElement;
        if (parent) {
          var siblings = Array.prototype.filter.call(parent.children, function(c) {
            return c.tagName === el.tagName && !isPlaceholderOrIndicator(c);
          });
          if (siblings.length > 1) {
            var idx = siblings.indexOf(el) + 1;
            tag += ':nth-of-type(' + idx + ')';
          }
        }
        parts.unshift(tag);
        el = parent;
      }
      return 'body > ' + parts.join(' > ');
    }

    function showIndicator(target, position) {
      var indicator = createIndicator();
      var rect = target.getBoundingClientRect();
      var y = position === 'before' ? rect.top : rect.bottom;
      indicator.style.top = y + 'px';
      indicator.style.left = rect.left + 'px';
      indicator.style.width = rect.width + 'px';
      indicator.offsetHeight;
      indicator.style.opacity = '1';
      state.currentTarget = target;
      state.currentPosition = position;
    }

    function startAutoScroll() {
      if (state.scrollRaf) return;
      function tick() {
        if (state.scrollSpeed !== 0) {
          window.scrollBy(0, state.scrollSpeed);
        }
        state.scrollRaf = requestAnimationFrame(tick);
      }
      state.scrollRaf = requestAnimationFrame(tick);
    }

    function stopAutoScroll() {
      if (state.scrollRaf) {
        cancelAnimationFrame(state.scrollRaf);
        state.scrollRaf = null;
      }
      state.scrollSpeed = 0;
    }

    function updateAutoScroll(y) {
      var vh = window.innerHeight;
      var edgeZone = vh * 0.08;
      var maxSpeed = 12;
      if (y < edgeZone) {
        // Top edge — scroll up, faster closer to edge
        state.scrollSpeed = -maxSpeed * (1 - y / edgeZone);
        startAutoScroll();
      } else if (y > vh - edgeZone) {
        // Bottom edge — scroll down
        state.scrollSpeed = maxSpeed * (1 - (vh - y) / edgeZone);
        startAutoScroll();
      } else {
        state.scrollSpeed = 0;
      }
    }

    function handleHover(x, y) {
      if (!state.active) return;
      state.lastX = x;
      state.lastY = y;
      updateAutoScroll(y);
      var target = findDropTarget(x, y);
      if (!target) {
        removeIndicator();
        state.currentTarget = null;
        return;
      }
      var position = getInsertPosition(target, x, y);
      if (target === state.currentTarget && position === state.currentPosition) return;
      showIndicator(target, position);
    }

    function buildHtmlContext(target, position, blockName) {
      // Get the parent element that contains the insertion point
      var parent = target.parentNode;
      if (!parent || parent === document.body || parent === document.documentElement) {
        parent = target; // use target itself if parent is body
      }
      // Clone the parent to insert a marker comment without modifying the real DOM
      var clone = parent.cloneNode(true);
      // Find the corresponding target in the clone
      var children = Array.prototype.slice.call(parent.children);
      var cloneChildren = Array.prototype.slice.call(clone.children);
      var targetIndex = -1;
      for (var i = 0; i < children.length; i++) {
        if (children[i] === target) { targetIndex = i; break; }
      }
      if (targetIndex >= 0 && targetIndex < cloneChildren.length) {
        var marker = document.createComment(' INSERT ' + blockName + ' HERE ');
        if (position === 'before') {
          clone.insertBefore(marker, cloneChildren[targetIndex]);
        } else {
          clone.insertBefore(marker, cloneChildren[targetIndex].nextSibling);
        }
      }
      // Remove any semantic placeholders/indicators from the clone
      var placeholders = clone.querySelectorAll('[data-semantic-placeholder],[data-semantic-indicator]');
      for (var j = placeholders.length - 1; j >= 0; j--) {
        placeholders[j].parentNode.removeChild(placeholders[j]);
      }
      // Remove script tags from clone
      var scripts = clone.querySelectorAll('script');
      for (var k = scripts.length - 1; k >= 0; k--) {
        scripts[k].parentNode.removeChild(scripts[k]);
      }
      // Preview-only instrumentation must not reach the agent: this string becomes the placement
      // request's htmlContext. A separate code path from the focus-context payload, so both
      // strippers have to be applied here too.
      return __oswStripNodeId(__oswStripProv(clone.outerHTML));
    }

    function handleDrop() {
      stopAutoScroll();
      if (!state.active || !state.currentTarget || !state.block) return;
      var domPath = buildDomPath(state.currentTarget);
      var position = state.currentPosition;

      // Capture HTML context BEFORE inserting placeholder
      var htmlContext = buildHtmlContext(state.currentTarget, position, state.block.name);

      removeIndicator();
      var wrapper = document.createElement('div');
      var placementId = 'sb-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);

      wrapper.innerHTML = state.block.wireframeHtml;
      var placeholder = wrapper.firstChild;
      if (placeholder) {
        // Tag with placementId so it can be removed later
        if (placeholder.setAttribute) placeholder.setAttribute('data-placement-id', placementId);
        if (position === 'before') {
          state.currentTarget.parentNode.insertBefore(placeholder, state.currentTarget);
        } else {
          state.currentTarget.parentNode.insertBefore(placeholder, state.currentTarget.nextSibling);
        }
      }

      window.parent.postMessage({
        type: 'placement-complete',
        payload: {
          blockId: state.block.id,
          placementId: placementId,
          domPath: domPath,
          position: position,
          htmlContext: htmlContext
        }
      }, '*');

      state.currentTarget = null;
      state.currentPosition = 'after';
    }

    function activate(block) {
      state.active = true;
      state.block = block;
      document.body.style.cursor = 'crosshair';
    }

    function deactivate(cancelled) {
      stopAutoScroll();
      state.active = false;
      state.block = null;
      state.currentTarget = null;
      removeIndicator();
      document.body.style.cursor = '';
      if (cancelled) {
        window.parent.postMessage({ type: 'placement-cancelled' }, '*');
      }
    }

    document.addEventListener('click', function() {
      window.parent.postMessage({ type: 'iframe-click' }, '*');
    });

    window.addEventListener('message', function(event) {
      var data = event.data;
      if (!data || typeof data !== 'object') return;

      if (data.type === 'placement-start') {
        activate(data.block);
      } else if (data.type === 'placement-hover') {
        handleHover(data.x, data.y);
      } else if (data.type === 'placement-drop') {
        handleDrop();
      } else if (data.type === 'placement-cancel') {
        deactivate(true);
      } else if (data.type === 'placement-remove') {
        var pid = data.placementId;
        // The doubled backslash below is deliberate: this is a template literal, so a single one
        // would collapse before the script is emitted and the guard would match a literal "d"
        // rather than a digit, rejecting every real id. Same doubling as the external-link test.
        if (typeof pid === 'string' && /^sb-\\d+-[a-z0-9]+$/.test(pid)) {
          var el = document.querySelector('[data-placement-id="' + pid + '"]');
          if (el && el.parentNode) el.parentNode.removeChild(el);
        }
      }
    });
  })();<\/script>`;
}

/**
 * The preview's navigation + element-selector script, as source for the iframe.
 *
 * Module level and exported so a test can assert on the *emitted* text. These literals are the
 * one place in this file where an authored `\s` silently collapses to a literal `s` before it is
 * ever emitted, so the emitted string — not the source — is what has to be checked.
 */
export function generateNavigationScript(normalizedPath: string): string {
  return `
      <script>
        (function() {
          ${STRIP_PROVENANCE_JS}
          ${STRIP_NODE_ID_JS}
          ${SERIALIZE_TREE_JS}
          ${STYLE_QUERY_JS}
          ${STYLE_PREVIEW_JS}
          ${STYLE_LOCATOR_JS}
          ${STYLE_PROBE_JS}
          ${ESCAPE_CSS_IDENT_JS}
          const isInIframe = window !== window.parent;

          function resolveInternalPath(href) {
            let path = href;
            if (!path.startsWith('/')) {
              const currentPath = '${normalizedPath}';
              const currentDir = currentPath.substring(0, currentPath.lastIndexOf('/'));
              path = currentDir + '/' + path;
            }

            if (path.endsWith('.html')) {
              path = path.slice(0, -5);
            }
            if (path === '/index') {
              path = '/';
            }
            return path;
          }

          document.addEventListener('click', function(e) {
            // Respect app-handled navigation: a client router (react-router, vue-router,
            // svelte Link) calls preventDefault at/near the link, which bubbles to us already
            // marked handled. Never hijack those — that is what broke framework routing.
            if (e.defaultPrevented) return;
            const target = e.target && e.target.closest ? e.target.closest('a') : null;
            if (!target || !target.getAttribute) return;
            const href = target.getAttribute('href');
            if (!href) return;

            // Hash links: a srcdoc document resolves '#x' against the PARENT's base URL, so letting
            // the browser navigate would load the parent app into the frame. Instead, set the hash
            // on the current document — this scrolls to '#section' and fires hashchange for a hash
            // router, with no navigation. (A router that handles the click itself already
            // preventDefaulted above, so we don't reach here for those.)
            if (href.charAt(0) === '#') {
              e.preventDefault();
              var id = href.length > 1 ? href.slice(1) : '';
              var scrollEl = id ? document.getElementById(id) : null;
              if (scrollEl) {
                scrollEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
              } else {
                // No matching element — likely a hash-router route (e.g. #/about); set the hash to
                // fire hashchange so the router responds. No navigation in either case.
                try { window.location.hash = href; } catch (e) { /* best-effort */ }
              }
              return;
            }
            // Native schemes and downloads — let the browser handle them.
            if (/^(mailto:|tel:|javascript:)/i.test(href) || target.hasAttribute('download')) return;

            if (!isInIframe) return;

            // External: don't let the frame navigate away (that replaces the preview). Hand off
            // to the host, which confirms and opens a new tab with noopener,noreferrer.
            if (/^(https?:)?\\/\\//i.test(href)) {
              e.preventDefault();
              window.parent.postMessage({ type: 'preview:external', href: href }, '*');
              return;
            }
            // Internal, not app-handled → host serves the file (no server behind srcdoc).
            e.preventDefault();
            window.parent.postMessage({ type: 'navigate', path: resolveInternalPath(href) }, '*');
          });

          const selectorState = {
            active: false,
            overlay: null,
            lastTarget: null,
            previousCursor: ''
          };

          function isElement(node) {
            return node && node.nodeType === 1;
          }

          function ensureOverlay() {
            if (selectorState.overlay) {
              return selectorState.overlay;
            }
            const overlay = document.createElement('div');
            // The one thing that tells this div apart from a user's own. Nothing could recognise it
            // before, so neither a serializer walking document.body nor any future consumer could
            // exclude it.
            overlay.setAttribute('data-osw-overlay', '1');
            overlay.style.position = 'absolute';
            overlay.style.pointerEvents = 'none';
            overlay.style.border = '2px solid rgba(99, 102, 241, 0.95)';
            overlay.style.background = 'rgba(99, 102, 241, 0.08)';
            overlay.style.boxShadow = '0 0 0 4px rgba(99, 102, 241, 0.32), 0 20px 40px rgba(15, 23, 42, 0.28)';
            overlay.style.borderRadius = '12px';
            overlay.style.zIndex = '2147483647';
            overlay.style.transition = 'top 0.12s ease-out, left 0.12s ease-out, width 0.12s ease-out, height 0.12s ease-out';
            overlay.style.willChange = 'top, left, width, height';
            selectorState.overlay = overlay;
            document.body.appendChild(overlay);
            return overlay;
          }

          function positionOverlay(target) {
            if (!isElement(target)) {
              return;
            }
            const overlay = ensureOverlay();
            const rect = target.getBoundingClientRect();
            overlay.style.top = (rect.top + window.scrollY) + 'px';
            overlay.style.left = (rect.left + window.scrollX) + 'px';
            overlay.style.width = Math.max(rect.width, 1) + 'px';
            overlay.style.height = Math.max(rect.height, 1) + 'px';
            overlay.style.opacity = '1';
          }

          // The single entry point for the highlight: an element to show it on, or null to hide it.
          //
          // Hides rather than removes, and every path goes through here. Detaching and re-appending
          // the node would churn document.body.children between two serializations of the same
          // level, which is exactly the instability the Elements tree has to be immune to. It also
          // means a highlight raised while the click-selector is off has a way back down — the old
          // teardown was reachable only from disableSelector, which early-returns when the selector
          // is inactive.
          function setOverlayVisible(target) {
            if (isElement(target)) {
              positionOverlay(target);
              return;
            }
            if (selectorState.overlay) {
              selectorState.overlay.style.opacity = '0';
            }
          }

          function buildDomPath(element) {
            if (!isElement(element)) {
              return '';
            }
            const segments = [];
            let current = element;
            while (current && current.nodeType === 1) {
              let segment = current.tagName.toLowerCase();
              if (current.id) {
                // Escaped, because this path is fed back to querySelector by selection-resolve
                // after a recompile. A raw '#' + id makes an id starting with a digit or containing
                // '.', ':' or '/' either throw a SyntaxError or — worse — quietly select something
                // else. Ordinary ids come through unchanged, so the emitted format is untouched for
                // everything that already worked. (No backticks in this comment: it lives inside a
                // template literal, and one would terminate it.)
                segment += '#' + __oswEscapeIdent(current.id);
                segments.unshift(segment);
                break;
              }
              const parent = current.parentElement;
              if (parent) {
                const siblings = parent.children;
                let index = 0;
                for (let i = 0; i < siblings.length; i++) {
                  if (siblings[i].tagName === current.tagName) {
                    index++;
                  }
                  if (siblings[i] === current) {
                    if (index > 1) {
                      segment += ':nth-of-type(' + index + ')';
                    } else {
                      const hasSame = Array.from(siblings).some(function(child, childIndex) {
                        return childIndex !== i && child.tagName === current.tagName;
                      });
                      if (hasSame) {
                        segment += ':nth-of-type(' + index + ')';
                      }
                    }
                    break;
                  }
                }
              }
              segments.unshift(segment);
              current = parent;
            }
            return segments.join(' > ');
          }

          function gatherAttributes(element) {
            const attributes = {};
            if (!isElement(element) || !element.attributes) {
              return attributes;
            }
            const maxAttributes = 25;
            for (let i = 0; i < element.attributes.length && i < maxAttributes; i++) {
              const attr = element.attributes[i];
              if (!attr) continue;
              const name = attr.name;
              if (!name || name === 'style' || name.startsWith('on')) {
                continue;
              }
              // Preview-only instrumentation. Injection lands immediately after the tag name, so
              // this is always attribute index 0 — describeFocusTarget renders the first six
              // attributes into the prompt, so leaving it in would both show it to the agent and
              // evict a real attribute.
              if (name === 'data-osw-src') {
                continue;
              }
              // Same reasoning for the Elements tree's transient node id: stamped on the live
              // element as the tree serializes it, so it would otherwise be attribute index 1 of
              // anything the user has expanded to.
              if (name === 'data-osw-node') {
                continue;
              }
              attributes[name] = attr.value;
            }
            return attributes;
          }

          // The one place a focus payload is built. Every field derives from the target element
          // alone — nothing comes from the click event — so any caller holding an element can
          // produce the identical payload, and the Elements tree's select path does exactly that.
          //
          // The guarantee has to live in this function rather than in a test comparing two copies:
          // a comparison test passes right up until the copies drift, which is the next change.
          function buildSelectionPayload(target) {
            // Stamped before anything else is read, so the attribute is genuinely on the element by
            // the time outerHTML is taken — the stripper is then what keeps it out of the payload,
            // rather than the order these fields happen to be evaluated in. __oswNodeId hands back
            // an existing id, so an element the tree already serialized keeps the id the host holds.
            var nodeId = __oswNodeId(target);
            // Provenance is read here and counted here: the host cannot reach into
            // contentDocument, so anything derived from the live DOM has to be computed inside
            // the frame. Attribute values are compared in a loop rather than built into a
            // selector string — no escaping, so there is nothing to get wrong.
            var srcAttr = target.getAttribute ? target.getAttribute('data-osw-src') : null;
            var instanceCount = 0;
            if (srcAttr) {
              var all = document.querySelectorAll('[data-osw-src]');
              for (var q = 0; q < all.length; q++) {
                if (all[q].getAttribute('data-osw-src') === srcAttr) instanceCount++;
              }
            }
            return {
              domPath: buildDomPath(target),
              tagName: target.tagName.toLowerCase(),
              attributes: gatherAttributes(target),
              outerHTML: __oswStripNodeId(__oswStripProv(target.outerHTML || '')),
              srcAttr: srcAttr || undefined,
              instanceCount: instanceCount || undefined,
              nodeId: nodeId
            };
          }

          function handleMouseMove(event) {
            if (!selectorState.active) {
              return;
            }
            const target = isElement(event.target) ? event.target : (event.target && event.target.parentElement);
            if (!isElement(target) || target === selectorState.lastTarget) {
              return;
            }
            selectorState.lastTarget = target;
            setOverlayVisible(target);
          }

          function handleClick(event) {
            if (!selectorState.active) {
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            if (typeof event.stopImmediatePropagation === 'function') {
              event.stopImmediatePropagation();
            }
            const target = isElement(event.target) ? event.target : (event.target && event.target.parentElement);
            if (!isElement(target)) {
              disableSelector(false);
              return;
            }
            const payload = buildSelectionPayload(target);
            if (isInIframe) {
              window.parent.postMessage({ type: 'selector-selection', payload: payload }, '*');
            }
            disableSelector(false);
          }

          function handleContextMenu(event) {
            if (!selectorState.active) {
              return;
            }
            event.preventDefault();
            event.stopPropagation();
          }

          function handleKeyDown(event) {
            if (!selectorState.active) {
              return;
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              disableSelector(true);
            }
          }

          function enableSelector() {
            if (selectorState.active) {
              return;
            }
            selectorState.active = true;
            selectorState.previousCursor = document.body.style.cursor;
            const overlay = ensureOverlay();
            overlay.style.opacity = '0';
            document.body.style.cursor = 'crosshair';
            document.addEventListener('mousemove', handleMouseMove, true);
            document.addEventListener('click', handleClick, true);
            document.addEventListener('contextmenu', handleContextMenu, true);
            document.addEventListener('keydown', handleKeyDown, true);
          }

          function disableSelector(notifyCancel) {
            if (!selectorState.active) {
              return;
            }
            selectorState.active = false;
            selectorState.lastTarget = null;
            setOverlayVisible(null);
            document.body.style.cursor = selectorState.previousCursor || '';
            document.removeEventListener('mousemove', handleMouseMove, true);
            document.removeEventListener('click', handleClick, true);
            document.removeEventListener('contextmenu', handleContextMenu, true);
            document.removeEventListener('keydown', handleKeyDown, true);
            if (notifyCancel && isInIframe) {
              window.parent.postMessage({ type: 'selector-cancelled' }, '*');
            }
          }

          // Resolve an Elements-tree node id back to its live element, or null when it is gone.
          // querySelector rather than a Map of id to element: a map hands back a *detached* node
          // for a removed element, which positions a 1x1 overlay at (0,0) and builds a domPath from
          // a non-document root. null is the stale signal the panel wants.
          //
          // The selector is assembled by concatenation, and the id is checked to be decimal digits
          // first. Inside this frame ids can only be digits — __oswSerializeLevel mints them as
          // String(counter) — but the value arriving here came from the host over postMessage, so
          // the frame is not the only writer. A quote in it injects nothing (querySelector executes
          // nothing) but does throw a SyntaxError, which would abort the rest of this handler; the
          // digit check makes that unreachable without needing to reason about escaping.
          function __oswResolveNode(nodeId) {
            if (typeof nodeId !== 'string' || nodeId.length === 0) {
              return null;
            }
            for (let i = 0; i < nodeId.length; i++) {
              const c = nodeId.charAt(i);
              if (c < '0' || c > '9') return null;
            }
            return document.querySelector('[data-osw-node="' + nodeId + '"]');
          }

          window.addEventListener('message', function(event) {
            const data = event.data;
            if (!data || typeof data !== 'object') {
              return;
            }
            if (data.type === 'selector-toggle') {
              if (data.active) {
                enableSelector();
              } else {
                disableSelector(false);
              }
            }

            if (data.type === 'tree-request') {
              // null id is the body level. An id that no longer resolves passes null through to the
              // serializer, which returns an empty level — the reply still names the parent the
              // host asked about, so an expansion of a vanished branch resolves as empty rather
              // than leaving the panel waiting for a message that never comes.
              const root = data.nodeId == null ? document.body : __oswResolveNode(data.nodeId);
              const level = __oswSerializeLevel(root);
              if (isInIframe) {
                window.parent.postMessage({
                  type: 'tree-level',
                  parentId: data.nodeId == null ? null : data.nodeId,
                  nodes: level.nodes,
                  truncated: level.truncated
                }, '*');
              }
              return;
            }

            if (data.type === 'tree-highlight') {
              // The click selector's overlay, through its one visibility control — not a second
              // highlight mechanism, so a hover from the tree and a hover in the preview cannot
              // both be showing at once.
              setOverlayVisible(data.nodeId == null ? null : __oswResolveNode(data.nodeId));
              return;
            }

            if (data.type === 'tree-select') {
              const selected = __oswResolveNode(data.nodeId);
              if (!selected) {
                // Stop here. Falling through would build a payload for a detached or absent
                // element and hand the agent a domPath that resolves to nothing, or to something
                // else. The host is told the id is dead instead.
                if (isInIframe) {
                  window.parent.postMessage({ type: 'tree-stale', nodeId: data.nodeId }, '*');
                }
                return;
              }
              // The same builder the click path uses, so the two selections cannot differ.
              if (isInIframe) {
                window.parent.postMessage({ type: 'selector-selection', payload: buildSelectionPayload(selected) }, '*');
              }
              return;
            }

            if (data.type === 'style-query') {
              // Answered unconditionally, including for an id that no longer resolves:
              // __oswReadComputed returns {} for a null element. Returning early instead would
              // leave the host unable to tell a dead id from a frame that has not replied yet.
              const queried = __oswResolveNode(data.nodeId);
              if (isInIframe) {
                window.parent.postMessage({
                  type: 'style-computed',
                  nodeId: data.nodeId,
                  values: __oswReadComputed(queried, data.properties)
                }, '*');
              }
              return;
            }

            if (data.type === 'style-preview') {
              // No reply: the host is not waiting on one, and the next style-query reads the
              // result out of the live document anyway.
              //
              // Deliberately not re-applied on frame-ready. A recompile mints a new document and
              // takes the transient <style> with it, which is the wanted behaviour — by then
              // /overrides.css carries the rule, and putting a stale copy back would mask the next
              // edit the agent makes to the same element.
              __oswApplyStylePreview(data.markerId, data.css);
              return;
            }

            if (data.type === 'style-probe') {
              // Answered unconditionally, for the same reason style-query is: a dead id, a marker
              // with no rule in the document and an override that is simply winning all look
              // identical to a host that got no reply.
              const probed = __oswResolveNode(data.nodeId);
              const outcome = __oswProbeStyleLoss(probed, data.markerId, data.properties);
              if (isInIframe) {
                const reply = { type: 'style-probe-result', nodeId: data.nodeId, lost: outcome.lost };
                // Only when there is one to name. An always-present winner:null would have 4b's
                // message renderer branching on a value that is null in the ordinary case.
                if (outcome.winner) reply.winner = outcome.winner;
                window.parent.postMessage(reply, '*');
              }
              return;
            }

            if (data.type === 'selection-resolve') {
              // The recompile took every node id with it, so the host is holding a domPath and
              // nothing else. querySelector is wrapped because the path can predate the escaping
              // above — a selection made before this version, or an id the escape does not cover —
              // and a SyntaxError here would abort the rest of this handler.
              let resolved = null;
              try {
                resolved = typeof data.domPath === 'string' && data.domPath !== ''
                  ? document.querySelector(data.domPath)
                  : null;
              } catch (err) {
                resolved = null;
              }
              if (isInIframe) {
                // The same builder the click and tree paths use, so a re-resolved selection is not
                // a second, subtly different kind of selection.
                window.parent.postMessage({
                  type: 'selection-resolved',
                  payload: resolved ? buildSelectionPayload(resolved) : null
                }, '*');
              }
              return;
            }
          });
        })();
      </script>
    `;
}

const MultipagePreviewComponent = forwardRef<MultipagePreviewHandle, MultipagePreviewProps>(({
  projectId,
  refreshTrigger,
  onFocusSelection,
  hasFocusTarget = false,
  onClose,
  deploymentId,
  onCaptureScreenshot,
  entryPoint,
  runtime,
  onFullscreen,
  isFullscreen = false,
  placementActive,
  onPlacementToggle,
  onPlacementComplete,
  standalone = false,
  provenance = false,
  onTreeLevel,
  onTreeStale,
  onStyleComputed,
  onStyleProbeResult,
  onSelectionResolved,
  onFrameReady
}, ref) => {
  const [compiledProject, setCompiledProject] = useState<CompiledProject | null>(null);
  const [activePath, setActivePath] = useState('/');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deviceSize, setDeviceSize] = useState<DeviceSize>(() => {
    try {
      const stored = localStorage.getItem('osw-preview-device-size');
      if (stored && stored in DEVICE_SIZES) return stored as DeviceSize;
    } catch {}
    return 'tablet';
  });
  const handleSetDeviceSize = useCallback((size: DeviceSize) => {
    setDeviceSize(size);
    try { localStorage.setItem('osw-preview-device-size', size); } catch {}
  }, []);
  const [navigationHistory, setNavigationHistory] = useState<string[]>(['/']);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [iframeReady, setIframeReady] = useState(false);
  // The preview "escaped": the frame navigated somewhere that isn't the document we wrote (a form
  // submit, window.location, meta refresh, etc.). Drives the recovery overlay.
  const [escaped, setEscaped] = useState(false);
  const [selectorActive, setSelectorActive] = useState(false);
  const [draggingBlock, setDraggingBlock] = useState<PlacementBlockInfo | null>(null);
  const [paletteVisible, setPaletteVisible] = useState(true);
  const [localPaletteOpen, setLocalPaletteOpen] = useState(false);
  const paletteStateRef = useRef({ localPaletteOpen: false, paletteVisible: true, draggingBlock: null as PlacementBlockInfo | null });
  const [isCapturing, setIsCapturing] = useState(false);
  useEffect(() => {
    paletteStateRef.current = { localPaletteOpen, paletteVisible, draggingBlock };
  }, [localPaletteOpen, paletteVisible, draggingBlock]);

  const handleCaptureClick = useCallback(async () => {
    if (!iframeRef.current || !iframeReady || !onCaptureScreenshot) return;
    setIsCapturing(true);
    try {
      const screenshot = await captureIframeScreenshot(
        iframeRef.current,
        undefined, undefined, undefined, undefined, undefined, undefined,
        false, 1500
      );
      if (screenshot) onCaptureScreenshot(screenshot);
    } finally {
      setIsCapturing(false);
    }
  }, [iframeReady, onCaptureScreenshot]);

  const crosshairButtonStyle = useMemo(() => {
    if (selectorActive) {
      return { backgroundColor: 'var(--button-preview-active)', color: 'white' };
    }
    if (hasFocusTarget) {
      return { backgroundColor: 'rgba(99, 102, 241, 0.12)', color: 'var(--button-preview-active)' };
    }
    return {};
  }, [selectorActive, hasFocusTarget]);

  useEffect(() => {
    if (placementActive) {
      setPaletteVisible(true);
    }
  }, [placementActive]);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  // Mirror iframeReady into a ref so functions captured in stale closures (e.g. the memoized
  // compileAndLoadInternal, which holds an old loadPage) read the *current* readiness rather than a
  // stale `false` from an early render — otherwise their loadPage defers forever.
  const iframeReadyRef = useRef(false);
  // Stable ref callback: an inline `ref={(el) => ...}` gets a new identity every render, so React
  // detaches (null) + reattaches (node) on every re-render, which made `iframeReady` oscillate.
  // A stable callback only runs on real mount/unmount.
  const setIframeEl = useCallback((el: HTMLIFrameElement | null) => {
    iframeRef.current = el;
    iframeReadyRef.current = !!el;
    setIframeReady(!!el);
  }, []);
  const serverRef = useRef<VirtualServer | null>(null);
  const compiledProjectRef = useRef<CompiledProject | null>(null);
  const activePathRef = useRef<string>('/');
  const pendingLoadPath = useRef<string | null>(null);
  // Per-load handshake / escape recovery. lifecycleRef holds the pure decision logic;
  // loadIdCounterRef mints monotonic ids; loadPageRef lets the stable escape handler reach the
  // latest loadPage closure (for the auto-reload).
  const lifecycleRef = useRef(new PreviewLifecycle());
  const loadIdCounterRef = useRef(0);
  const loadPageRef = useRef<((path: string, compiled?: CompiledProject, isRecovery?: boolean) => void) | null>(null);
  // Set true once we've successfully read our own marker from the frame. Guards escape detection:
  // we only trust a "contentWindow read threw" as a real cross-origin escape once we know reads
  // normally work — so if they never do (unexpected sandbox behaviour), escape detection is inert
  // and can never break a working preview.
  const markerReadableRef = useRef(false);

  // Respond to a confident escape signal (the load-event marker check found the frame is no longer
  // our document): one bounded auto-reload, then the recovery overlay. Stable — safe to call from
  // the load handler.
  const handleEscapeSignal = useCallback((loadId: number) => {
    const action = lifecycleRef.current.onEscapeSignal(loadId);
    if (action === 'auto-reload') {
      loadPageRef.current?.(activePathRef.current || '/', undefined, true);
    } else if (action === 'escaped') {
      setEscaped(true);
    }
  }, []);
  const selectorActiveRef = useRef(false);

  const postMessageToIframe = useCallback((message: PreviewHostMessage) => {
    if (!iframeRef.current || !iframeRef.current.contentWindow) {
      return;
    }
    try {
      iframeRef.current.contentWindow.postMessage(message, '*');
    } catch (err) {
      logger.warn('Failed to communicate with preview iframe', err);
    }
  }, []);

  const handlePlacementDragOver = useCallback((e: React.DragEvent) => {
    if (!draggingBlock) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    const iframe = iframeRef.current;
    if (!iframe) return;
    const iframeRect = iframe.getBoundingClientRect();
    const computedStyle = window.getComputedStyle(iframe);
    const transform = computedStyle.transform;
    let scale = 1;
    if (transform && transform !== 'none') {
      const match = transform.match(/matrix\(([^,]+)/);
      if (match) scale = parseFloat(match[1]) || 1;
    }
    const x = (e.clientX - iframeRect.left) / scale;
    const y = (e.clientY - iframeRect.top) / scale;
    postMessageToIframe({ type: 'placement-hover', x, y });
  }, [draggingBlock, postMessageToIframe]);

  const handlePlacementDrop = useCallback((e: React.DragEvent) => {
    if (!draggingBlock) return;
    e.preventDefault();
    postMessageToIframe({ type: 'placement-drop' });
    setDraggingBlock(null);
    setPaletteVisible(true);
  }, [draggingBlock, postMessageToIframe]);

  const handlePlacementDragLeave = useCallback((e: React.DragEvent) => {
    if (!draggingBlock) return;
    const related = e.relatedTarget as Node | null;
    const leaving = !related || !e.currentTarget.contains(related);
    if (leaving) {
      postMessageToIframe({ type: 'placement-cancel' });
    }
  }, [draggingBlock, postMessageToIframe]);

  const startBlockDrag = useCallback((block: PlacementBlockInfo) => {
    setDraggingBlock(block);
    postMessageToIframe({ type: 'placement-start', block });
  }, [postMessageToIframe]);

  const handleBlockDragStart = useCallback((block: SemanticBlock) => {
    // Defer state updates — synchronous re-render during dragstart
    // repositions the drag source and browsers cancel the drag.
    setTimeout(() => {
      setPaletteVisible(false);
      startBlockDrag({ id: block.id, name: block.name, wireframeHtml: block.wireframeHtml });
    }, 0);
  }, [startBlockDrag]);

  // Expose captureScreenshot method via ref
  useImperativeHandle(ref, () => ({
    captureScreenshot: async (waitForContent?: boolean) => {
      if (!iframeRef.current || !iframeReady) {
        logger.warn('Cannot capture screenshot: iframe not ready');
        return null;
      }
      return await captureIframeScreenshot(
        iframeRef.current,
        undefined, undefined, undefined, undefined, undefined, undefined,
        waitForContent ?? false,
        1500
      );
    },
    startBlockDrag,
    getActivePath: () => activePath || '/index.html',
    removePlaceholder: (placementId: string) => {
      postMessageToIframe({ type: 'placement-remove', placementId });
    },
    sendToFrame: postMessageToIframe,
  }), [iframeReady, startBlockDrag, activePath, postMessageToIframe]);

  const compilingRef = useRef(false);
  const pendingCompileOptionsRef = useRef<{ preserve: boolean; showLoading: boolean } | null>(null);
  const compileTimeoutRef = useRef<number | null>(null);
  const scheduledCompileOptionsRef = useRef<{ preserve: boolean; showLoading: boolean } | null>(null);
  const compileGeneration = useRef(0);

  const Header = () => (
    isFullscreen ? null : <PanelHeader icon={Eye} title="Live Preview" color="var(--button-preview-active)" onClose={onClose} panelKey="preview" />
  );

  useEffect(() => {
    compiledProjectRef.current = compiledProject;
  }, [compiledProject]);

  useEffect(() => {
    selectorActiveRef.current = selectorActive;
    if (iframeReady) {
      postMessageToIframe({ type: 'selector-toggle', active: selectorActive });
    }
  }, [selectorActive, iframeReady, postMessageToIframe]);

  // Kept in a ref rather than in the load effect's dependencies: the consumer passes an inline
  // callback, so a dependency would tear down and re-add the load listener on every parent render —
  // and that effect also owns escape detection.
  const onFrameReadyRef = useRef(onFrameReady);
  onFrameReadyRef.current = onFrameReady;

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) {
      return;
    }
    const handleLoad = () => {
      postMessageToIframe({ type: 'selector-toggle', active: selectorActiveRef.current });
      // Verify, on the load event, that the frame still holds the document we wrote. contentWindow
      // is stable and same-origin here (unlike the very-early postMessage ack, which can race), so
      // reading our marker is the reliable readiness signal. Escape ONLY on a confident signal —
      // reading contentWindow throws (cross-origin: the frame navigated to an external site), or a
      // *different-numbered* marker is present. A missing marker mid-transition is treated as OK so
      // a normal load can never be mistaken for an escape.
      const expected = lifecycleRef.current.loadId;
      if (expected === 0) return; // initial about:blank load, before we've written any document

      try {
        const marker = (iframeRef.current?.contentWindow as unknown as { __oswPreview?: { loadId?: number } })?.__oswPreview;
        const markerLoadId = marker?.loadId;
        if (markerLoadId === expected) {
          // Our current document loaded — ready.
          markerReadableRef.current = true;
          lifecycleRef.current.onAck(expected);
          setEscaped(false);
          // Only here, and only after the marker matched: this is the first moment a message posted
          // into the frame reaches the document we wrote. Announced on every load, because each one
          // invalidates whatever the consumer knows about the old document.
          onFrameReadyRef.current?.();
        } else if (typeof markerLoadId === 'number') {
          // A different load's marker: still one of our documents (a stale/rapid load), not an
          // external escape — reads work, so record that, but don't recover.
          markerReadableRef.current = true;
        }
        // else: readable window with no marker yet (our doc still settling) → do nothing.
      } catch {
        // contentWindow read threw → cross-origin → the frame navigated to an external site. Only
        // act on this once we've proven reads normally work, so an unexpected sandbox that always
        // throws can't be mistaken for a perpetual escape.
        if (markerReadableRef.current) handleEscapeSignal(expected);
      }
    };
    iframe.addEventListener('load', handleLoad);
    return () => {
      iframe.removeEventListener('load', handleLoad);
    };
  }, [iframeReady, postMessageToIframe, handleEscapeSignal]);

  useEffect(() => {
    activePathRef.current = activePath;
  }, [activePath]);


  useEffect(() => {
    if (iframeReady && pendingLoadPath.current && compiledProjectRef.current) {
      const pathToLoad = pendingLoadPath.current;
      pendingLoadPath.current = null;
      loadPage(pathToLoad, compiledProjectRef.current);
    }
  }, [iframeReady]);

  // Listen for previewNavigate event (dispatched by AI preview command)
  useEffect(() => {
    const handler = (e: Event) => {
      const path = (e as CustomEvent).detail?.path;
      if (!path) return;

      if (compiledProjectRef.current) {
        loadPage(path, compiledProjectRef.current);
      } else {
        pendingLoadPath.current = path;
      }
    };
    window.addEventListener('previewNavigate', handler);
    return () => window.removeEventListener('previewNavigate', handler);
  }, []);

  useEffect(() => {
    return () => {
      if (compileTimeoutRef.current) {
        window.clearTimeout(compileTimeoutRef.current);
      }
    };
  }, []);

  const compileAndLoadInternal = useCallback(async (preserveCurrentPath = false, showLoading = true) => {
    const gen = ++compileGeneration.current;

    if (showLoading) {
      setLoading(true);
    }
    setError(null);

    try {
      await vfs.init();

      const currentPath = preserveCurrentPath ? activePathRef.current : null;

      if (serverRef.current) {
        serverRef.current.cleanupBlobUrls();
      }

      const server = new VirtualServer(vfs, projectId, { deploymentId: deploymentId || undefined, entryPoint, runtime, provenance });
      serverRef.current = server;

      const compiled = await withTimeout(server.compileProject(), COMPILE_TIMEOUT_MS, 'Compile');

      // A newer compile started while we were awaiting — discard this result
      if (gen !== compileGeneration.current) return;

      setCompiledProject(compiled);
      compiledProjectRef.current = compiled;

      let pathToLoad = currentPath;
      if (!pathToLoad) {
        const ep = compiled.entryPoint || '/index.html';
        if (ep !== '/index.html' && compiled.blobUrls.has(ep)) {
          // Non-default entry point — navigate directly to it
          pathToLoad = ep;
        } else {
          pathToLoad = compiled.blobUrls.has(ep) ? '/' :
                       (compiled.routes.length > 0 ? compiled.routes[0].path : '/');
        }
      }

      loadPage(pathToLoad, compiled);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to compile project');
      logger.error('Compilation error:', err);
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }, [projectId, deploymentId, entryPoint, runtime, provenance]);

  const compileAndLoad = useCallback((preserveCurrentPath: boolean = false, showLoading: boolean = true) => {
    if (compilingRef.current) {
      const pending = pendingCompileOptionsRef.current;
      pendingCompileOptionsRef.current = {
        preserve: (pending?.preserve ?? false) || preserveCurrentPath,
        showLoading: (pending?.showLoading ?? false) || showLoading
      };
      return;
    }

    const run = async (preserve: boolean, loadingFlag: boolean) => {
      compilingRef.current = true;
      try {
        await compileAndLoadInternal(preserve, loadingFlag);
      } finally {
        compilingRef.current = false;
        const pending = pendingCompileOptionsRef.current;
        pendingCompileOptionsRef.current = null;
        if (pending) {
          compileAndLoad(pending.preserve, pending.showLoading);
        }
      }
    };

    void run(preserveCurrentPath, showLoading);
  }, [compileAndLoadInternal]);

  const scheduleCompile = useCallback((preserveCurrentPath = false, showLoading = false) => {
    const pending = scheduledCompileOptionsRef.current;
    scheduledCompileOptionsRef.current = {
      preserve: (pending?.preserve ?? false) || preserveCurrentPath,
      showLoading: (pending?.showLoading ?? false) || showLoading
    };

    if (compileTimeoutRef.current) {
      window.clearTimeout(compileTimeoutRef.current);
    }

    compileTimeoutRef.current = window.setTimeout(() => {
      const options = scheduledCompileOptionsRef.current;
      scheduledCompileOptionsRef.current = null;
      compileTimeoutRef.current = null;
      if (options) {
        compileAndLoad(options.preserve, options.showLoading);
      }
    }, 150);
  }, [compileAndLoad]);


  const workspaceReadyFlag = useWorkspaceStore(s => s.workspaceReady);
  // A standalone preview owns its project, so there is no opening sequence to wait behind.
  const workspaceReady = standalone || workspaceReadyFlag;
  const workspaceReadyRef = useRef(workspaceReady);
  workspaceReadyRef.current = workspaceReady;

  useEffect(() => {
    if (!workspaceReady) return;
    compileAndLoad();
  }, [projectId, workspaceReady, compileAndLoad]);

  // Toggling provenance changes the compiled output, so it needs a recompile — but only when the
  // flag itself changed. The guard is on the previous *value*, not on "is this the first run":
  // compileAndLoad's identity also changes with projectId/deploymentId/entryPoint/runtime, and a
  // first-run guard would then fire here on every project switch. Because compileAndLoad OR-merges
  // pending options, that would force preserve: true onto the fresh-navigation compile the effect
  // above is already doing, plus a redundant second compile.
  const prevProvenance = useRef(provenance);
  useEffect(() => {
    if (prevProvenance.current === provenance) return;
    prevProvenance.current = provenance;
    // Keep the current page, no loading flash — the user is looking at the page they selected in.
    compileAndLoad(true, false);
  }, [provenance, compileAndLoad]);

  // refreshTrigger bumps coalesce with concurrent filesChanged events through
  // the same debounce so a bulk operation produces one compile, not two.
  const isFirstRefreshTrigger = useRef(true);
  useEffect(() => {
    if (isFirstRefreshTrigger.current) {
      isFirstRefreshTrigger.current = false;
      return;
    }
    if (!workspaceReadyRef.current) return;
    scheduleCompile(true);
  }, [refreshTrigger, scheduleCompile]);

  useEffect(() => {
    const handleFileChange = () => {
      if (!workspaceReadyRef.current) return;
      scheduleCompile(true);
    };

    const handleFileContentChange = (event: Event) => {
      if (!workspaceReadyRef.current) return;
      const customEvent = event as CustomEvent<{ projectId?: string }>;
      if (!customEvent.detail || customEvent.detail.projectId === projectId) {
        scheduleCompile(true);
      }
    };

    window.addEventListener('filesChanged', handleFileChange as EventListener);
    window.addEventListener('fileContentChanged', handleFileContentChange as EventListener);
    return () => {
      window.removeEventListener('filesChanged', handleFileChange as EventListener);
      window.removeEventListener('fileContentChanged', handleFileContentChange as EventListener);
    };
  }, [projectId, scheduleCompile]);


  const loadPage = (path: string, compiled?: CompiledProject, isRecovery = false) => {
    const projectToUse = compiled || compiledProjectRef.current || compiledProject;

    if (!projectToUse) {
      logger.warn('No compiled project available');
      return;
    }

    if (selectorActiveRef.current) {
      setSelectorActive(false);
    } else {
      postMessageToIframe({ type: 'selector-toggle', active: false });
    }

    if (!iframeRef.current || !iframeReadyRef.current) {
      pendingLoadPath.current = path;
      return;
    }

    let normalizedPath = path;
    if (!normalizedPath.startsWith('/')) {
      normalizedPath = '/' + normalizedPath;
    }

    const route = projectToUse.routes.find(r => r.path === normalizedPath);
    let filePath: string;
    if (route) {
      filePath = route.file;
    } else if (normalizedPath === '/') {
      filePath = '/index.html';
    } else if (normalizedPath.endsWith('.html')) {
      // Already a full file path (e.g., entry point like /.renderer/index.html)
      filePath = normalizedPath;
    } else if (normalizedPath.endsWith('/')) {
      // Directory path - look for index.html
      filePath = normalizedPath + 'index.html';
    } else {
      filePath = normalizedPath + '.html';
    }

    let htmlFile = projectToUse.files.find(f => f.path === filePath);

    // If not found and path doesn't end with /, try directory index as fallback
    if (!htmlFile && !normalizedPath.endsWith('/')) {
      const dirIndexPath = normalizedPath + '/index.html';
      htmlFile = projectToUse.files.find(f => f.path === dirIndexPath);
      if (htmlFile) {
        filePath = dirIndexPath;
      }
    }

    if (!htmlFile) {
      setError(`Page not found: ${path}`);
      const indexFile = projectToUse.files.find(f => f.path === '/index.html' || f.path === 'index.html');
      if (indexFile && path !== '/') {
        loadPage('/', compiled);
      }
      return;
    }

    let processedHtml = typeof htmlFile.content === 'string' 
      ? htmlFile.content 
      : new TextDecoder().decode(htmlFile.content as ArrayBuffer);
    
    processedHtml = processedHtml.replace(/href="([^"]+)"/g, (match, href) => {
      // Skip if not a CSS file or if it's an external URL
      if (!href.endsWith('.css') || href.startsWith('http') || href.startsWith('//')) {
        return match;
      }
      
      const normalizedHref = href.startsWith('/') ? href : '/' + href;
      const blobUrl = projectToUse.blobUrls.get(normalizedHref);
      
      if (blobUrl) {
        return `href="${blobUrl}"`;
      }
      return match;
    });
    
    // Replace JavaScript sources
    processedHtml = processedHtml.replace(/src="([^"]+)"/g, (match, src) => {
      if (!src.endsWith('.js') || src.startsWith('http') || src.startsWith('//')) {
        return match;
      }
      
      const normalizedSrc = src.startsWith('/') ? src : '/' + src;
      const blobUrl = projectToUse.blobUrls.get(normalizedSrc);
      
      if (blobUrl) {
        return `src="${blobUrl}"`;
      }
      return match;
    });
    
    processedHtml = processedHtml.replace(/src="([^"]+\.(png|jpg|jpeg|gif|svg|webp))"/gi, (match, imgPath) => {
      const normalizedImgPath = imgPath.startsWith('/') ? imgPath : '/' + imgPath;
      const blobUrl = projectToUse.blobUrls.get(normalizedImgPath);
      return blobUrl ? `src="${blobUrl}"` : match;
    });

    const navigationScript = generateNavigationScript(normalizedPath);
    
    const placementScript = generatePlacementScript();
    const injectedScripts = navigationScript + placementScript;
    if (processedHtml.includes('</body>')) {
      processedHtml = processedHtml.replace('</body>', injectedScripts + '</body>');
    } else {
      processedHtml += injectedScripts;
    }

    // Expose the blob-URL map to the iframe so the runtime fetch/XHR interceptor can resolve any
    // VFS path (e.g. fetch('/components/nav.html')). A compiled page carries no map of its own, so
    // whoever renders one has to supply it; `injectVfsBlobMap` is the same script for renderers
    // that inject it alone, and the two have to stay in step.
    const vfsMapJson = JSON.stringify(Object.fromEntries(projectToUse.blobUrls)).replace(/</g, '\\u003c');
    const vfsMapScript = `<script>window.__oswVfsBlobUrls = ${vfsMapJson};</script>`;

    // Per-load handshake: stamp the document with a fresh loadId marker in <head> (runs during
    // parse, before app JS). On the iframe's load event the host reads this marker to confirm the
    // frame still holds the document it wrote; if it navigated away, we recover.
    const loadId = ++loadIdCounterRef.current;
    lifecycleRef.current.beginLoad(loadId, isRecovery);
    const markerScript = `<script>window.__oswPreview={loadId:${loadId}};</script>`;
    const headInject = markerScript + vfsMapScript;
    if (processedHtml.includes('<head>')) {
      processedHtml = processedHtml.replace('<head>', '<head>' + headInject);
    } else {
      processedHtml = headInject + processedHtml;
    }

    // Clear stale runtime errors before loading new content —
    // only errors from this compilation should be in the buffer.
    clearRuntimeErrors();
    iframeRef.current.srcdoc = processedHtml;
    setActivePath(normalizedPath);
    activePathRef.current = normalizedPath;
  };

  // Keep a ref to the latest loadPage so stable callbacks (escape timer, message handler) can call it.
  loadPageRef.current = loadPage;

  // Push a new entry (truncating any forward history). Kept separate from loadPage so that
  // Back/Forward (which re-render a page without changing history) don't re-append — the old
  // bug where loadPage always pushed made Back immediately return to the end.
  const pushHistory = useCallback((path: string) => {
    const normalized = path.startsWith('/') ? path : '/' + path;
    setHistoryIndex(currentIndex => {
      setNavigationHistory(currentHistory => [...currentHistory.slice(0, currentIndex + 1), normalized]);
      return currentIndex + 1;
    });
  }, []);

  const handleNavigation = useCallback((path: string) => {
    loadPage(path);
    pushHistory(path);
  }, [compiledProject, pushHistory]);

  const handleBack = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      loadPage(navigationHistory[newIndex]);
    }
  };

  const handleForward = () => {
    if (historyIndex < navigationHistory.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      loadPage(navigationHistory[newIndex]);
    }
  };

  const handleHome = () => {
    loadPage('/');
    pushHistory('/');
  };

  const handleRefresh = () => {
    compileAndLoad(true, false);
  };


  useEffect(() => {
    const handleMessage = (event: MessageEvent<PreviewMessage>) => {
      // Only handle messages from our own iframe
      if (iframeRef.current && event.source !== iframeRef.current.contentWindow) {
        return;
      }
      const data = event.data;
      if (!data || typeof data !== 'object') {
        return;
      }

      if (data.type === 'console') {
        window.dispatchEvent(new CustomEvent('previewConsole', {
          detail: { level: data.level, args: data.args },
        }));
        if (data.level === 'error') {
          pushRuntimeError(data.args.join(' '));
        }
        return;
      }

      if (data.type === 'navigate' && data.path) {
        handleNavigation(data.path);
        return;
      }

      if (data.type === 'preview:external' && data.href) {
        // External link from the preview. The iframe runs untrusted content, so validate the scheme
        // before opening — only http(s) web links, never javascript:/data:/etc. (which window.open
        // would execute/render). Then confirm and open a new tab from the host context with
        // noopener,noreferrer so the target gets no window.opener handle and no referrer.
        let url: URL;
        try { url = new URL(data.href, window.location.href); } catch { return; }
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
        const href = url.href;
        toast('Open external link?', {
          description: url.host,
          action: {
            label: 'Open in new tab',
            onClick: () => { window.open(href, '_blank', 'noopener,noreferrer'); },
          },
        });
        return;
      }

      if (data.type === 'selector-selection' && data.payload) {
        setSelectorActive(false);
        onFocusSelection?.(data.payload);
        return;
      }

      if (data.type === 'selector-cancelled') {
        setSelectorActive(false);
        return;
      }

      if (data.type === 'placement-complete' && data.payload) {
        setPaletteVisible(true);
        onPlacementComplete?.(data.payload);
        return;
      }

      if (data.type === 'placement-cancelled') {
        setDraggingBlock(null);
        setPaletteVisible(true);
        return;
      }

      if (data.type === 'tree-level') {
        onTreeLevel?.(data);
        return;
      }

      if (data.type === 'tree-stale') {
        onTreeStale?.(data);
        return;
      }

      if (data.type === 'style-computed') {
        onStyleComputed?.(data);
        return;
      }

      if (data.type === 'style-probe-result') {
        onStyleProbeResult?.(data);
        return;
      }

      if (data.type === 'selection-resolved') {
        onSelectionResolved?.(data);
        return;
      }

      if (data.type === 'iframe-click') {
        const ps = paletteStateRef.current;
        if (ps.localPaletteOpen && ps.paletteVisible && !ps.draggingBlock) {
          setLocalPaletteOpen(false);
          setTimeout(() => onPlacementToggle?.(), 0);
        }
        return;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [handleNavigation, onFocusSelection, onPlacementComplete, onTreeLevel, onTreeStale,
      onStyleComputed, onStyleProbeResult, onSelectionResolved]);


  useEffect(() => {
    return () => {
      if (serverRef.current) {
        serverRef.current.cleanupBlobUrls();
      }
    };
  }, []);

  useEffect(() => {
    if (placementActive && selectorActive) {
      setSelectorActive(false);
    }
  }, [placementActive, selectorActive]);

  useEffect(() => {
    if (!draggingBlock) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        postMessageToIframe({ type: 'placement-cancel' });
        setDraggingBlock(null);
        setPaletteVisible(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [draggingBlock, postMessageToIframe]);

  if (loading) {
    return (
      <div className="h-full flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-2">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto text-primary" />
            <p className="text-muted-foreground">Compiling project...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-destructive space-y-2">
            <p className="font-medium">Error</p>
            <p className="text-sm mt-2">{error}</p>
            <Button onClick={handleRefresh} className="mt-4">
              Try Again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <Header />
      {/* Mobile Layout - Single row with navigation and page selector */}
      <div className="border-b p-2 flex items-center gap-2 md:hidden">
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-5 w-5"
            onClick={handleBack}
            disabled={historyIndex === 0}
          >
            <ChevronLeft className="h-3 w-3" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-5 w-5"
            onClick={handleForward}
            disabled={historyIndex >= navigationHistory.length - 1}
          >
            <ChevronRight className="h-3 w-3" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-5 w-5"
            onClick={handleHome}
          >
            <Home className="h-3 w-3" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-5 w-5"
            onClick={handleRefresh}
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-5 w-5"
            onClick={() => {
              const next = !selectorActive;
              setSelectorActive(next);
              if (next && localPaletteOpen) {
                setLocalPaletteOpen(false);
                setTimeout(() => onPlacementToggle?.(), 0);
              }
            }}
            disabled={!iframeReady}
            style={crosshairButtonStyle}
            title={selectorActive ? 'Cancel element selection' : hasFocusTarget ? 'Replace focused element' : 'Select element'}
            data-tour-id="focus-crosshair-button"
          >
            <Crosshair className="h-3 w-3" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-5 w-5"
            onClick={() => {
              setLocalPaletteOpen(prev => !prev);
              setTimeout(() => onPlacementToggle?.(), 0);
            }}
            disabled={!iframeReady}
            title="Semantic blocks"
            style={localPaletteOpen ? { backgroundColor: 'var(--button-preview-active)', color: 'white' } : {}}
          >
            <LayoutGrid className="h-3 w-3" />
          </Button>
          {onCaptureScreenshot && (
            <Button
              size="icon"
              variant="ghost"
              className="h-5 w-5"
              onClick={handleCaptureClick}
              disabled={!iframeReady || isCapturing}
              title="Capture screenshot as thumbnail"
            >
              {isCapturing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />}
            </Button>
          )}
        </div>

        {/* Page selector takes remaining space */}
        {compiledProject && compiledProject.routes.length > 1 && (
          <Select value={activePath} onValueChange={handleNavigation}>
            <SelectTrigger className="flex-1 h-8 min-w-0 max-w-full">
              <SelectValue className="truncate" />
            </SelectTrigger>
            <SelectContent>
              {compiledProject.routes.map(route => (
                <SelectItem key={route.path} value={route.path}>
                  {route.title || route.path}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Desktop Layout - Single row */}
      <div className="border-b p-2 hidden md:flex items-center gap-2">
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-5 w-5"
            onClick={handleBack}
            disabled={historyIndex === 0}
          >
            <ChevronLeft className="h-3 w-3" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-5 w-5"
            onClick={handleForward}
            disabled={historyIndex >= navigationHistory.length - 1}
          >
            <ChevronRight className="h-3 w-3" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-5 w-5"
            onClick={handleHome}
          >
            <Home className="h-3 w-3" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-5 w-5"
            onClick={handleRefresh}
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-5 w-5"
            onClick={() => {
              const next = !selectorActive;
              setSelectorActive(next);
              if (next && localPaletteOpen) {
                setLocalPaletteOpen(false);
                setTimeout(() => onPlacementToggle?.(), 0);
              }
            }}
            disabled={!iframeReady}
            style={crosshairButtonStyle}
            title={selectorActive ? 'Cancel element selection' : hasFocusTarget ? 'Replace focused element' : 'Select element'}
            data-tour-id="focus-crosshair-button"
          >
            <Crosshair className="h-3 w-3" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-5 w-5"
            onClick={() => {
              setLocalPaletteOpen(prev => !prev);
              setTimeout(() => onPlacementToggle?.(), 0);
            }}
            disabled={!iframeReady}
            title="Semantic blocks"
            style={localPaletteOpen ? { backgroundColor: 'var(--button-preview-active)', color: 'white' } : {}}
          >
            <LayoutGrid className="h-3 w-3" />
          </Button>
          {onCaptureScreenshot && (
            <Button
              size="icon"
              variant="ghost"
              className="h-5 w-5"
              onClick={handleCaptureClick}
              disabled={!iframeReady || isCapturing}
              title="Capture screenshot as thumbnail"
            >
              {isCapturing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />}
            </Button>
          )}
        </div>

        <div className="flex-1 px-3 py-1 bg-muted rounded text-sm">
          {activePath}
        </div>

        {compiledProject && compiledProject.routes.length > 1 && (
          <Select value={activePath} onValueChange={handleNavigation}>
            <SelectTrigger className="w-[200px] h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {compiledProject.routes.map(route => (
                <SelectItem key={route.path} value={route.path}>
                  {route.title || route.path}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <div className="flex items-center gap-1 border-l pl-2">
          <Button
            size="icon"
            variant="ghost"
            className="h-5 w-5 rounded-sm"
            style={{
              backgroundColor: deviceSize === 'mobile' ? 'var(--button-preview-active)' : undefined,
              color: deviceSize === 'mobile' ? 'white' : undefined
            }}
            onClick={() => handleSetDeviceSize('mobile')}
          >
            <Smartphone className="h-3 w-3" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-5 w-5 rounded-sm"
            style={{
              backgroundColor: deviceSize === 'tablet' ? 'var(--button-preview-active)' : undefined,
              color: deviceSize === 'tablet' ? 'white' : undefined
            }}
            onClick={() => handleSetDeviceSize('tablet')}
          >
            <Tablet className="h-3 w-3" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-5 w-5 rounded-sm"
            style={{
              backgroundColor: deviceSize === 'desktop' ? 'var(--button-preview-active)' : undefined,
              color: deviceSize === 'desktop' ? 'white' : undefined
            }}
            onClick={() => handleSetDeviceSize('desktop')}
          >
            <Monitor className="h-3 w-3" />
          </Button>
          {isFullscreen ? (
            <Button
              size="icon"
              variant="ghost"
              className="h-5 w-5 rounded-sm"
              onClick={onClose}
              title="Exit full size preview"
            >
              <Minimize className="h-3 w-3" />
            </Button>
          ) : onFullscreen ? (
            <Button
              size="icon"
              variant="ghost"
              className="h-5 w-5 rounded-sm"
              onClick={onFullscreen}
              title="Full size preview"
            >
              <Maximize className="h-3 w-3" />
            </Button>
          ) : null}
        </div>
      </div>

      {/* Preview Frame */}
      <div
        className={cn("flex-1 bg-muted/20 dark:bg-muted/10 overflow-auto min-h-0 relative", !isFullscreen && "p-4")}
        onClick={() => {
          if (localPaletteOpen && paletteVisible && !draggingBlock) {
            setLocalPaletteOpen(false);
            setTimeout(() => onPlacementToggle?.(), 0);
          }
        }}
      >
        <PalettePanel
          onDragStart={handleBlockDragStart}
          onClose={() => { setLocalPaletteOpen(false); setTimeout(() => onPlacementToggle?.(), 0); }}
          collapsed={!localPaletteOpen || !paletteVisible}
        />
        {escaped && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <div className="max-w-xs rounded-lg border border-border bg-card p-4 text-center shadow-lg">
              <p className="text-sm font-medium">Preview navigated away</p>
              <p className="mt-1 text-xs text-muted-foreground">
                A link, form, or script sent the preview to another page.
              </p>
              <Button
                size="sm"
                className="mt-3"
                onClick={() => loadPageRef.current?.(activePathRef.current || '/', undefined, false)}
              >
                Reload preview
              </Button>
            </div>
          </div>
        )}
        <div
          className={cn(
            "bg-white mx-auto transition-all duration-300",
            !isFullscreen && "shadow-2xl",
            !isFullscreen && deviceSize !== 'responsive' && "rounded-lg"
          )}
          style={{
            width: DEVICE_SIZES[deviceSize].width || '100%',
            height: DEVICE_SIZES[deviceSize].height || '100%',
            maxHeight: DEVICE_SIZES[deviceSize].maxHeight || '100%',
            maxWidth: DEVICE_SIZES[deviceSize].maxWidth || '100%',
            ...(draggingBlock ? { cursor: 'crosshair' } : {}),
          }}
          onDragOver={handlePlacementDragOver}
          onDrop={handlePlacementDrop}
          onDragLeave={handlePlacementDragLeave}
        >
          <iframe
            ref={setIframeEl}
            className={cn("w-full h-full", !isFullscreen && "rounded-lg")}
            sandbox="allow-scripts allow-same-origin allow-forms"
            title="Preview"
            style={draggingBlock ? { pointerEvents: 'none' } : undefined}
          />
        </div>
      </div>
    </div>
  );
});

MultipagePreviewComponent.displayName = 'MultipagePreview';

export const MultipagePreview = React.memo(MultipagePreviewComponent);
