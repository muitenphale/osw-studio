import { MARKER_SELECTOR_TEMPLATE } from '@/lib/direct-edit/overrides-css';

/** Style-reading scripts injected into the preview frame as source text. */

/**
 * Maps CSS shorthands to their longhands for `getComputedStyle` expansion.
 * Absent properties pass through untouched.
 */
export const SHORTHAND_LONGHANDS: Readonly<Record<string, readonly string[]>> = {
  margin: ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'],
  padding: ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'],
  inset: ['top', 'right', 'bottom', 'left'],
  gap: ['row-gap', 'column-gap'],
  'border-width': ['border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width'],
  'border-style': ['border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style'],
  'border-color': ['border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color'],
  'border-radius': [
    'border-top-left-radius',
    'border-top-right-radius',
    'border-bottom-right-radius',
    'border-bottom-left-radius',
  ],
};

/**
 * Computed-value reader injected into the preview iframe.
 *
 * `__oswReadComputed(el, properties)` returns values keyed by expanded property names (null element
 * yields `{}`; missing values are `''`). `__oswRootFontSize()` returns the document's root font
 * size for rem conversion -- read from the frame because the host has no id for `<html>`.
 */
export const STYLE_QUERY_JS = `
var __oswLonghands = ${JSON.stringify(SHORTHAND_LONGHANDS)};

function __oswExpandProperties(properties) {
  var out = [];
  var seen = Object.create(null);
  // Array.isArray, not a length check: a bare string has a length and would be walked one
  // character at a time, so 'padding' would ask the engine about 'p', 'a', 'd'...
  if (!Array.isArray(properties)) return out;
  for (var i = 0; i < properties.length; i++) {
    var property = properties[i];
    if (typeof property !== 'string' || property === '') continue;
    var expanded = Object.prototype.hasOwnProperty.call(__oswLonghands, property)
      ? __oswLonghands[property]
      : [property];
    for (var j = 0; j < expanded.length; j++) {
      if (seen[expanded[j]]) continue;
      seen[expanded[j]] = true;
      out.push(expanded[j]);
    }
  }
  return out;
}

function __oswReadComputed(el, properties) {
  var values = {};
  if (!el) return values;
  var computed = window.getComputedStyle(el);
  var wanted = __oswExpandProperties(properties);
  for (var i = 0; i < wanted.length; i++) {
    var value = computed.getPropertyValue(wanted[i]);
    values[wanted[i]] = value == null ? '' : String(value);
  }
  return values;
}

function __oswRootFontSize() {
  var root = document.documentElement;
  if (!root) return '';
  var value = window.getComputedStyle(root).getPropertyValue('font-size');
  return value == null ? '' : String(value);
}
`;

/**
 * The attribute that marks the transient `<style>` as ours.
 *
 * One source: the frame source below interpolates it, the locator recognises the element by it, and
 * anything that later has to exclude the element from what reaches the agent reads it from here.
 */
export const TRANSIENT_STYLE_ATTR = 'data-osw-style';

/** Shared selector template emitted once so multiple constants don't redeclare `__oswSelectorFor`. */
const SELECTOR_FOR_JS = `
var __oswSelectorTemplate = ${JSON.stringify(MARKER_SELECTOR_TEMPLATE)};

function __oswSafeMarkerId(markerId) {
  if (typeof markerId !== 'string' || markerId.length === 0) return false;
  for (var i = 0; i < markerId.length; i++) {
    var c = markerId.charAt(i);
    var ok = (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9')
      || c === '-' || c === '_';
    if (!ok) return false;
  }
  return true;
}

function __oswSelectorFor(markerId) {
  if (!__oswSafeMarkerId(markerId)) return null;
  // split/join, not replace: a replacement pattern in the id has no meaning here either way, and
  // this needs no second argument to say so.
  return __oswSelectorTemplate.split('{id}').join(markerId);
}
`;

/**
 * Applies a transient style rule in-frame so edits render before the file is written.
 * Appended last in `<head>` to win the cascade; replaced (not appended to) on each send;
 * never re-injected on frame-ready -- a `srcdoc` reassignment clears it naturally.
 */
