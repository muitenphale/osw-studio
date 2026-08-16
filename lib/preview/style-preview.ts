import { MARKER_SELECTOR_TEMPLATE } from '@/lib/direct-edit/overrides-css';

/**
 * Reading an element's rendered style out of the preview frame.
 *
 * The host cannot reach into the frame's `contentDocument`, so anything derived from the live DOM —
 * `getComputedStyle` included — has to run inside the frame and be posted back. That means the
 * reader cannot be an imported module: it is interpolated into the script template literals in
 * `components/preview/multipage-preview.tsx` as text.
 *
 * It is authored here, as a constant, for the reason `STRIP_PROVENANCE_JS` and `SERIALIZE_TREE_JS`
 * are: the emitted text is the only thing that runs, and the tests can execute *this* string.
 * **No regex literals** — anything hand-written inside those template literals loses one level of
 * escaping before it is emitted, so `\s` arrives as a literal `s`. This file needs none.
 */

/**
 * Shorthand → the longhands a style control needs, and the single source both sides read.
 *
 * Shorthands resolve perfectly well in `getComputedStyle` — `padding` comes back as `"10px"`, in
 * jsdom and in Chrome alike — so this table does not exist to work around an empty value. It exists
 * because a control that edits one side needs that side's own number, and `"10px 12px"` is not four
 * numbers until something splits it. Splitting a shorthand string correctly means implementing the
 * CSS 1/2/3/4-value rules per property; asking for the longhands means the engine does it.
 *
 * Explicit rather than derived from a scratch element's `style.setProperty`, which was the obvious
 * shortcut: measured, that expands `padding` and `margin` into their longhands in jsdom but leaves
 * `border-radius`, `gap` and `inset` unexpanded. A `setProperty`-based expander therefore passes a
 * test written against `padding` alone and silently returns the shorthand for half this table.
 *
 * Anything absent here passes through untouched, so a longhand or a non-box property costs nothing.
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
 * The computed-value reader, as JavaScript source for injection into the preview iframe.
 *
 * `__oswReadComputed(el, properties)` returns a plain object keyed by the *expanded* property names.
 * Two deliberate choices in it:
 *
 * - A null element yields `{}`. The host is waiting on a reply, and silence is indistinguishable
 *   from a slow frame — an id that no longer resolves has to answer, not vanish.
 * - Every requested key is present, `''` when the engine has no value for it. Dropping empties would
 *   make the reply's shape depend on the engine: jsdom resolves `padding-top` but not
 *   `border-top-left-radius`, so a caller could not tell "no such property" from "not asked for".
 *
 * The longhand table is interpolated from {@link SHORTHAND_LONGHANDS} rather than restated, so there
 * is one list to keep correct.
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
`;

/**
 * The attribute that marks the transient `<style>` as ours.
 *
 * One source: the frame source below interpolates it, the locator recognises the element by it, and
 * anything that later has to exclude the element from what reaches the agent reads it from here.
 */
export const TRANSIENT_STYLE_ATTR = 'data-osw-style';

