/**
 * The selection toolbar chrome, rendered inside the preview frame's shadow root.
 *
 * No regex literals and no backticks in anything emitted from here -- the constants are
 * interpolated into a template literal, and either would break it.
 */

import type { FocusContextPayload } from './types';

/**
 * What the toolbar's middle slot offers for this element.
 *
 * Three shapes, per the mockup: an image can be replaced, a leaf with text in it can be retyped, and
 * anything else gets no middle button at all rather than a disabled one.
 */
export type ElementKind = 'image' | 'text' | 'container';

/**
 * The kind of the element a payload describes.
 *
 * The host's half of a decision the frame also makes — `__oswToolbarKind` in {@link TOOLBAR_DOM_JS}
 * is the same three branches against the live element, and the two are kept in this one file so a
 * change to either is a change to a thing the reader can see both halves of.
 *
 * **`srcAttr` is not the image's `src`.** It is the raw `data-osw-src` provenance value,
 * `"<path>:<index>"`, and the image's own source is `attributes.src`. Nothing here reads either —
 * `tagName` alone says it is an image — but the distinction is why this function does not try.
 */
export function elementKind(payload: FocusContextPayload): ElementKind {
  if ((payload.tagName || '').toLowerCase() === 'img') return 'image';
  // The frame's answer, taken as given. Re-deriving it from `outerHTML` here would be parsing a
  // string to recover a fact the frame read straight off the element; absence is "not stated", which
  // is not a claim that the element has text.
  if (payload.textBearing) return 'text';
  return 'container';
}

/**
 * The attribute that marks the toolbar host, and the single hook every exclusion keys on.
 *
 * One spelling: the frame source below stamps it, and the consumers that must not see the toolbar —
 * the drop-target scan, the selector's hover and click, the block-context clone, and the screenshot
 * `onclone` — all read it from here.
 */
export const TOOLBAR_HOST_ATTR = 'data-osw-toolbar';

/**
 * Which side of the element the toolbar was placed on, as an attribute on the host.
 *
 * Exposed on the host rather than kept in frame-local state so the decision is observable from
 * outside the shadow root — a test can read it, and so can anyone debugging a live preview.
 */
export const TOOLBAR_PLACEMENT_ATTR = 'data-osw-toolbar-placement';

/**
 * Which action a toolbar button performs, as an attribute on the button.
 *
 * The button's class says how it looks and the label says how it reads; neither is what it *does*.
 * This is, so it is what the order and presence tests assert on — a restyle changes the classes and
 * a copy change moves the labels, and neither should turn a passing test red.
 */
export const TOOLBAR_ACTION_ATTR = 'data-osw-toolbar-action';

/**
 * The toolbar's rendered height, in CSS pixels.
 *
 * Load-bearing twice over, which is why it is one constant: it is the offset the host is lifted by
 * to sit *above* the element, and it is the threshold for deciding there is no room above. The CSS
 * below fixes the bar to exactly this height so the two cannot drift — a bar that renders taller
 * than the constant overlaps the element it is labelling.
 */
export const TOOLBAR_HEIGHT = 28;

/** Space between the toolbar and the element it is anchored to, in CSS pixels. */
export const TOOLBAR_GAP = 10;

/**
 * The namespace every colour the host hands the frame lives in.
 *
 * The frame writes these values straight into the host element's inline style, and they arrive over
 * `postMessage` — so the frame refuses anything outside this prefix rather than trusting the sender
 * to have sent only toolbar properties.
 */
export const TOOLBAR_THEME_PREFIX = '--osw-tb-';

/**
 * One colour the chrome reads, and where the host resolves it from.
 *
 * **Tailwind cannot reach inside the frame**: the preview is a different document with a different
 * stylesheet, and reading the host page's CSS variables from in there would read the *user project's*
 * variables, not the app's. So the app resolves its own tokens on its own `documentElement` and sends
 * the computed values across, where they are set as custom properties on the shadow host and
 * inherited by the chrome.
 *
 * The fallbacks are not decoration. `getComputedStyle` returns an empty string for a custom property
 * the document does not define — which is what happens before the stylesheet has applied, and in any
 * test — and an empty string written into `setProperty` silently removes the declaration, leaving the
 * chrome on the CSS-level fallback for one theme only.
 */