export const STYLE_PREVIEW_JS = `${SELECTOR_FOR_JS}
var __oswTransientStyleAttr = ${JSON.stringify(TRANSIENT_STYLE_ATTR)};

function __oswTransientStyleElement() {
  return document.querySelector('style[' + __oswTransientStyleAttr + ']');
}

function __oswApplyStylePreview(markerId, css) {
  var existing = __oswTransientStyleElement();
  var selector = __oswSelectorFor(markerId);
  var blank = css == null || typeof css !== 'string' || css.trim() === '';
  if (blank || selector === null) {
    // Clearing is the null case AND every unusable input: leaving a stale block up would keep
    // showing an edit the host believes it has taken back.
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
    return null;
  }
  var head = document.head;
  if (!head) return null;
  var el = existing;
  if (!el) {
    el = document.createElement('style');
    el.setAttribute(__oswTransientStyleAttr, '1');
  }
  el.textContent = selector + ' { ' + css + ' }';
  head.appendChild(el);
  return el;
}
`;

/** Where the rule that carries a marker's override lives, and what to call the place. */
export interface OverrideRuleLocation {
  /**
   * The `<style>` or `<link>` the rule came from.
   *
   * The element and not just the sheet, because a `CSSStyleSheet` handle outlives its owning node:
   * the probe's gate is "our rule is *in the document*", and only the element answers that. Turning
   * a sheet back into its node is not an option either — `sheet.ownerNode` is `undefined` in jsdom,
   * measured, so that direction is unavailable exactly where the unit tests run.
   */
  element: Element;
  sheet: CSSStyleSheet;
  rule: CSSStyleRule;
  /** A VFS path where one is knowable, else `transient style` or `a stylesheet`. Never a blob id. */
  origin: string;
}

/**
 * Finds which CSS rule overrides the override (`__oswLocateOverrideRule`) and ranks every
 * declaration that reaches the element (`__oswRankDeclaration`).
 *
 * Requires {@link STYLE_PREVIEW_JS} in scope (uses `__oswSelectorFor`, `__oswTransientStyleElement`).
 *
 * Known limits: only `@media` grouping rules are walked (and only while matching);
 * `:not()`/`:is()` arguments do not contribute to specificity; UA defaults are not walked.
 */
