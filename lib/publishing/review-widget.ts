/**
 * Review Comment Widget
 *
 * Comment bodies, display names and anything else that came back from the API are rendered with
 * `textContent`, never `innerHTML`. A comment is written by an untrusted reviewer and is rendered
 * back inside the customer's own page. The one `innerHTML` assignment here writes a constant
 * template with nothing interpolated into it — the chrome, before any data exists.
 *
 * Self-contained by construction: all CSS and JS is inline and there are no external references.
 * Published sites run on arbitrary hosts behind arbitrary network policies, so a blocked CDN would
 * take the page down with it. That constraint is asserted by a test which cannot tell a
 * protocol-relative reference from a `//` line comment, so the emitted script uses block comments
 * throughout.
 *
 * Everything renders inside a *closed* shadow root on a single host element. The customer's page is
 * arbitrary HTML written by someone else: an `!important` rule, an inherited `button {}` style, or
 * a `z-index: 2147483647` of their own would otherwise be visible defects in a client's review
 * session, and an id collision would silently bind the widget's handlers to their element. The
 * shadow boundary removes all of that structurally rather than by naming things carefully.
 *
 * The host is armoured with inline `!important` declarations because it is the one part of the
 * widget still in the light DOM, and inline `!important` is the only thing a customer stylesheet
 * cannot outrank.
 *
 * The host is appended as the last child of <body>, so it sits after everything already on the page
 * and shifts none of it. It is counted like any other element when selectors are generated, which
 * is what keeps them correct for whatever the page appends to <body> after the widget has mounted.
 *
 * The bar sits at the bottom. A top bar would cover the customer's own `position: fixed` nav on the
 * review copy — unreadable and unclickable, and that nav is usually what the reviewer wants to
 * comment on. Reserving space with `html { padding-top }` is worse still: it changes the layout
 * under review.
 *
 * Nothing in the customer's DOM is ever mutated. Hover outlines and pins are absolutely positioned
 * overlays inside the shadow tree, placed from `getBoundingClientRect()`. The layout being reviewed
 * has to be exactly the layout that gets published.
 */

import { reviewApiBase } from '../review/api-base';
import { REVIEW_RUNTIME_JS } from '../review/widget-runtime';
import { escapeHtml } from './escape-html';

/**
 * Distinctive string present in the emitted markup. Tests look for exactly this.
 */
export const REVIEW_WIDGET_MARKER = 'data-osw-review-widget';

/**
 * A JavaScript string literal safe to emit inside a `<script>` element.
 *
 * `JSON.stringify` alone is not enough: it leaves `<` intact, so a value containing a closing script
 * tag would end the element early and the remainder would parse as markup.
 */
function jsString(value: string): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
}

/**
 * Layout the customer's stylesheet must not be able to reach.
 *
 * `all: initial` comes first so the host starts from a known state — it also stops the customer's
 * font and colour inheriting into the shadow tree — and the declarations after it re-establish the
 * few properties the overlay needs. The layer inside the shadow root is what actually gets
 * positioned; the host is only a full-viewport, click-through anchor for it.
 */
const HOST_STYLE = [
  'all:initial!important',
  'position:fixed!important',
  'left:0!important',
  'top:0!important',
  'width:100%!important',
  'height:100%!important',
  'margin:0!important',
  'padding:0!important',
  'border:0!important',
  'z-index:2147483647!important',
  'pointer-events:none!important',
  'display:block!important',
  'opacity:1!important',
  'visibility:visible!important',
  'transform:none!important',
  'filter:none!important',
  'clip-path:none!important',
  'contain:none!important',
  'max-width:none!important',
  'max-height:none!important',
].join(';');