/**
 * The marker-selector builder, frame-side.
 *
 * A separate piece rather than a copy in each constant that needs it, so that emitting both does
 * not declare `__oswSelectorFor` twice. Not exported: {@link STYLE_PREVIEW_JS} carries it, and
 * {@link STYLE_LOCATOR_JS} is documented as requiring that constant before it, so no caller ever
 * needs this one on its own.
 *
 * The selector itself comes from {@link MARKER_SELECTOR_TEMPLATE}, the same pattern
 * `lib/direct-edit/overrides-css.ts` writes the file's blocks with. The doubling is not cosmetic:
 * `(0,2,0)` is what lets an override beat an ordinary compound selector on source order without
 * `!important`, so a second hand-written spelling here would silently change what wins.
 *
 * The id is validated to the same alphabet the CSS writer enforces before it is substituted. It
 * arrives over postMessage, so the frame is not the only writer, and a `"` in it would close the
 * attribute selector and let the rest be read as CSS of its own.
 */
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
 * The transient `<style>` — an uncommitted style change, live in the document.
 *
 * It exists because of how the committed path writes: a repeat edit rewrites `/overrides.css` with
 * `{ silent: true }` so the preview does **not** recompile, which means the live document never
 * receives the new rule. Without this element a second edit to the same element would appear to do
 * nothing at all.
 *
 * Three things about it are load-bearing:
 *
 * - **It is appended at the END of `<head>`.** `<link>` order does not beat a later `<style>`, so
 *   sitting last is the whole reason the transient wins over `/overrides.css`. Inserting before
 *   `head.firstChild` would lose the cascade silently, and `appendChild` on the element we are
 *   reusing moves it back to the end after a recompile has inserted a fresh `<link>` behind it.
 * - **It is replaced, never appended to.** The host sends the element's whole accumulated
 *   declaration block each time; `textContent =` is what makes the second send supersede the first
 *   rather than stack a second rule the first still shadows in reverse.
 * - **It is never re-injected on frame-ready.** A `srcdoc` reassignment mints a new document and
 *   takes the element with it, so clearing after a recompile is free — and putting it back would
 *   mask a later agent edit, since `/overrides.css` carries the rule by then.
 *
 * `css` is the block body, without braces. It is not re-validated here: `assertSafeDeclaration` in
 * `lib/direct-edit/overrides-css.ts` is the validator on the write path, and whatever the host is
 * previewing has to be a thing it could write.
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
   * The element and not just the sheet, because removing the rule is what the probe does and
   * `sheet.ownerNode` is `undefined` in jsdom — measured — so a sheet handle cannot be turned back
   * into something removable there.
   */
  element: Element;
  sheet: CSSStyleSheet;
  rule: CSSStyleRule;
  /** A VFS path where one is knowable, else `transient style` or `a stylesheet`. Never a blob id. */
  origin: string;
}