export const STYLE_LOCATOR_JS = `
function __oswNormalizeSelectorText(text) {
  if (typeof text !== 'string') return '';
  var out = '';
  var pendingSpace = false;
  for (var i = 0; i < text.length; i++) {
    var c = text.charAt(i);
    // Everything at or below the space code unit is whitespace or a control character. Written as
    // a comparison rather than a set of escapes, which a template literal would eat one level of.
    if (c <= ' ') {
      if (out !== '') pendingSpace = true;
      continue;
    }
    if (pendingSpace) {
      out += ' ';
      pendingSpace = false;
    }
    out += c;
  }
  return out;
}

function __oswStyleSheetEntries() {
  var out = [];
  var nodes = document.querySelectorAll('style, link');
  for (var i = 0; i < nodes.length; i++) {
    var sheet = null;
    try { sheet = nodes[i].sheet; } catch (e) { sheet = null; }
    if (sheet) out.push({ element: nodes[i], sheet: sheet });
  }
  return out;
}

function __oswRulesOf(sheet) {
  // A cross-origin sheet throws on access. Nothing in the preview is cross-origin — a blob sheet
  // shares the parent's origin and srcdoc inherits it — but a user's own CDN <link> is not ours.
  try { return sheet.cssRules || []; } catch (e) { return []; }
}

function __oswResolveSheetOrigin(href, blobMap) {
  if (typeof href !== 'string' || href === '') return null;
  // The map is path -> blob URL, so naming the file means inverting it. Every preview stylesheet is
  // rewritten to a blob URL, which is why this is not optional: the raw href reads
  // 'blob:http://host/8c39ad3e-...', and a UUID in a message is the kind of message people learn
  // to ignore.
  if (blobMap && typeof blobMap === 'object') {
    for (var path in blobMap) {
      if (!Object.prototype.hasOwnProperty.call(blobMap, path)) continue;
      if (blobMap[path] === href) return path;
    }
  }
  // An unmapped blob URL names nothing a user has ever seen; a real URL does.
  if (href.indexOf('blob:') === 0) return null;
  return href;
}

function __oswSheetOrigin(entry) {
  var href = null;
  try { href = entry.sheet.href; } catch (e) { href = null; }
  var resolved = __oswResolveSheetOrigin(href, window.__oswVfsBlobUrls);
  return resolved === null ? 'a stylesheet' : resolved;
}

function __oswFindRuleBySelector(sheet, selector) {
  var rules = __oswRulesOf(sheet);
  var found = null;
  for (var i = 0; i < rules.length; i++) {
    var rule = rules[i];
    if (!rule || typeof rule.selectorText !== 'string' || !rule.style) continue;
    if (__oswNormalizeSelectorText(rule.selectorText) !== selector) continue;
    // The LAST match wins, here and in upsertDeclaration, for the same reason: duplicates of one
    // selector have equal specificity, so the later one is the one the user is looking at.
    found = rule;
  }
  return found;
}

function __oswLocateOverrideRule(markerId) {
  var selector = __oswSelectorFor(markerId);
  if (selector === null) return null;
  var entries = __oswStyleSheetEntries();
  var transientEl = __oswTransientStyleElement();
  var i;
  // The transient first, and by element: it is last in <head> and therefore the rule in force
  // whenever both it and /overrides.css carry the marker.
  for (i = 0; i < entries.length; i++) {
    if (entries[i].element !== transientEl) continue;
    var mine = __oswFindRuleBySelector(entries[i].sheet, selector);
    if (mine) {
      return { element: entries[i].element, sheet: entries[i].sheet, rule: mine, origin: 'transient style' };
    }
  }
  var best = null;
  for (i = 0; i < entries.length; i++) {
    if (entries[i].element === transientEl) continue;
    var rule = __oswFindRuleBySelector(entries[i].sheet, selector);
    if (!rule) continue;
    best = {
      element: entries[i].element,
      sheet: entries[i].sheet,
      rule: rule,
      origin: __oswSheetOrigin(entries[i])
    };
  }
  return best;
}

function __oswIsIdentStart(c) {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_' || c > '~';
}

function __oswSkipIdent(selector, i) {
  while (i < selector.length) {
    var c = selector.charAt(i);
    var ok = __oswIsIdentStart(c) || (c >= '0' && c <= '9') || c === '-';
    if (!ok) return i;
    i++;
  }
  return i;
}

function __oswSkipString(selector, i) {
  var quote = selector.charAt(i);
  i++;
  while (i < selector.length) {
    // 92 is the backslash. Spelled as a code unit because a literal one would need doubling twice
    // over to survive both this template literal and the one that emits it.
    if (selector.charCodeAt(i) === 92) { i += 2; continue; }
    if (selector.charAt(i) === quote) return i + 1;
    i++;
  }
  return i;
}

function __oswSkipTo(selector, i, close) {
  while (i < selector.length) {
    var c = selector.charAt(i);
    if (c === '"' || c === "'") { i = __oswSkipString(selector, i); continue; }
    if (c === close) return i + 1;
    i++;
  }
  return i;
}

function __oswSpecificity(selector) {
  var ids = 0;
  var classes = 0;
  var types = 0;
  var i = 0;
  while (i < selector.length) {
    var c = selector.charAt(i);
    if (c === '#') { ids++; i = __oswSkipIdent(selector, i + 1); continue; }
    if (c === '.') { classes++; i = __oswSkipIdent(selector, i + 1); continue; }
    if (c === '[') { classes++; i = __oswSkipTo(selector, i + 1, ']'); continue; }
    if (c === ':') {
      if (selector.charAt(i + 1) === ':') { types++; i = __oswSkipIdent(selector, i + 2); }
      else { classes++; i = __oswSkipIdent(selector, i + 1); }
      if (selector.charAt(i) === '(') i = __oswSkipTo(selector, i + 1, ')');
      continue;
    }
    if (__oswIsIdentStart(c)) { types++; i = __oswSkipIdent(selector, i); continue; }
    i++;
  }
  return ids * 10000 + classes * 100 + types;
}

function __oswBeats(candidate, best) {
  if (best === null) return true;
  if (candidate.important !== best.important) return candidate.important;
  if (candidate.specificity !== best.specificity) return candidate.specificity > best.specificity;
  return candidate.order >= best.order;
}

function __oswOriginOf(entry, transientEl) {
  return entry.element === transientEl ? 'transient style' : __oswSheetOrigin(entry);
}

function __oswGroupApplies(rule) {
  // See the "known limits" note above: @media only, and only while it matches right now. Anything
  // else answers false and its rules are left out of the ranking.
  var text = null;
  try { text = rule.media ? rule.media.mediaText : null; } catch (e) { text = null; }
  if (typeof text !== 'string' || text === '') return false;
  try { return window.matchMedia(text).matches; } catch (e) { return false; }
}

function __oswRankRules(el, property, ourSelector, rules, entry, transientEl, state) {
  for (var i = 0; i < rules.length; i++) {
    var rule = rules[i];
    if (!rule) continue;
    if (typeof rule.selectorText !== 'string' || !rule.style) {
      // A grouping rule — @media, @supports, @layer. Its children are ordinary style rules and
      // belong in the ranking whenever the group is in force.
      var nested = null;
      try { nested = rule.cssRules; } catch (e) { nested = null; }
      if (nested && nested.length > 0 && __oswGroupApplies(rule)) {
        __oswRankRules(el, property, ourSelector, nested, entry, transientEl, state);
      }
      continue;
    }
    // Counted before the two filters, so order is document order over every style rule and does
    // not shift as rules stop declaring the property being asked about.
    state.order++;
    if (rule.style.getPropertyValue(property) === '') continue;
    var matched = false;
    // An invalid or unsupported selector throws here rather than returning false.
    try { matched = el.matches(rule.selectorText); } catch (e) { matched = false; }
    if (!matched) continue;
    var candidate = {
      important: rule.style.getPropertyPriority(property) === 'important',
      specificity: __oswSpecificity(rule.selectorText),
      order: state.order,
      // Resolved here rather than per sheet: inverting the blob map is a scan of its own, and
      // most sheets contribute no candidate at all.
      origin: __oswOriginOf(entry, transientEl),
      // Ours by selector, not by sheet: the same doubled marker selector is in the transient
      // <style> before a recompile and in /overrides.css after one, and both are the override.
      // Nothing else writes that selector — it names one marker on one element — so a rule
      // carrying it is the override wherever it turns up, including a hand-edit of the file.
      ours: __oswNormalizeSelectorText(rule.selectorText) === ourSelector
    };
    if (__oswBeats(candidate, state.best)) state.best = candidate;
  }
}

function __oswRankDeclaration(el, property, ourSelector) {
  if (!el || typeof property !== 'string' || property === '') return null;
  var state = { order: 0, best: null };
  // The element's own style attribute, as a candidate rather than an early return: it outranks
  // every normal rule whatever their specificity, but an !important rule still outranks it.
  var inline = '';
  try { inline = el.style ? el.style.getPropertyValue(property) : ''; } catch (e) { inline = ''; }
  if (inline !== '') {
    state.best = {
      important: el.style.getPropertyPriority(property) === 'important',
      specificity: Infinity,
      order: -1,
      origin: 'inline style',
      ours: false
    };
  }
  var entries = __oswStyleSheetEntries();
  var transientEl = __oswTransientStyleElement();
  for (var i = 0; i < entries.length; i++) {
    __oswRankRules(
      el, property, ourSelector, __oswRulesOf(entries[i].sheet), entries[i], transientEl, state
    );
  }
  return state.best;
}
`;