const WIDGET_CSS = `
:host { all: initial; }
*, *::before, *::after { box-sizing: border-box; }
button, input, textarea { font: inherit; color: inherit; margin: 0; }

.layer {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, system-ui, sans-serif;
  font-size: 13px;
  line-height: 1.5;
  color: #252525;
  text-align: left;
  font-weight: 400;
  letter-spacing: normal;
  -webkit-font-smoothing: antialiased;
}

.bar {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: #1c1c1c;
  color: #f7f7f7;
  font-size: 12.5px;
  pointer-events: auto;
  box-shadow: 0 -1px 8px rgba(0,0,0,0.28);
}
.bar .mark {
  width: 18px; height: 18px; border-radius: 5px; background: #e07a3f;
  display: grid; place-items: center; font-size: 10px; font-weight: 800; color: #fff; flex: none;
}
.bar .name { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 30%; }
.bar .sep { opacity: 0.35; }
.bar .note { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bar .tools { margin-left: auto; display: flex; align-items: center; gap: 6px; flex: none; }

.tog {
  font-size: 12px; font-weight: 600; padding: 4px 12px; border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.18); background: transparent; color: inherit;
  cursor: pointer; white-space: nowrap;
}
.tog:hover { background: rgba(255,255,255,0.08); }
.tog[aria-pressed="true"], .tog[aria-expanded="true"] {
  background: rgba(224,122,63,0.25); border-color: rgba(224,122,63,0.55); color: #f3b183;
}
.tog[disabled] { opacity: 0.45; cursor: default; }

.outline {
  position: absolute; border: 2px solid #e07a3f; border-radius: 6px;
  background: rgba(224,122,63,0.12); pointer-events: none; display: none;
}
.outline.on { display: block; }

.pin {
  position: absolute; width: 24px; height: 24px; border-radius: 50% 50% 50% 3px;
  background: #e07a3f; color: #fff; font-size: 11px; font-weight: 700;
  display: grid; place-items: center; cursor: pointer; pointer-events: auto;
  box-shadow: 0 2px 6px rgba(0,0,0,0.28); border: 0; padding: 0;
}
.pin.res { background: #16a34a; }

.pop {
  position: absolute; width: 280px; max-width: calc(100vw - 24px);
  background: #fff; border: 1px solid #e0e0e0; border-radius: 14px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.18); padding: 12px; pointer-events: auto;
}
.pop .anch {
  font-size: 11px; color: #737373; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  margin-bottom: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.pop .head { font-size: 13px; font-weight: 600; margin-bottom: 3px; }
.pop textarea {
  font-size: 13px; width: 100%; min-height: 68px; resize: vertical;
  border: 1px solid #e0e0e0; border-radius: 10px; padding: 8px; background: transparent;
}
.pop .foot { display: flex; gap: 6px; margin-top: 8px; align-items: center; }
.pop .as { margin-left: auto; font-size: 11px; color: #737373; }
.pop .as b { color: #252525; font-weight: 600; }

.inp {
  width: 100%; font-size: 13px; padding: 6px 9px; border: 1px solid #e0e0e0;
  border-radius: 9px; background: transparent; margin-bottom: 8px;
}
.hint { font-size: 11.5px; color: #737373; margin-bottom: 9px; line-height: 1.45; }
.err { font-size: 11.5px; color: #b3261e; margin-top: 7px; }

.btn {
  font-size: 12px; font-weight: 500; padding: 5px 12px; border-radius: 999px;
  border: 1px solid #e0e0e0; background: #fff; color: #252525; cursor: pointer; white-space: nowrap;
}
.btn:hover { background: #f5f5f5; }
.btn.accent { background: rgba(224,122,63,0.15); color: #b4551f; border-color: rgba(224,122,63,0.4); }
.btn.ghost { border-color: transparent; background: transparent; color: #737373; }
.btn[disabled] { opacity: 0.5; cursor: default; }

.drawer {
  position: absolute; top: 0; right: 0; bottom: 36px; width: 330px;
  max-width: calc(100vw - 12px); background: #fff; border-left: 1px solid #e0e0e0;
  display: flex; flex-direction: column; pointer-events: auto;
  box-shadow: -4px 0 20px rgba(0,0,0,0.1);
}
.drawer[hidden] { display: none; }
.dh {
  display: flex; align-items: center; gap: 8px; padding: 10px 12px;
  border-bottom: 1px solid #e0e0e0; background: #f7f7f7;
}
.dh .t { font-size: 13px; font-weight: 600; }
.icb {
  border: 0; background: transparent; color: #737373; cursor: pointer; font-size: 16px;
  line-height: 1; padding: 2px 4px; border-radius: 6px;
}
.icb:hover { background: #ececec; }

.filters { display: flex; gap: 4px; padding: 8px 12px; border-bottom: 1px solid #e0e0e0; flex-wrap: wrap; }
.chip {
  font-size: 11.5px; font-weight: 600; padding: 3px 10px; border-radius: 999px;
  border: 1px solid #e0e0e0; background: transparent; color: #737373; cursor: pointer;
}
.chip[aria-selected="true"] { background: rgba(224,122,63,0.15); color: #b4551f; border-color: rgba(224,122,63,0.4); }

.clist { overflow-y: auto; flex: 1; }
.empty { padding: 18px 12px; font-size: 12px; color: #737373; }
.citem { padding: 11px 12px; border-bottom: 1px solid #e0e0e0; display: flex; gap: 9px; }
.citem.focus { background: rgba(224,122,63,0.07); }
.citem .num {
  width: 19px; height: 19px; border-radius: 50%; background: rgba(224,122,63,0.15);
  color: #b4551f; font-size: 10.5px; font-weight: 700; display: grid; place-items: center;
  flex: none; margin-top: 1px;
}
.citem .num.res { background: rgba(22,163,74,0.15); color: #16a34a; }
.citem .num.un { background: #ececec; color: #737373; }
.citem .b { min-width: 0; flex: 1; }
.citem .txt { font-size: 12.5px; margin-bottom: 3px; overflow-wrap: anywhere; }
.citem .m { font-size: 11px; color: #737373; display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.citem .m + .m { margin-top: 3px; }
.snip {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10.5px; color: #737373;
  background: #f2f2f2; border-radius: 5px; padding: 1px 5px; max-width: 100%;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.who { display: inline-flex; align-items: center; gap: 5px; }
.who b { color: #252525; font-weight: 600; }
.dot { width: 8px; height: 8px; border-radius: 50%; flex: none; display: inline-block; }
.badge {
  display: inline-flex; align-items: center; font-size: 10px; font-weight: 600;
  padding: 1px 7px; border-radius: 999px; border: 1px solid #e0e0e0; color: #737373; background: #fff;
}
.badge.open { color: #b4551f; border-color: rgba(224,122,63,0.4); background: rgba(224,122,63,0.15); }
.badge.done { color: #16a34a; border-color: rgba(22,163,74,0.4); background: rgba(22,163,74,0.14); }
.badge.un { color: #8a6d3b; border-color: rgba(180,133,0,0.4); background: rgba(180,133,0,0.12); }
.reply { margin-left: 10px; border-left: 2px solid #e0e0e0; padding-left: 9px; margin-top: 7px; }
.reply .txt { font-size: 12px; }
.rbox { display: flex; gap: 5px; margin-top: 7px; }
.rbox .inp { margin: 0; font-size: 12px; padding: 5px 8px; }
.link { border: 0; background: transparent; color: #b4551f; font-size: 11px; font-weight: 600; cursor: pointer; padding: 0; }

.me {
  border-top: 1px solid #e0e0e0; padding: 9px 12px; display: flex; align-items: center;
  gap: 7px; font-size: 12px;
}
.me .mechange { margin-left: auto; }

@media (max-width: 640px) {
  .bar { font-size: 12px; gap: 7px; padding: 7px 9px; }
  /* Branding and the deployment name go before the warning does: "not live" is the reason the
     bar exists, and it has to survive to the narrowest phone intact rather than ellipsised. */
  .bar .mark { display: none; }
  .bar .name { display: none; }
  .bar .sep { display: none; }
  .drawer { width: 100%; max-width: 100%; }
}
`.trim();