export interface ToolbarThemeToken {
  /** The custom property the shadow CSS reads. Always inside {@link TOOLBAR_THEME_PREFIX}. */
  prop: string;
  /** The app's design token, as named in `assets/globals.css`. */
  token: string;
  /** Used when `token` resolves to nothing, chosen by the resolved theme. */
  light: string;
  dark: string;
}

export const TOOLBAR_THEME_TOKENS: ToolbarThemeToken[] = [
  { prop: TOOLBAR_THEME_PREFIX + 'bg', token: '--popover', light: 'rgb(255, 255, 255)', dark: 'rgb(38, 38, 38)' },
  { prop: TOOLBAR_THEME_PREFIX + 'fg', token: '--popover-foreground', light: 'rgb(24, 24, 27)', dark: 'rgb(250, 250, 250)' },
  { prop: TOOLBAR_THEME_PREFIX + 'border', token: '--border', light: 'rgb(224, 224, 224)', dark: 'rgb(64, 64, 64)' },
  { prop: TOOLBAR_THEME_PREFIX + 'muted', token: '--muted-foreground', light: 'rgb(115, 115, 115)', dark: 'rgb(163, 163, 163)' },
  { prop: TOOLBAR_THEME_PREFIX + 'hover', token: '--accent', light: 'rgb(245, 240, 236)', dark: 'rgb(64, 52, 44)' },
];

/**
 * The colours to send the frame, resolved against the *app's* document.
 *
 * @param root  the element the app's tokens are defined on — `document.documentElement`.
 * @param theme the resolved theme name, used only to pick a fallback when a token is missing.
 */
export function resolveToolbarTheme(root: Element | null, theme?: string | null): Record<string, string> {
  const dark = theme === 'dark';
  const computed = root && typeof window !== 'undefined' && typeof window.getComputedStyle === 'function'
    ? window.getComputedStyle(root)
    : null;
  const colors: Record<string, string> = {};
  for (const entry of TOOLBAR_THEME_TOKENS) {
    const value = computed ? computed.getPropertyValue(entry.token).trim() : '';
    colors[entry.prop] = value || (dark ? entry.dark : entry.light);
  }
  return colors;
}

/**
 * The chrome's stylesheet, for the shadow root.
 *
 * Single-quoted string: interpolated into a template literal, so backticks in it would
 * terminate the outer literal.
 */