/**
 * Compares declared vs computed to detect overridden declarations: ranks every declaration of
 * the property that reaches the element and checks whether the cascade winner is ours.
 *
 * Requires {@link STYLE_QUERY_JS} (`__oswExpandProperties`) and {@link STYLE_LOCATOR_JS} in scope.
 */
export const STYLE_PROBE_JS = `
function __oswProbeStyleLoss(el, markerId, properties) {
  var wanted = el ? __oswExpandProperties(properties) : [];
  if (wanted.length === 0) return { lost: [], winner: null };
  var located = __oswLocateOverrideRule(markerId);
  // Nothing of ours is in the document, so nothing of ours can have been beaten. Reporting every
  // requested property as lost here would light up the whole panel the first time a marker is
  // probed before its rule has been written.
  if (!located || !located.element || !located.element.parentNode) return { lost: [], winner: null };

  var ourSelector = __oswSelectorFor(markerId);
  var lost = [];
  var winner = null;
  for (var i = 0; i < wanted.length; i++) {
    var best = __oswRankDeclaration(el, wanted[i], ourSelector);
    // best === null: nothing reachable declares this longhand — not even ours, which happens when
    // the engine does not expand the shorthand we wrote under the name we are asking about. There
    // is no verdict to give, and "lost" would be a guess dressed as a measurement.
    if (best === null || best.ours) continue;
    lost.push(wanted[i]);
    if (winner === null) winner = best.origin;
  }
  return { lost: lost, winner: winner };
}
`;