/**
 * The static chrome. Nothing is interpolated into this — it is assigned before any comment, name or
 * API response exists, and every one of those is written with `textContent` afterwards.
 */
const WIDGET_MARKUP = `
<div class="layer" part="layer">
  <div class="outline"></div>
  <div class="pins"></div>
  <aside class="drawer" hidden aria-label="Review comments">
    <div class="dh">
      <span class="t">Comments</span>
      <span class="badge dcount">0</span>
      <button class="icb dclose" type="button" aria-label="Close comments">&times;</button>
    </div>
    <div class="filters" role="group" aria-label="Filter comments">
      <button class="chip" type="button" data-filter="all" aria-selected="true">All</button>
      <button class="chip" type="button" data-filter="open" aria-selected="false">Open</button>
      <button class="chip" type="button" data-filter="resolved" aria-selected="false">Resolved</button>
      <button class="chip" type="button" data-filter="page" aria-selected="false">This page</button>
    </div>
    <div class="clist"></div>
    <div class="me">
      <span class="dot medot"></span>
      <span class="metext"></span>
      <button class="btn ghost mechange" type="button">Change</button>
    </div>
  </aside>
  <div class="bar" role="region" aria-label="Review mode">
    <span class="mark">O</span>
    <span class="name"></span>
    <span class="sep">&middot;</span>
    <span class="note">Review copy, not live</span>
    <span class="tools">
      <button class="tog toggle" type="button" aria-pressed="false">Commenting off</button>
      <button class="tog count" type="button" aria-expanded="false">0 comments</button>
    </span>
  </div>
</div>
`.trim();

/**
 * Generate the review widget for a deployment.
 */