export const TOOLBAR_SHADOW_CSS = [
  ':host { all: initial; }',
  '.osw-toolbar {',
  '  position: relative;',
  '  box-sizing: border-box;',
  '  display: flex;',
  '  align-items: center;',
  '  gap: 2px;',
  '  height: ' + TOOLBAR_HEIGHT + 'px;',
  '  min-width: ' + TOOLBAR_HEIGHT + 'px;',
  '  padding: 3px;',
  '  border-radius: 8px;',
  '  border: 1px solid var(' + TOOLBAR_THEME_PREFIX + 'border, rgb(64, 64, 64));',
  '  background: var(' + TOOLBAR_THEME_PREFIX + 'bg, rgb(38, 38, 38));',
  '  color: var(' + TOOLBAR_THEME_PREFIX + 'fg, rgb(250, 250, 250));',
  '  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.35);',
  '  font-family: ui-sans-serif, system-ui, sans-serif;',
  '  line-height: 1;',
  '  white-space: nowrap;',
  '}',
  // The caret that ties the bar to its element. A rotated square showing two of its borders, so it
  // reads as a continuation of the bar's outline rather than a separate mark. Positioned from the
  // left rather than centred: the bar's width changes with the element's name and the available
  // actions, and a centred caret would drift along the element as those change.
  '.osw-toolbar::after {',
  '  content: "";',
  '  position: absolute;',
  '  left: 14px;',
  '  bottom: -5px;',
  '  width: 8px;',
  '  height: 8px;',
  '  background: var(' + TOOLBAR_THEME_PREFIX + 'bg, rgb(38, 38, 38));',
  '  border-right: 1px solid var(' + TOOLBAR_THEME_PREFIX + 'border, rgb(64, 64, 64));',
  '  border-bottom: 1px solid var(' + TOOLBAR_THEME_PREFIX + 'border, rgb(64, 64, 64));',
  '  transform: rotate(45deg);',
  '}',
  // Flipped below the element, the caret has to move to the top edge and show its *other* two
  // borders. The placement attribute lives on the host, which `:host()` can still match on from
  // inside the shadow root — so the frame sets one attribute and the stylesheet does the rest.
  ':host([' + TOOLBAR_PLACEMENT_ATTR + '="below"]) .osw-toolbar::after {',
  '  bottom: auto;',
  '  top: -5px;',
  '  border-right: 0;',
  '  border-bottom: 0;',
  '  border-left: 1px solid var(' + TOOLBAR_THEME_PREFIX + 'border, rgb(64, 64, 64));',
  '  border-top: 1px solid var(' + TOOLBAR_THEME_PREFIX + 'border, rgb(64, 64, 64));',
  '}',
  // The element's name, so the bar says what it is anchored to. Capped rather than wrapped: the bar
  // is one fixed row, and a long class name must not push the actions off the end of it. The rule
  // divides it from the actions — it names the subject, it is not one of the things you can press.
  '.osw-toolbar-name {',
  '  display: block;',
  '  max-width: 140px;',
  '  overflow: hidden;',
  '  text-overflow: ellipsis;',
  '  white-space: nowrap;',
  '  padding: 0 5px 0 3px;',
  '  margin-right: 2px;',
  '  border-right: 1px solid var(' + TOOLBAR_THEME_PREFIX + 'border, rgb(64, 64, 64));',
  '  color: var(' + TOOLBAR_THEME_PREFIX + 'muted, rgb(163, 163, 163));',
  '  font-size: 9px;',
  '  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;',
  '}',
  // Square, because every action is an icon. `font-family` is inherited rather than set so the
  // tooltip below picks up the bar's face; the button itself renders no text of its own.
  '.osw-toolbar-btn {',
  '  position: relative;',
  '  box-sizing: border-box;',
  '  display: inline-flex;',
  '  align-items: center;',
  '  justify-content: center;',
  '  height: 22px;',
  '  min-width: 22px;',
  '  padding: 0 5px;',
  '  margin: 0;',
  '  border: 0;',
  '  border-radius: 5px;',
  '  background: transparent;',
  '  color: var(' + TOOLBAR_THEME_PREFIX + 'muted, rgb(163, 163, 163));',
  '  font-family: inherit;',
  '  line-height: 1;',
  '  cursor: pointer;',
  '}',
  '.osw-toolbar-btn:hover {',
  '  background: var(' + TOOLBAR_THEME_PREFIX + 'hover, rgb(64, 52, 44));',
  '  color: var(' + TOOLBAR_THEME_PREFIX + 'fg, rgb(250, 250, 250));',
  '}',
  // Every action is an icon now, so every action needs a name on hover. Built from `aria-label` in
  // CSS rather than as a node: nothing to append, nothing to keep in step with the button's state,
  // and it cannot be forgotten for a button added later.
  //
  // The delay is what makes an icon-only bar bearable rather than twitchy — sweeping the pointer
  // across four buttons to reach the fifth should not flash four labels on the way.
  '.osw-toolbar-btn::after {',
  '  content: attr(aria-label);',
  '  position: absolute;',
  '  left: 50%;',
  '  bottom: calc(100% + 7px);',
  '  transform: translateX(-50%);',
  '  padding: 3px 6px;',
  '  border-radius: 4px;',
  '  border: 1px solid var(' + TOOLBAR_THEME_PREFIX + 'border, rgb(64, 64, 64));',
  '  background: var(' + TOOLBAR_THEME_PREFIX + 'bg, rgb(38, 38, 38));',
  '  color: var(' + TOOLBAR_THEME_PREFIX + 'fg, rgb(250, 250, 250));',
  '  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.30);',
  '  font-size: 10px;',
  '  font-weight: 500;',
  '  white-space: nowrap;',
  '  pointer-events: none;',
  '  opacity: 0;',
  '  transition: opacity 80ms ease 320ms;',
  '}',
  '.osw-toolbar-btn:hover::after {',
  '  opacity: 1;',
  '}',
  // The label goes on the far side of the bar from the element, so it never covers the thing the
  // button is about to act on. Same attribute the caret flips on.
  ':host([' + TOOLBAR_PLACEMENT_ATTR + '="below"]) .osw-toolbar-btn::after {',
  '  bottom: auto;',
  '  top: calc(100% + 7px);',
  '}',
  '.osw-toolbar-sep {',
  '  flex: none;',
  '  width: 1px;',
  '  height: 14px;',
  '  margin: 0 2px;',
  '  background: var(' + TOOLBAR_THEME_PREFIX + 'border, rgb(64, 64, 64));',
  '}',
  '.osw-toolbar-btn svg { display: block; width: 12px; height: 12px; }',
].join('\n');