/**
 * The two lookups the probe needs — and they are two, not one.
 *
 * `__oswLocateOverrideRule(markerId)` finds **our** rule, so it can be removed and put back.
 * `__oswIdentifyWinner(el, property)` finds the **competing** declaration that beat us, so the
 * message can name it. Different scans, different answers; an implementation that only had the
 * first would have nothing to say about why an edit did not take.
 *
 * Both walk `<style>` and `<link>` **elements** rather than `document.styleSheets`. That is not a
 * stylistic preference: `sheet.ownerNode` is `undefined` in jsdom, so a `document.styleSheets` walk
 * cannot hand back the element the probe has to remove; and a sheet with no owning element (an
 * `@import`ed or adopted one) could not be removed anyway, so it is deliberately outside this
 * scan's world. Element order in the document is the same order `document.styleSheets` reports.
 *
 * Requires {@link STYLE_PREVIEW_JS} in scope before it: `__oswSelectorFor` and
 * `__oswTransientStyleElement` are both defined there, and both are the reason our own rule is
 * recognisable as ours.
 *
 * Known limits, both deliberate: rules nested in `@media` and friends are not walked, because
 * naming a rule that may not apply at the current viewport is worse than naming nothing; and
 * `:not()` / `:is()` arguments do not contribute to the specificity tiebreak.
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

function __oswIdentifyWinner(el, property) {
  if (!el || typeof property !== 'string' || property === '') return null;
  var best = null;
  // The element's own style attribute, as a candidate rather than an early return: it outranks
  // every normal rule whatever their specificity, but an !important rule still outranks it.
  var inline = '';
  try { inline = el.style ? el.style.getPropertyValue(property) : ''; } catch (e) { inline = ''; }
  if (inline !== '') {
    best = {
      important: el.style.getPropertyPriority(property) === 'important',
      specificity: Infinity,
      order: -1,
      origin: 'inline style'
    };
  }
  var entries = __oswStyleSheetEntries();
  var transientEl = __oswTransientStyleElement();
  var order = 0;
  for (var i = 0; i < entries.length; i++) {
    // Ours is not a competitor. Skipping it is what stops the probe reporting our own override as
    // the thing that beat our own override.
    if (entries[i].element === transientEl) continue;
    var rules = __oswRulesOf(entries[i].sheet);
    for (var j = 0; j < rules.length; j++) {
      var rule = rules[j];
      if (!rule || typeof rule.selectorText !== 'string' || !rule.style) continue;
      order++;
      if (rule.style.getPropertyValue(property) === '') continue;
      var matched = false;
      // An invalid or unsupported selector throws here rather than returning false.
      try { matched = el.matches(rule.selectorText); } catch (e) { matched = false; }
      if (!matched) continue;
      var candidate = {
        important: rule.style.getPropertyPriority(property) === 'important',
        specificity: __oswSpecificity(rule.selectorText),
        order: order,
        // Resolved here rather than per sheet: inverting the blob map is a scan of its own, and
        // most sheets contribute no candidate at all.
        origin: __oswSheetOrigin(entries[i])
      };
      if (__oswBeats(candidate, best)) best = candidate;
    }
  }
  return best === null ? null : best.origin;
}
`;

/**
 * Did the override actually take effect? — remove the rule, look, put it back.
 *
 * There is no way to ask the engine "is this declaration the one in force". `getComputedStyle`
 * reports the winner without naming it, and comparing the override's own text against the computed
 * value fails on every unit the engine normalises (`4px` vs `4px`, but `red` vs `rgb(255, 0, 0)`,
 * `50%` vs a resolved pixel length). So the question is asked by changing the document: lift our
 * rule out, read again, and see whether anything moved. Nothing moved means something else was
 * winning all along.
 *
 * **The mechanism is remove-and-reinsert of the owning ELEMENT**, and each half of that is forced:
 *
 * - `sheet.disabled = true` and `sheet.deleteRule(0)` are both **no-ops on the cascade in jsdom** —
 *   measured. A probe built on either reports "not lost" for everything in every unit test, which is
 *   indistinguishable from a probe that works.
 * - Reinsertion of a blob `<link>` restores synchronously with no refetch — also measured — so the
 *   post-recompile shape, where our rule lives in `/overrides.css` rather than the transient
 *   `<style>`, is safe to toggle. The `finally` is the load-bearing part: a probe that removes and
 *   forgets to put back has silently deleted the user's change.
 *
 * `__oswIdentifyWinner` is called **inside the removed window**, and that is not an implementation
 * detail. It skips the *transient* style only, exactly as its own contract says — but after a
 * recompile our rule is in `/overrides.css`, which it does not skip. Asking it who won while that
 * element is still in the document answers `/overrides.css`: our own override, named as the thing
 * that beat our own override.
 *
 * Requires {@link STYLE_QUERY_JS} (`__oswExpandProperties`) and {@link STYLE_LOCATOR_JS} in scope.
 * Properties are expanded the same way `style-query` expands them, so `lost` is keyed on the same
 * names the computed reply is — a control that asked about `padding` is told which *side* lost.
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

  var before = [];
  var i;
  for (i = 0; i < wanted.length; i++) {
    before.push(window.getComputedStyle(el).getPropertyValue(wanted[i]));
  }

  var parent = located.element.parentNode;
  // The node to insert before, so the element lands back in its own place rather than at the end of
  // <head> — where it would newly outrank sheets that had been beating it, which is a silent edit to
  // the page the probe is only supposed to be reading.
  var nextSibling = located.element.nextSibling;
  var lost = [];
  var winner = null;
  try {
    parent.removeChild(located.element);
    for (i = 0; i < wanted.length; i++) {
      // Unchanged with our rule gone means our rule was never what produced the value.
      if (window.getComputedStyle(el).getPropertyValue(wanted[i]) === before[i]) lost.push(wanted[i]);
    }
    for (i = 0; i < lost.length && winner === null; i++) {
      winner = __oswIdentifyWinner(el, lost[i]);
    }
  } finally {
    parent.insertBefore(located.element, nextSibling);
  }
  return { lost: lost, winner: winner };
}
`;