export function generateReviewWidget(deploymentId: string): string {
  return `
<div ${REVIEW_WIDGET_MARKER}="${escapeHtml(deploymentId)}" style="${HOST_STYLE}"></div>
<script>
(function () {
  'use strict';

  var DEPLOYMENT_ID = ${jsString(deploymentId)};
  /* Interpolated rather than built here, so this and the studio's review tab cannot drift from
     the routes; see lib/review/api-base.ts for why it sits under the review prefix. */
  var API = ${jsString(reviewApiBase(deploymentId))};
  var TEAM_COLOR = '#3f7ae0';

  /* Scoped through the marker rather than an id: the customer's page may own any id it likes. */
  var host = document.querySelector('[${REVIEW_WIDGET_MARKER}]');
  if (!host || !document.body) return;

  /* Last child of <body>, so mounting shifts the position of nothing already on the page. */
  if (document.body.lastElementChild !== host) document.body.appendChild(host);

  /* Closed: the page cannot reach in and restyle or rewrite the widget through .shadowRoot. */
  var root = host.attachShadow({ mode: 'closed' });
  var style = document.createElement('style');
  style.textContent = ${jsString(WIDGET_CSS)};
  root.appendChild(style);
  var chrome = document.createElement('div');
  chrome.innerHTML = ${jsString(WIDGET_MARKUP)};
  root.appendChild(chrome.firstElementChild);

${REVIEW_RUNTIME_JS.split('\n').map(line => (line ? '  ' + line : line)).join('\n')}

  var layer = root.querySelector('.layer');
  var bar = root.querySelector('.bar');
  var outline = root.querySelector('.outline');
  var pins = root.querySelector('.pins');
  var drawer = root.querySelector('.drawer');
  var clist = root.querySelector('.clist');
  var toggle = root.querySelector('.toggle');
  var countBtn = root.querySelector('.count');

  var state = {
    ready: false,
    commenting: false,
    drawerOpen: false,
    filter: 'all',
    comments: [],
    threads: [],
    participants: {},
    viewer: null,
    hovered: null,
    focusThread: null,
    pop: null
  };

  root.querySelector('.name').textContent = DEPLOYMENT_ID;

  function pagePath() {
    return oswPagePath(window.location.pathname, DEPLOYMENT_ID);
  }

  /*
   * A stable colour per participant, derived from the server-minted id rather than the name, so two
   * clients who both type "Priya" are visibly two people.
   */
  function colorFor(participantId, isTeam) {
    if (isTeam) return TEAM_COLOR;
    var hash = 0;
    var text = participantId || '';
    for (var i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) % 360;
    return 'hsl(' + hash + ', 62%, 47%)';
  }

  function request(path, options) {
    var init = options || {};
    init.credentials = 'same-origin';
    if (init.body) init.headers = { 'Content-Type': 'application/json' };
    return fetch(API + path, init).then(function (response) {
      return response
        .json()
        .catch(function () { return {}; })
        .then(function (data) {
          if (!response.ok) throw new Error((data && data.error) || 'Request failed');
          return data;
        });
    });
  }

  /* ---------------------------------------------------------------- data */

  function ingest(data) {
    state.comments = (data && data.comments) || [];
    state.threads = oswBuildThreads(state.comments);
    state.viewer = (data && data.viewer) || state.viewer;

    var list = (data && data.participants) || [];
    for (var i = 0; i < list.length; i++) state.participants[list[i].id] = list[i];
  }

  function addComment(comment) {
    state.comments.push(comment);
    state.threads = oswBuildThreads(state.comments);
  }

  function replaceComment(comment) {
    for (var i = 0; i < state.comments.length; i++) {
      if (state.comments[i].id === comment.id) state.comments[i] = comment;
    }
    state.threads = oswBuildThreads(state.comments);
  }

  function viewerParticipant() {
    return state.viewer ? state.participants[state.viewer.participant_id] : null;
  }

  /* A client is asked for a name once, on their first comment; a team member never is. */
  function needsName() {
    if (!state.viewer) return false;
    if (state.viewer.is_team) return false;
    return !viewerParticipant();
  }

  function viewerName() {
    var participant = viewerParticipant();
    if (participant && participant.display_name) return participant.display_name;
    return state.viewer && state.viewer.is_team ? 'Team' : 'Guest';
  }

  /* ------------------------------------------------------------ geometry */

  /*
   * Align the overlay layer with the viewport.
   *
   * A fixed-position host resolves against the body instead of the viewport when the page
   * puts a transform, filter or containment on <html> or <body> — a real thing to find on a
   * customer's site and, untreated, one that leaves the bar scrolling away mid-page. Rather than
   * enumerate the properties that cause it, the layer measures where it actually landed and
   * translates itself back, which handles any cause that only displaces it.
   *
   * A scaling ancestor is not handled. The corrective translate is scaled along with everything
   * else, so it lands short and repeating it does not converge; and the scale would equally throw
   * off the pin and outline positions, which are viewport pixels written into this layer. Covering
   * it means counter-scaling the layer, not adjusting this translate. Left alone because the
   * failure is visible on sight rather than silent, a scale on <html>/<body> is rare, and the
   * correction cannot be verified without laying the page out in a real browser.
   */
  function syncLayer() {
    layer.style.transform = 'none';
    layer.style.width = window.innerWidth + 'px';
    layer.style.height = window.innerHeight + 'px';

    var rect = layer.getBoundingClientRect();
    if (rect.left !== 0 || rect.top !== 0) {
      layer.style.transform = 'translate(' + -rect.left + 'px, ' + -rect.top + 'px)';
    }
  }

  function visible(rect) {
    if (rect.width === 0 && rect.height === 0) return false;
    return rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth;
  }

  function placeOutline(element) {
    if (!element) {
      outline.classList.remove('on');
      return;
    }
    var rect = element.getBoundingClientRect();
    if (!visible(rect)) {
      outline.classList.remove('on');
      return;
    }
    outline.style.left = rect.left + 'px';
    outline.style.top = rect.top + 'px';
    outline.style.width = rect.width + 'px';
    outline.style.height = rect.height + 'px';
    outline.classList.add('on');
  }

  /* Pins are rebuilt from the threads, then positioned; both halves run on every reposition so a
     comment whose element has just gone missing loses its pin rather than keeping a stale one. */
  function renderPins() {
    while (pins.firstChild) pins.removeChild(pins.firstChild);
    if (!state.ready) return;

    for (var i = 0; i < state.threads.length; i++) {
      var thread = state.threads[i];
      if (thread.comment.page_path !== pagePath()) continue;

      var anchor = oswResolveAnchor(thread.comment.selector, host);
      if (!anchor.anchored) continue;

      var pin = document.createElement('button');
      pin.type = 'button';
      pin.className = 'pin' + (thread.comment.status === 'resolved' ? ' res' : '');
      pin.textContent = String(thread.number);
      pin.setAttribute('aria-label', 'Comment ' + thread.number);
      pin.dataset.thread = thread.id;
      pins.appendChild(pin);
      positionPin(pin, anchor.element);
    }
  }

  function positionPin(pin, element) {
    var rect = element.getBoundingClientRect();
    if (!visible(rect)) {
      pin.style.display = 'none';
      return;
    }
    pin.style.display = 'grid';
    pin.style.left = Math.max(2, Math.min(window.innerWidth - 26, rect.left - 8)) + 'px';
    pin.style.top = Math.max(2, Math.min(window.innerHeight - 46, rect.top - 8)) + 'px';
  }

  function repositionPins() {
    var nodes = pins.children;
    for (var i = 0; i < nodes.length; i++) {
      var thread = threadById(nodes[i].dataset.thread);
      if (!thread) continue;
      var anchor = oswResolveAnchor(thread.comment.selector, host);
      if (!anchor.anchored) {
        nodes[i].style.display = 'none';
        continue;
      }
      positionPin(nodes[i], anchor.element);
    }
  }

  function placePopover() {
    if (!state.pop) return;
    var popover = state.pop.node;
    var element = state.pop.element;

    if (!element) {
      popover.style.left = Math.max(12, (window.innerWidth - popover.offsetWidth) / 2) + 'px';
      popover.style.top = Math.max(12, (window.innerHeight - popover.offsetHeight) / 2) + 'px';
      return;
    }

    var rect = element.getBoundingClientRect();
    var width = popover.offsetWidth || 280;
    var height = popover.offsetHeight || 180;
    var left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
    var top = rect.bottom + 10;
    if (top + height > window.innerHeight - 48) top = Math.max(8, rect.top - height - 10);
    popover.style.left = left + 'px';
    popover.style.top = Math.max(8, top) + 'px';
  }

  var frame = null;
  function schedule() {
    if (frame !== null) return;
    frame = window.requestAnimationFrame(function () {
      frame = null;
      syncLayer();
      repositionPins();
      placePopover();
      if (state.commenting && state.hovered) placeOutline(state.hovered);
    });
  }

  /* -------------------------------------------------------------- render */

  function threadById(id) {
    for (var i = 0; i < state.threads.length; i++) {
      if (state.threads[i].id === id) return state.threads[i];
    }
    return null;
  }

  function timeAgo(iso) {
    var then = Date.parse(iso);
    if (isNaN(then)) return '';
    var seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return Math.round(seconds / 60) + 'm ago';
    if (seconds < 86400) return Math.round(seconds / 3600) + 'h ago';
    return Math.round(seconds / 86400) + 'd ago';
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    /* textContent, always: every caller of this passes a comment body or a display name. */
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function authorRow(comment) {
    var row = el('div', 'm');
    var who = el('span', 'who');
    var dot = el('span', 'dot');
    dot.style.background = colorFor(comment.participant_id, comment.is_team);
    who.appendChild(dot);
    who.appendChild(el('b', null, comment.author_name));
    if (comment.is_team) who.appendChild(el('span', 'badge', 'team'));
    row.appendChild(who);
    row.appendChild(el('span', null, timeAgo(comment.created_at)));
    return row;
  }

  function renderThread(thread) {
    var anchored = thread.comment.page_path !== pagePath()
      ? true
      : oswResolveAnchor(thread.comment.selector, host).anchored;
    var resolved = thread.comment.status === 'resolved';

    var item = el('div', 'citem' + (state.focusThread === thread.id ? ' focus' : ''));
    var num = el('span', 'num' + (resolved ? ' res' : anchored ? '' : ' un'), String(thread.number));
    item.appendChild(num);

    var body = el('div', 'b');
    body.appendChild(el('div', 'txt', thread.comment.body));

    var locationRow = el('div', 'm');
    locationRow.appendChild(
      el('span', 'snip', thread.comment.page_path + (thread.comment.selector ? ' \\u00b7 ' + thread.comment.selector : ''))
    );
    body.appendChild(locationRow);

    var meta = authorRow(thread.comment);
    meta.appendChild(el('span', 'badge ' + (resolved ? 'done' : 'open'), resolved ? 'Resolved' : 'Open'));
    if (!anchored) {
      /* Marked, never re-pinned: see oswResolveAnchor. */
      meta.appendChild(el('span', 'badge un', 'Element moved'));
    }

    /* Resolve is a team verb; a client closing their own feedback would take it out of the queue. */
    if (state.viewer && state.viewer.is_team) {
      var action = el('button', 'link', resolved ? 'Reopen' : 'Resolve');
      action.type = 'button';
      action.dataset.resolve = thread.id;
      action.dataset.status = resolved ? 'open' : 'resolved';
      meta.appendChild(action);
    }
    body.appendChild(meta);

    for (var i = 0; i < thread.replies.length; i++) {
      var reply = el('div', 'reply');
      reply.appendChild(el('div', 'txt', thread.replies[i].body));
      reply.appendChild(authorRow(thread.replies[i]));
      body.appendChild(reply);
    }

    var box = el('div', 'rbox');
    var input = el('input', 'inp');
    input.placeholder = 'Reply' + '\\u2026';
    input.dataset.reply = thread.id;
    var send = el('button', 'btn accent', 'Send');
    send.type = 'button';
    send.dataset.sendReply = thread.id;
    box.appendChild(input);
    box.appendChild(send);
    body.appendChild(box);

    item.appendChild(body);
    return item;
  }

  function renderDrawer() {
    while (clist.firstChild) clist.removeChild(clist.firstChild);

    var visibleThreads = oswFilterThreads(state.threads, state.filter, pagePath());
    if (!visibleThreads.length) {
      clist.appendChild(el('div', 'empty', state.ready ? 'No comments yet.' : 'Loading' + '\\u2026'));
    }
    for (var i = 0; i < visibleThreads.length; i++) clist.appendChild(renderThread(visibleThreads[i]));

    root.querySelector('.dcount').textContent = String(state.threads.length);

    var chips = root.querySelectorAll('.chip');
    for (var c = 0; c < chips.length; c++) {
      chips[c].setAttribute('aria-selected', chips[c].dataset.filter === state.filter ? 'true' : 'false');
    }

    var dot = root.querySelector('.medot');
    dot.style.background = state.viewer
      ? colorFor(state.viewer.participant_id, state.viewer.is_team)
      : '#c4c4c4';
    root.querySelector('.metext').textContent = needsName()
      ? 'You have not added a name yet'
      : 'Commenting as ' + viewerName();
    root.querySelector('.mechange').textContent = needsName() ? 'Add name' : 'Change';
  }

  function renderBar() {
    var total = state.comments.length;
    countBtn.textContent = total === 1 ? '1 comment' : total + ' comments';
    toggle.setAttribute('aria-pressed', state.commenting ? 'true' : 'false');
    toggle.textContent = state.commenting ? 'Commenting on' : 'Commenting off';
    toggle.disabled = !state.ready;
    countBtn.disabled = !state.ready;
    countBtn.setAttribute('aria-expanded', state.drawerOpen ? 'true' : 'false');
  }

  function render() {
    renderBar();
    renderPins();
    if (state.drawerOpen) renderDrawer();
    schedule();
  }

  /* ------------------------------------------------------------ composer */

  function closePopover() {
    if (state.pop) {
      state.pop.node.remove();
      state.pop = null;
    }
  }

  function openPopover(element) {
    closePopover();
    var node = el('div', 'pop');
    layer.appendChild(node);
    state.pop = { node: node, element: element };
    return node;
  }

  function showError(node, message) {
    var existing = node.querySelector('.err');
    if (existing) existing.remove();
    node.appendChild(el('div', 'err', message));
  }

  /* The one thing a client is ever asked. The address is optional and says why it is wanted. */
  function showNameForm(element, onDone) {
    var node = openPopover(element);
    node.appendChild(el('div', 'head', 'What should we call you?'));
    node.appendChild(el('p', 'hint', 'Shown next to your comments so the team knows who asked for what.'));

    var name = el('input', 'inp');
    name.placeholder = 'Your name';
    var current = viewerParticipant();
    if (current) name.value = current.display_name;
    node.appendChild(name);

    var email = el('input', 'inp');
    email.placeholder = 'Email (optional)';
    email.type = 'email';
    node.appendChild(email);
    node.appendChild(
      el('p', 'hint', 'Only used to tell you when someone replies. Skip it if you would rather check back yourself.')
    );

    var foot = el('div', 'foot');
    var save = el('button', 'btn accent', 'Continue');
    save.type = 'button';
    var cancel = el('button', 'btn ghost', 'Cancel');
    cancel.type = 'button';
    foot.appendChild(save);
    foot.appendChild(cancel);
    node.appendChild(foot);

    cancel.addEventListener('click', closePopover);
    save.addEventListener('click', function () {
      if (!name.value.trim()) {
        showError(node, 'A name is needed so your comments can be attributed.');
        return;
      }
      save.disabled = true;
      request('/participant', {
        method: 'PATCH',
        body: JSON.stringify({ display_name: name.value.trim(), email: email.value.trim() || undefined })
      })
        .then(function (data) {
          state.participants[data.participant.id] = data.participant;
          onDone();
        })
        .catch(function (error) {
          save.disabled = false;
          showError(node, error.message);
        });
    });

    placePopover();
    name.focus();
  }

  function showComposer(element) {
    var selector = oswSelectorFor(element, host);
    var node = openPopover(element);

    node.appendChild(
      el('div', 'anch', oswDescribeElement(element) + ' \\u00b7 ' + (oswAnchorText(element, 60) || 'no text'))
    );

    var text = document.createElement('textarea');
    text.placeholder = 'What should change here?';
    node.appendChild(text);

    var foot = el('div', 'foot');
    var send = el('button', 'btn accent', 'Comment');
    send.type = 'button';
    var cancel = el('button', 'btn ghost', 'Cancel');
    cancel.type = 'button';
    var as = el('div', 'as');
    as.appendChild(document.createTextNode('as '));
    as.appendChild(el('b', null, viewerName()));
    foot.appendChild(send);
    foot.appendChild(cancel);
    foot.appendChild(as);
    node.appendChild(foot);

    cancel.addEventListener('click', closePopover);
    send.addEventListener('click', function () {
      if (!text.value.trim()) return;
      send.disabled = true;
      request('/comments', {
        method: 'POST',
        body: JSON.stringify({
          body: text.value.trim(),
          page_path: pagePath(),
          selector: selector || undefined,
          anchor_text: oswAnchorText(element) || undefined
        })
      })
        .then(function (data) {
          addComment(data.comment);
          closePopover();
          state.drawerOpen = true;
          drawer.hidden = false;
          render();
        })
        .catch(function (error) {
          send.disabled = false;
          showError(node, error.message);
        });
    });

    placePopover();
    text.focus();
  }

  function startComment(element) {
    if (needsName()) {
      showNameForm(element, function () { showComposer(element); });
      return;
    }
    showComposer(element);
  }

  /* -------------------------------------------------------------- events */

  /*
   * A click or hover anywhere in the widget arrives at document level retargeted to the host,
   * because the shadow root is closed. That is the test for "is this ours" — and it must not be
   * swallowed, or the shadow tree's own handlers would never run.
   */
  function ownEvent(event) {
    return event.target === host;
  }

  function onPointerMove(event) {
    if (!state.commenting || state.pop) return;
    if (ownEvent(event)) {
      state.hovered = null;
      placeOutline(null);
      return;
    }
    var target = event.target;
    if (!target || target.nodeType !== 1) return;
    state.hovered = target;
    placeOutline(target);
  }

  function onClick(event) {
    if (!state.commenting || ownEvent(event)) return;
    var target = event.target;
    if (!target || target.nodeType !== 1) return;

    /* The review copy is for commenting, so a click here is a comment and not a navigation. */
    event.preventDefault();
    event.stopPropagation();
    state.hovered = null;
    placeOutline(null);
    startComment(target);
  }

  function setCommenting(on) {
    state.commenting = on;
    if (!on) {
      closePopover();
      state.hovered = null;
      placeOutline(null);
    }
    renderBar();
  }

  toggle.addEventListener('click', function () {
    if (!state.ready) return;
    setCommenting(!state.commenting);
  });

  countBtn.addEventListener('click', function () {
    if (!state.ready) return;
    state.drawerOpen = !state.drawerOpen;
    drawer.hidden = !state.drawerOpen;
    if (state.drawerOpen) renderDrawer();
    renderBar();
  });

  root.querySelector('.dclose').addEventListener('click', function () {
    state.drawerOpen = false;
    drawer.hidden = true;
    renderBar();
  });

  root.querySelector('.mechange').addEventListener('click', function () {
    showNameForm(null, function () {
      closePopover();
      renderDrawer();
    });
  });

  drawer.addEventListener('click', function (event) {
    var node = event.target;
    if (!node || node.nodeType !== 1) return;

    if (node.dataset.filter) {
      state.filter = node.dataset.filter;
      renderDrawer();
      return;
    }

    if (node.dataset.resolve) {
      var id = node.dataset.resolve;
      node.disabled = true;
      request('/comments/' + encodeURIComponent(id), {
        method: 'PATCH',
        body: JSON.stringify({ status: node.dataset.status })
      })
        .then(function (data) {
          replaceComment(data.comment);
          render();
        })
        .catch(function () {
          node.disabled = false;
          node.textContent = 'Could not update';
        });
      return;
    }

    if (node.dataset.sendReply) {
      sendReply(node.dataset.sendReply);
    }
  });

  drawer.addEventListener('keydown', function (event) {
    if (event.key === 'Enter' && event.target && event.target.dataset && event.target.dataset.reply) {
      event.preventDefault();
      sendReply(event.target.dataset.reply);
    }
  });

  /* Ids are server-minted, but a quote in one would make the selector unparseable and the reply
     would then fail with no visible cause at all. Compared rather than interpolated. */
  function replyInput(threadId) {
    var inputs = clist.querySelectorAll('[data-reply]');
    for (var i = 0; i < inputs.length; i++) {
      if (inputs[i].dataset.reply === threadId) return inputs[i];
    }
    return null;
  }

  function sendReply(threadId) {
    var input = replyInput(threadId);
    var thread = threadById(threadId);
    if (!input || !thread || !input.value.trim()) return;

    var value = input.value.trim();
    input.disabled = true;

    var post = function () {
      return request('/comments', {
        method: 'POST',
        body: JSON.stringify({
          body: value,
          page_path: thread.comment.page_path,
          parent_id: threadId
        })
      }).then(function (data) {
        addComment(data.comment);
        render();
      });
    };

    if (needsName()) {
      showNameForm(null, function () { closePopover(); post().catch(function () { input.disabled = false; }); });
      return;
    }

    post().catch(function () {
      input.disabled = false;
    });
  }

  pins.addEventListener('click', function (event) {
    var id = event.target && event.target.dataset ? event.target.dataset.thread : null;
    if (!id) return;
    state.focusThread = id;
    state.drawerOpen = true;
    drawer.hidden = false;
    render();
    var focused = clist.querySelector('.focus');
    if (focused && focused.scrollIntoView) focused.scrollIntoView({ block: 'nearest' });
  });

  document.addEventListener('mousemove', onPointerMove, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && state.pop) closePopover();
  });

  window.addEventListener('scroll', schedule, true);
  window.addEventListener('resize', schedule);
  window.addEventListener('load', schedule);

  /* Late-arriving images and webfonts change the geometry of everything below them. */
  document.addEventListener('load', schedule, true);
  if (document.fonts && document.fonts.ready && document.fonts.ready.then) {
    document.fonts.ready.then(schedule);
  }
  if (window.ResizeObserver) {
    var observer = new ResizeObserver(schedule);
    observer.observe(document.documentElement);
    observer.observe(document.body);
  }

  syncLayer();
  renderBar();

  request('/comments', {})
    .then(function (data) {
      ingest(data);
      state.ready = true;
      render();
    })
    .catch(function () {
      root.querySelector('.note').textContent = 'Review copy, not live \\u2014 comments unavailable';
      bar.setAttribute('data-osw-review-error', 'true');
    });
})();
</script>
`.trim();
}