/**
 * The toolbar, as JavaScript source for injection into the preview iframe.
 *
 * Positioned from the viewport, not the document, so it stays visible when the element
 * is near the edge.
 */
export const TOOLBAR_DOM_JS = `
var __oswToolbarCss = ${JSON.stringify(TOOLBAR_SHADOW_CSS)};
var __oswToolbarHostAttr = ${JSON.stringify(TOOLBAR_HOST_ATTR)};
var __oswToolbarPlacementAttr = ${JSON.stringify(TOOLBAR_PLACEMENT_ATTR)};
var __oswToolbarActionAttr = ${JSON.stringify(TOOLBAR_ACTION_ATTR)};
var __oswToolbarHeight = ${TOOLBAR_HEIGHT};
var __oswToolbarGap = ${TOOLBAR_GAP};
var __oswToolbarThemePrefix = ${JSON.stringify(TOOLBAR_THEME_PREFIX)};
var __oswToolbarSvgNs = 'http://www.w3.org/2000/svg';
// The Elements tree's transient id attribute. Read rather than minted here so a toolbar press names
// the element by the same handle every other node-keyed message uses.
var __oswToolbarNodeAttr = 'data-osw-node';

var __oswToolbarState = {
  host: null,
  shadow: null,
  bar: null,
  name: null,
  separator: null,
  slotText: null,
  slotImage: null,
  slot: null,
  tracked: null,
  observer: null,
  colors: null,
  // The side the bar was last placed on, as the scroll check's 'has the answer changed' baseline.
  // Read off state rather than off the host's placement attribute so the check does not depend on an
  // attribute a user script in the same document could have written to.
  side: null
};

// Written into the host's inline style, from a value that arrived over postMessage. The prefix check
// is why the frame does not have to trust the sender to have sent only toolbar properties: anything
// outside the toolbar's own namespace is dropped rather than set.
function __oswToolbarApplyTheme() {
  var host = __oswToolbarState.host;
  var colors = __oswToolbarState.colors;
  if (!host || !colors) return;
  var keys = Object.keys(colors);
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    if (key.indexOf(__oswToolbarThemePrefix) !== 0) continue;
    var value = colors[key];
    if (typeof value !== 'string' || value === '') continue;
    host.style.setProperty(key, value);
  }
}

// Kept even when there is no host yet: the app sends the colours on frame-ready, which is long
// before the first selection mounts anything for them to land on.
function __oswToolbarTheme(colors) {
  if (!colors || typeof colors !== 'object') return;
  __oswToolbarState.colors = colors;
  __oswToolbarApplyTheme();
}

// Icons are built as SVG nodes rather than assigned as innerHTML: the chrome sits inside the user's
// own document, and a markup string is the one place a future edit could smuggle something into it.
function __oswToolbarIcon(paths) {
  var svg = document.createElementNS(__oswToolbarSvgNs, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '12');
  svg.setAttribute('height', '12');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  for (var i = 0; i < paths.length; i++) {
    var path = document.createElementNS(__oswToolbarSvgNs, 'path');
    path.setAttribute('d', paths[i]);
    svg.appendChild(path);
  }
  return svg;
}

var __oswToolbarIncludeIcon = [
  'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  'M9 10h6',
  'M12 7v6'
];
var __oswToolbarDismissIcon = ['M18 6 6 18', 'M6 6l12 12'];
// Two sliders, which is what the Inspector's own controls look like. Circles are written as arc
// paths because __oswToolbarIcon builds <path> nodes only.
var __oswToolbarStyleIcon = [
  'M20 7h-9',
  'M14 17H5',
  'M20 17a3 3 0 1 1-6 0 3 3 0 1 1 6 0',
  'M10 7a3 3 0 1 1-6 0 3 3 0 1 1 6 0'
];
var __oswToolbarTextIcon = ['M4 7V4h16v3', 'M9 20h6', 'M12 4v16'];
var __oswToolbarImageIcon = [
  'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z',
  'M10 9.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 1 1 3 0',
  'M21 15l-5-5L5 21'
];

// Announce a hover so the host can show the consequence before it happens. Sent for the actions
// whose effect is not visible on the button: pressing Style rearranges the panels, and which panel
// closes to make room is not guessable from inside the frame. No nodeId, because the answer does not
// depend on which element is selected.
function __oswToolbarSendHover(action) {
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({ type: 'toolbar-hover', action: action }, '*');
  }
}

function __oswToolbarSend(action) {
  var el = __oswToolbarState.tracked;
  var nodeId = '';
  if (el) {
    // The tree's minter when it is in scope, so an element that has never been serialized still gets
    // an id the host can ask about. typeof rather than a truthiness test: an undeclared identifier
    // would throw a ReferenceError, and this runs inside a click handler in the user's document.
    if (typeof __oswNodeId === 'function') {
      nodeId = __oswNodeId(el);
    } else if (el.getAttribute) {
      nodeId = el.getAttribute(__oswToolbarNodeAttr) || '';
    }
  }
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({ type: 'toolbar-action', action: action, nodeId: nodeId }, '*');
  }
}

function __oswToolbarButton(className, title, action) {
  var button = document.createElement('button');
  button.setAttribute('type', 'button');
  button.setAttribute('class', className);
  // The action, on the element rather than only in the click closure. It is what the button *is*,
  // independent of how it happens to be styled, so it is the handle a test asserts order by — class
  // strings change with a restyle and say nothing about behaviour.
  button.setAttribute(__oswToolbarActionAttr, action);
  // The aria-label is both the accessible name and the tooltip's text, which the stylesheet reads
  // with attr() -- so there is one source for what a button is called. No title attribute: the
  // native tooltip cannot be styled or hurried, and leaving it on would show a second, slower copy
  // of the same words a moment after ours.
  button.setAttribute('aria-label', title);
  button.addEventListener('click', function(event) {
    event.preventDefault();
    __oswToolbarSend(action);
  });
  return button;
}

// What the bar calls the element. The same shape the Inspector's tree uses, so the two name the same
// element the same way. Split on a plain space rather than on whitespace: no regex may be authored in
// this module, because an authored escape collapses inside the template literal this text is
// interpolated into.
function __oswToolbarDescribe(el) {
  var name = el && el.tagName ? el.tagName.toLowerCase() : 'element';
  if (!el || !el.getAttribute) return name;
  var id = el.getAttribute('id');
  if (id) return name + '#' + id;
  var className = el.getAttribute('class');
  if (className) {
    var parts = className.split(' ');
    for (var i = 0; i < parts.length; i++) {
      if (parts[i]) return name + '.' + parts[i];
    }
  }
  return name;
}

function __oswToolbarSetName(el) {
  if (!__oswToolbarState.name) return;
  __oswToolbarState.name.textContent = __oswToolbarDescribe(el);
}

// Whether this element's content is one plain run of text: no element children, and something other
// than whitespace in it. Read off the live element with two property accesses — the host gets the
// answer on the selection payload (FocusContextPayload.textBearing) rather than re-parsing outerHTML
// for it, and this is the function that puts it there.
//
// String.trim rather than a whitespace regex, because no regex may be authored in this module: an
// escape written here collapses inside the template literal this text is interpolated into.
function __oswToolbarTextBearing(el) {
  if (!el || el.nodeType !== 1) return false;
  if (el.children && el.children.length > 0) return false;
  var text = el.textContent;
  if (typeof text !== 'string') return false;
  return text.trim().length > 0;
}

// The frame's half of elementKind() in this module. Both halves are three branches in the same order
// and the same answer for the same element; they are apart only because one runs against a live
// element inside the frame and the other against a payload in the host.
function __oswToolbarKind(el) {
  if (!el || !el.tagName) return 'container';
  if (el.tagName.toLowerCase() === 'img') return 'image';
  if (__oswToolbarTextBearing(el)) return 'text';
  return 'container';
}

// The kind-specific slot, swapped per selection.
//
// The buttons are built once and moved in and out of the bar rather than rebuilt, so their click
// handlers are bound exactly once — the same reason the host itself is reused. Taken *out* rather
// than hidden: the bar is a flex row and a display:none child still occupies a slot in
// bar.children, so a hidden button would make "a container has no middle button" true only for a
// reader who knows to check the style as well as the DOM.
function __oswToolbarSetSlot(el) {
  var state = __oswToolbarState;
  if (!state.bar || !state.separator) return;
  var kind = __oswToolbarKind(el);
  var next = null;
  if (kind === 'image') next = state.slotImage;
  else if (kind === 'text') next = state.slotText;
  if (state.slot === next) return;
  if (state.slot && state.slot.parentNode) state.slot.parentNode.removeChild(state.slot);
  state.slot = next;
  // Before the separator, which is what divides the actions that change the element from the ones
  // that act on the selection. The bar gets wider; the caret is positioned from its left edge for
  // exactly this reason and does not move.
  if (next) state.bar.insertBefore(next, state.separator);
}

function __oswToolbarBuild() {
  var host = document.createElement('div');
  host.setAttribute(__oswToolbarHostAttr, '1');
  host.style.position = 'absolute';
  host.style.top = '0px';
  host.style.left = '0px';
  host.style.margin = '0px';
  host.style.padding = '0px';
  host.style.zIndex = '2147483647';
  if (typeof host.attachShadow !== 'function') return null;
  var shadow = host.attachShadow({ mode: 'open' });
  var style = document.createElement('style');
  style.textContent = __oswToolbarCss;
  shadow.appendChild(style);
  var bar = document.createElement('div');
  bar.setAttribute('class', 'osw-toolbar');

  var name = document.createElement('span');
  name.setAttribute('class', 'osw-toolbar-name');
  bar.appendChild(name);

  var styleButton = __oswToolbarButton(
    'osw-toolbar-btn',
    'Style',
    'style'
  );
  styleButton.appendChild(__oswToolbarIcon(__oswToolbarStyleIcon));
  // Cleared on leave and on press alike: pressing it opens the panel, at which point a highlight
  // saying the panel is 'about to' close is describing something that already happened.
  styleButton.addEventListener('mouseenter', function() { __oswToolbarSendHover('style'); });
  styleButton.addEventListener('mouseleave', function() { __oswToolbarSendHover(null); });
  styleButton.addEventListener('click', function() { __oswToolbarSendHover(null); });
  bar.appendChild(styleButton);

  // The kind-specific slot — Edit text for a leaf with words in it, Replace image for an image,
  // nothing for a container. Built here and inserted per selection by __oswToolbarSetSlot, which is
  // what puts it between Style and the separator.
  var textButton = __oswToolbarButton('osw-toolbar-btn', 'Edit text', 'text');
  textButton.appendChild(__oswToolbarIcon(__oswToolbarTextIcon));
  var imageButton = __oswToolbarButton('osw-toolbar-btn', 'Replace image', 'replace');
  imageButton.appendChild(__oswToolbarIcon(__oswToolbarImageIcon));

  var separator = document.createElement('span');
  separator.setAttribute('class', 'osw-toolbar-sep');
  bar.appendChild(separator);

  var includeButton = __oswToolbarButton('osw-toolbar-btn', 'Add to next message', 'include');
  includeButton.appendChild(__oswToolbarIcon(__oswToolbarIncludeIcon));
  bar.appendChild(includeButton);

  var dismissButton = __oswToolbarButton('osw-toolbar-btn', 'Dismiss', 'dismiss');
  dismissButton.appendChild(__oswToolbarIcon(__oswToolbarDismissIcon));
  bar.appendChild(dismissButton);

  shadow.appendChild(bar);
  __oswToolbarState.host = host;
  __oswToolbarState.shadow = shadow;
  __oswToolbarState.bar = bar;
  __oswToolbarState.name = name;
  __oswToolbarState.separator = separator;
  __oswToolbarState.slotText = textButton;
  __oswToolbarState.slotImage = imageButton;
  __oswToolbarState.slot = null;
  __oswToolbarApplyTheme();
  return host;
}

// One host for the lifetime of the document. Reused rather than rebuilt so that selecting a second
// element replaces the first toolbar instead of leaving it behind — an accumulated host is invisible
// to every document walk that would otherwise reveal it, so the leak would be silent.
function __oswToolbarEnsure() {
  var host = __oswToolbarState.host || __oswToolbarBuild();
  if (!host) return null;
  if (host.parentNode !== document.body) document.body.appendChild(host);
  return host;
}

// The frame's own viewport height — the iframe's, not the app window's, since this runs inside the
// frame. Infinity when it cannot be measured, which makes 'there is room below' true and reproduces
// the answer the old document-relative rule gave for an element at the top of the page; a zero would
// instead claim there is room on neither side.
function __oswToolbarViewportHeight() {
  var height = window.innerHeight;
  if (typeof height !== 'number' || !(height > 0)) {
    height = document.documentElement ? document.documentElement.clientHeight : 0;
  }
  return typeof height === 'number' && height > 0 ? height : Infinity;
}

// Which side of the element the bar goes on. Room measured in the viewport, because the question is
// whether the user can see the bar — not whether the element is near the top of the document, which
// is what this used to ask and is how the bar ended up at -9px on a page scrolled to 500.
function __oswToolbarSide(rect) {
  var need = __oswToolbarHeight + __oswToolbarGap;
  var viewport = __oswToolbarViewportHeight();
  var above = rect.top;
  var below = viewport - (rect.top + rect.height);
  if (above >= need) return 'above';
  if (below >= need) return 'below';
  // Neither side fits: an element taller than the viewport, or one scrolled so both its edges are off
  // screen. No placement is fully visible, so take the side with more room. The raw, possibly
  // negative, values are compared deliberately — 20px short below beats 300px short above, where
  // clamping both at zero would tie and always answer 'above'.
  return above >= below ? 'above' : 'below';
}

function __oswToolbarPlace(el) {
  if (!el || typeof el.getBoundingClientRect !== 'function') return null;
  var rect = el.getBoundingClientRect();
  if (rect.width <= 0 && rect.height <= 0) {
    // Nothing to anchor to. Parking at 0,0 would put a toolbar in the corner of the page pointing at
    // an element the user cannot see. Checked before the host is mounted, so a selection that lands
    // on a hidden element never puts one in the document at all.
    __oswToolbarUnmount();
    return null;
  }
  var host = __oswToolbarEnsure();
  if (!host) return null;
  var docTop = rect.top + window.scrollY;
  var docLeft = rect.left + window.scrollX;
  var side = __oswToolbarSide(rect);
  var below = side === 'below';
  var top = below
    ? docTop + rect.height + __oswToolbarGap
    : docTop - __oswToolbarHeight - __oswToolbarGap;
  // Document coordinates, so this is what keeps the bar welded as the frame scrolls. Only the side
  // above was decided against the viewport, and only the side can therefore go stale.
  __oswToolbarState.side = side;
  host.style.top = top + 'px';
  host.style.left = docLeft + 'px';
  host.setAttribute(__oswToolbarPlacementAttr, below ? 'below' : 'above');
  // The same rect the bar was placed from, handed on rather than left to be measured again. An
  // image swap settles its layout in the gap between the two calls, so a second measurement here
  // positioned the outline from geometry the bar had never seen and the two drifted apart by however
  // far the element had moved.
  __oswToolbarAnnounce(el, rect);
  return host;
}

// The toolbar and the selection outline mark the same element, so they move together or they lie
// about which one is selected. This module owns the *when* — every place, every unmount, including
// the ones a ResizeObserver drives that nothing outside can see — and the surrounding script owns
// the outline itself. A hook rather than a direct call because the overlay lives in the navigation
// script and this file must not reach into it; optional because the toolbar has to work in tests
// that install no hook at all.
function __oswToolbarAnnounce(el, rect) {
  if (typeof __oswToolbarOnPlace === 'function') __oswToolbarOnPlace(el, rect || null);
}

// Detach without forgetting the element: a reposition that finds nothing to anchor to should leave
// the tracking intact, so a later resize or style-preview can bring the toolbar back.
function __oswToolbarUnmount() {
  var host = __oswToolbarState.host;
  if (host && host.parentNode) host.parentNode.removeChild(host);
  __oswToolbarAnnounce(null);
}

function __oswToolbarObserve(el) {
  var observer = __oswToolbarState.observer;
  if (!observer) return;
  try { observer.disconnect(); } catch (e) { /* already gone */ }
  if (el) {
    try { observer.observe(el); } catch (e) { /* not observable */ }
  }
}

function __oswToolbarTrack(el) {
  if (!el || el.nodeType !== 1) return null;
  __oswToolbarState.tracked = el;
  __oswToolbarObserve(el);
  var host = __oswToolbarPlace(el);
  // Only once there is something to write into. A refused placement leaves the previous name and
  // slot in the detached bar, which nobody can see, rather than re-dressing a toolbar that is not on
  // screen.
  if (host) {
    __oswToolbarSetName(el);
    __oswToolbarSetSlot(el);
  }
  return host;
}

function __oswToolbarRelease() {
  __oswToolbarState.tracked = null;
  __oswToolbarObserve(null);
  __oswToolbarUnmount();
}

function __oswToolbarReposition() {
  var el = __oswToolbarState.tracked;
  if (!el) return null;
  // An element edited away by the agent is still held by this closure, and its rect is all zeros —
  // which __oswToolbarPlace would refuse anyway, but releasing says so rather than leaving the frame
  // holding a detached node until the next selection.
  if (document.body && !document.body.contains(el)) {
    __oswToolbarRelease();
    return null;
  }
  return __oswToolbarPlace(el);
}

// Has the side the bar is on stopped fitting? Nothing else.
//
// This is the whole scroll-driven path, and it is deliberately not a reposition. The bar's position
// is absolute in document coordinates, so a scroll never moves it relative to its element and never
// needs one; what a scroll changes is how much room there is on each side of the element *in the
// viewport*, which is what the side was chosen from. So: re-ask the question, compare, and return
// unless the answer has flipped. A re-place is a threshold crossing, not a follow, and no scroll ever
// sends anything to the host.
//
// Guarded on the host being mounted, so a document with nothing selected pays one property read.
//
// Coalesced to one check per animation frame: a trackpad scroll fires scroll events far faster than
// the frame rate, and the check reads geometry, so an unthrottled listener would force a layout per
// event.
var __oswToolbarFitPending = false;

function __oswToolbarCheckFit() {
  __oswToolbarFitPending = false;
  // The mounted host is the condition that matters, and it is checked first: releasing a selection
  // takes the host out of the document, so without this a scroll would re-append a toolbar for a
  // selection that has been dismissed, or one whose document a recompile has already replaced.
  var host = __oswToolbarState.host;
  if (!host || host.parentNode !== document.body) return;
  var el = __oswToolbarState.tracked;
  if (!el || typeof el.getBoundingClientRect !== 'function') return;
  var rect = el.getBoundingClientRect();
  // A zero-size rect is not evidence about the placement — it is an element that has been hidden or
  // detached, which the ResizeObserver and the next reposition both handle. Scrolling is not the
  // event that should decide to take the toolbar down.
  if (rect.width <= 0 && rect.height <= 0) return;
  if (__oswToolbarSide(rect) === __oswToolbarState.side) return;
  __oswToolbarPlace(el);
}

function __oswToolbarOnScroll() {
  if (__oswToolbarFitPending) return;
  __oswToolbarFitPending = true;
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(__oswToolbarCheckFit);
  } else {
    __oswToolbarCheckFit();
  }
}

// Constructed once, at script init, and re-targeted per selection. It is the reason a style change
// from the Inspector does not leave the toolbar behind: the element resizes with no scroll, no
// message and no recompile, so nothing else would ever ask for a new position.
if (typeof ResizeObserver === 'function') {
  __oswToolbarState.observer = new ResizeObserver(function() {
    __oswToolbarReposition();
  });
}

// Registered once, at script init, for the same reason the observer is: registering per selection
// would stack one listener per click.
//
// Capture on the scroll listener, because scroll events do not bubble but do propagate down from
// window in the capture phase — so this is what sees an element scrolling inside an overflow
// container, not just the page. Passive, because it never calls preventDefault and must not make the
// frame's scrolling feel heavier.
//
// Resize as well as scroll: a viewport that got shorter takes away room the current side was chosen
// for, with no scroll and no element resize to signal it.
if (typeof window.addEventListener === 'function') {
  window.addEventListener('scroll', __oswToolbarOnScroll, { capture: true, passive: true });
  window.addEventListener('resize', __oswToolbarOnScroll, { passive: true });
}
`;
