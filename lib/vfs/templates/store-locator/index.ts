import { ProjectTemplate } from '../../project-templates';
import { STATIC_DOMAIN_PROMPT } from '@/lib/llm/prompts/static';
import { templateStylesheet } from '../theme';
import { TEMPLATE_STYLE_PROMPT } from '../style-prompt';

export const STORE_LOCATOR_PROJECT_TEMPLATE: ProjectTemplate = {
  name: 'Store Locator',
  description: 'A searchable map of your locations with opening hours and contact details, ready to embed in another site',
  directories: ['/styles', '/scripts'],
  files: [
    {
      path: '/index.html',
      content: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Find a shop</title>
    <!-- Leaflet before the page's own stylesheet, so the map's rules can be
         overridden below rather than the other way round. -->
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
    <link rel="stylesheet" href="/styles/style.css">
</head>
<body>
    <div class="wrap">
        <header class="site-head">
            <p class="brand" id="locator-title">Find a shop</p>
        </header>

        <p class="lede muted" id="locator-note"></p>

        <!--
          Addresses on the left, map on the right, because the list is what gets
          read and the map is what gets glanced at. Below 56rem there is no room
          for both, so they stack with the map first: at that width it is a phone,
          and the first question is usually "which of these is near me".
        -->
        <div class="locator">
            <div class="panel">
                <label class="field">
                    <span>Search</span>
                    <input type="search" id="search" placeholder="Town, postcode or name" autocomplete="off">
                </label>

                <p class="label" id="count-line"><span id="count">0</span> locations</p>

                <div class="list" id="locations"></div>
            </div>

            <div class="map-wrap">
                <div id="map" role="application" aria-label="Map of locations"></div>
                <p class="map-fallback" id="map-fallback" hidden>The map could not load, which usually means no internet connection. The list still works.</p>
            </div>
        </div>
    </div>

    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script src="/scripts/locator.js"></script>
</body>
</html>`,
    },
    {
      path: '/locations.json',
      content: `{
  "title": "Find a shop",
  "note": "Six shops across the south west. Opening hours change on bank holidays.",
  "centre": [51.45, -2.6],
  "zoom": 9,
  "locations": [
    {
      "id": "bristol-stokes-croft",
      "name": "Bristol, Stokes Croft",
      "address": "118 Stokes Croft, Bristol BS1 3RU",
      "lat": 51.4633,
      "lng": -2.5896,
      "phone": "0117 000 0001",
      "hours": "Mon-Sat 8am-6pm, Sun 9am-4pm",
      "note": "Step-free entrance on the side street."
    },
    {
      "id": "bristol-bedminster",
      "name": "Bristol, Bedminster",
      "address": "9 North Street, Bristol BS3 1EN",
      "lat": 51.4404,
      "lng": -2.6017,
      "phone": "0117 000 0002",
      "hours": "Mon-Sat 8am-6pm, closed Sunday",
      "note": ""
    },
    {
      "id": "bath",
      "name": "Bath",
      "address": "22 Walcot Street, Bath BA1 5BN",
      "lat": 51.3873,
      "lng": -2.3573,
      "phone": "01225 000 003",
      "hours": "Mon-Sat 9am-5.30pm, Sun 10am-4pm",
      "note": "No parking on Walcot Street; use Podium car park."
    },
    {
      "id": "cardiff",
      "name": "Cardiff",
      "address": "40 Castle Arcade, Cardiff CF10 1BW",
      "lat": 51.4816,
      "lng": -3.1791,
      "phone": "029 2000 0004",
      "hours": "Mon-Sat 9am-6pm, closed Sunday",
      "note": ""
    },
    {
      "id": "exeter",
      "name": "Exeter",
      "address": "5 Gandy Street, Exeter EX4 3LS",
      "lat": 50.7245,
      "lng": -3.5339,
      "phone": "01392 000 005",
      "hours": "Tue-Sat 9.30am-5pm, closed Sun and Mon",
      "note": "Our smallest shop. Ring ahead for larger orders."
    },
    {
      "id": "taunton",
      "name": "Taunton",
      "address": "17 Bath Place, Taunton TA1 4ER",
      "lat": 51.0155,
      "lng": -3.1049,
      "phone": "01823 000 006",
      "hours": "Mon-Sat 9am-5pm, closed Sunday",
      "note": ""
    }
  ]
}`,
    },
    {
      path: '/scripts/locator.js',
      content: `/*
 * Draws the locations on a Leaflet map and keeps the list beside it in step.
 *
 * Leaflet and the map tiles come from the network. If either is unavailable the
 * list still renders and a line explains why the map is missing, because a locator
 * that shows nothing offline is worse than one that shows addresses.
 */

(function () {
  var state = { data: null, query: '', map: null, markers: {}, openId: null };

  // Root-relative resolves in the preview, relative on a published deployment under
  // /deployments/{id}/. Trying both keeps one file working in both places.
  function loadJSON(path) {
    var candidates = ['/' + path.replace(/^\\//, ''), path.replace(/^\\//, '')];
    var i = 0;
    function next() {
      if (i >= candidates.length) return Promise.reject(new Error('Could not load ' + path));
      return fetch(candidates[i++]).then(function (res) {
        return res.ok ? res.json() : next();
      }, next);
    }
    return next();
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function matches(location) {
    if (!state.query) return true;
    var hay = [location.name, location.address, location.note].join(' ').toLowerCase();
    return hay.indexOf(state.query) !== -1;
  }

  // A marker drawn by the stylesheet rather than fetched as an image, so it
  // takes the project's accent and costs no extra requests. The html is fixed
  // markup with nothing interpolated into it.
  function pin(isOpen) {
    return window.L.divIcon({
      className: 'pin' + (isOpen ? ' pin-on' : ''),
      html: '<span class="pin-dot"></span>',
      iconSize: [22, 22],
      iconAnchor: [11, 22],
      popupAnchor: [0, -20]
    });
  }

  function initMap() {
    if (typeof window.L === 'undefined') {
      document.getElementById('map-fallback').hidden = false;
      document.getElementById('map').hidden = true;
      return false;
    }

    state.map = window.L.map('map').setView(state.data.centre || [51.45, -2.6], state.data.zoom || 9);

    // OpenStreetMap's tiles are free to use but their usage policy expects attribution
    // and modest volume. A busy site should move to its own tile provider.
    window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(state.map);

    (state.data.locations || []).forEach(function (location) {
      if (typeof location.lat !== 'number' || typeof location.lng !== 'number') return;
      var marker = window.L.marker([location.lat, location.lng], {
        icon: pin(false),
        title: location.name,
        alt: location.name
      }).addTo(state.map);

      // Built as elements rather than a string. Leaflet parses a popup string as HTML, so a
      // name or address carrying markup would run in every visitor's browser, and this data
      // often arrives by pasting a list from somewhere else.
      var popup = document.createElement('div');
      var name = document.createElement('strong');
      name.textContent = location.name;
      popup.appendChild(name);
      popup.appendChild(document.createElement('br'));
      popup.appendChild(document.createTextNode(location.address || ''));
      marker.bindPopup(popup);
      marker.on('click', function () { select(location.id, false); });
      state.markers[location.id] = marker;
    });

    return true;
  }

  function select(id, moveMap) {
    state.openId = id;
    drawList();

    // Every marker is redrawn, not just the new one, so the previously open pin
    // goes back to its normal size instead of leaving two looking selected.
    Object.keys(state.markers).forEach(function (key) {
      state.markers[key].setIcon(pin(key === id));
    });

    var location = (state.data.locations || []).filter(function (l) { return l.id === id; })[0];
    if (!location || !state.map) return;

    if (moveMap) {
      state.map.setView([location.lat, location.lng], Math.max(state.map.getZoom(), 13));
    }
    if (state.markers[id]) {
      state.markers[id].openPopup();
    }

    // The row can be off-screen when the pin was clicked, or when the list is
    // long enough to scroll inside its own column.
    var row = document.querySelector('.list-item.is-open');
    if (row && row.scrollIntoView) {
      row.scrollIntoView({ block: 'nearest' });
    }
  }

  function drawList() {
    var list = document.getElementById('locations');
    list.innerHTML = '';

    var shown = (state.data.locations || []).filter(matches);
    document.getElementById('count').textContent = String(shown.length);

    if (!shown.length) {
      list.appendChild(el('div', 'list-item', 'Nothing matches that. Try a town or a postcode.'));
      return;
    }

    // The row is the shared list component: a lead line, a sub line, and a tag
    // holding the one value worth seeing without opening anything.
    shown.forEach(function (location) {
      var item = el('div', 'list-item' + (state.openId === location.id ? ' is-open' : ''));
      item.setAttribute('role', 'button');
      item.tabIndex = 0;

      var text = el('div');
      text.appendChild(el('div', 'lead', location.name));
      text.appendChild(el('div', 'sub', location.address));
      if (location.note) text.appendChild(el('div', 'sub', location.note));
      if (location.phone) {
        var tel = el('a', 'sub', location.phone);
        tel.href = 'tel:' + location.phone.replace(/\\s+/g, '');
        tel.addEventListener('click', function (event) { event.stopPropagation(); });
        text.appendChild(tel);
      }
      item.appendChild(text);

      if (location.hours) item.appendChild(el('span', 'tag', location.hours));

      function open() { select(location.id, true); }
      item.addEventListener('click', open);
      item.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); }
      });
      list.appendChild(item);
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('search').addEventListener('input', function (event) {
      state.query = event.target.value.trim().toLowerCase();
      drawList();
    });

    loadJSON('locations.json').then(
      function (data) {
        state.data = data;
        document.getElementById('locator-title').textContent = data.title || 'Find a shop';
        document.getElementById('locator-note').textContent = data.note || '';
        document.title = data.title || 'Find a shop';
        initMap();
        drawList();
      },
      function () {
        document.getElementById('locations').innerHTML =
          '<div class="notice notice-stop"><span class="bar"></span>locations.json could not be loaded. It should sit at the root of the project.</div>';
      }
    );
  });
})();`,
    },
    {
      path: '/styles/style.css',
      content: `${templateStylesheet({ hue: 145, chroma: 0.165, lightness: 0.53 })}

/* This header sits inside .wrap rather than in a band of its own, so it inherits
   the gutter and must not add a second one: with both, the name is indented
   past everything under it. */
.site-head {
  padding-left: 0;
  padding-right: 0;
}

/* The map is the one thing on this page the shared components have no rule for,
   because no other template has a map. Everything else above is shared. */

/*
  This is meant to be dropped into somebody else's page in an iframe, where the
  host sets the box. So the widget fills whatever it is given rather than
  centring itself in a column: the shared 940px measure inside a 1600px frame is
  a locator with 300px of nothing down either side, and a fixed pane height
  leaves a gap underneath whenever the host asked for a taller frame.

  This is the one template that lifts the measure, and it lifts it here rather
  than in the theme. Prose inside still keeps its own, because the shared rule
  on p carries it.
*/
html,
body {
  height: 100%;
}

.wrap {
  max-width: none;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: clamp(1.25rem, 3vw, 2rem) clamp(1.25rem, 4vw, 2.5rem);
}

.lede {
  margin-bottom: 1.5rem;
}

.locator {
  display: grid;
  grid-template-columns: minmax(0, 23rem) minmax(0, 1fr);
  gap: 1.25rem;
  /* Whatever height is left under the title and the note, so the map and the
     list end level however tall the frame is. The floor stops a host that asked
     for 200px from collapsing the map to nothing. */
  flex: 1;
  min-height: 20rem;
}

/* The shared row puts its tag to the right of the text, which is right at full
   width and wrong in a column this narrow: opening hours are long enough to
   take half the row and squeeze the address onto three lines. Only while the
   list is a column does the tag move underneath; once the panel goes full width
   the row is the shared one again. */
@media (min-width: 56rem) {
  .panel .list-item {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.4rem;
  }
}

.panel {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  min-height: 0;
}

/* Only the rows scroll. The search and the count stay put, so the count still
   answers "how many" once you are some way down the list. */
.panel .list {
  overflow-y: auto;
  min-height: 0;
}

.map-wrap {
  position: relative;
  height: 100%;
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  overflow: hidden;
  background: var(--sunken);
}

/* Stacked, the widget stops filling a fixed box and goes back to being a page
   that scrolls: two panes sharing the height of a phone gives neither enough. */
@media (max-width: 56rem) {
  html,
  body {
    height: auto;
  }

  .wrap {
    height: auto;
  }

  .locator {
    grid-template-columns: minmax(0, 1fr);
    flex: none;
    min-height: 0;
  }

  /* The map comes first on a narrow screen, where the question is usually which
     of these is nearby rather than what the full list says. */
  .map-wrap {
    order: -1;
    height: clamp(14rem, 38vh, 20rem);
  }

  .panel .list {
    overflow: visible;
  }
}

/* Leaflet measures its container once, at startup, and draws nothing if that
   container has no height. Filling .map-wrap absolutely gives it one whatever
   the frame is sized to. */
#map {
  position: absolute;
  inset: 0;
}

.map-fallback {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 2rem;
  color: var(--ink-soft);
  font-size: 0.9375rem;
}

.list-item[role="button"] {
  cursor: pointer;
}

.list-item.is-open {
  background: var(--base);
  box-shadow: inset 2px 0 0 var(--accent);
}

/*
  The markers are drawn here rather than loaded as images, which is what
  Leaflet's default pins are. Two reasons: they take the project's accent
  automatically, so changing the hue at the top of this file moves the pins with
  everything else; and the default set is three PNGs fetched from unpkg, which
  is three more requests and a broken-image icon when that host is unreachable.
*/
.pin-dot {
  display: block;
  width: 18px;
  height: 18px;
  margin: 2px;
  background: var(--accent);
  border: 2px solid var(--canvas);
  /* Three round corners and one square one makes the teardrop; the rotation
     turns the square corner downward into the point. */
  border-radius: 50% 50% 50% 0;
  transform: rotate(-45deg);
  box-shadow: var(--shadow-sm);
  transition: transform var(--t-fast) var(--ease), background var(--t-fast) var(--ease);
}

/* The open one grows and darkens, so which row you picked is readable at a
   glance without hunting for the popup. */
.pin-on .pin-dot {
  background: var(--accent-hover);
  transform: rotate(-45deg) scale(1.25);
}

/* Leaflet gives every marker this class and a white background comes with it. */
.pin {
  background: none;
  border: 0;
}

/* Leaflet draws its own popup, so it is brought onto the tokens here. */
.leaflet-popup-content-wrapper,
.leaflet-popup-tip {
  background: var(--raised);
  color: var(--ink);
}

.leaflet-popup-content-wrapper {
  border: 1px solid var(--line);
  border-radius: var(--r-md);
}

.leaflet-popup-content {
  font-family: var(--sans);
  font-size: 0.8125rem;
  line-height: 1.5;
}

.leaflet-popup-content strong {
  font-weight: 400;
  font-size: 0.9375rem;
}`,
    },
    {
      path: '/.PROMPT.md',
      content: `${STATIC_DOMAIN_PROMPT}

---

# This project: a store locator

A map and a searchable list of the same places, side by side. Clicking a location in the list moves
the map; clicking a marker highlights the list entry.

The seed content is six invented shops in the south west of England. Replace them with the user's
real locations.

## Where things are

- \`/locations.json\`: every location, plus the map's starting centre and zoom.
- \`/scripts/locator.js\`: the map and the list.
- \`/styles/style.css\`, \`/index.html\`: layout. The stylesheet is the shared template theme followed
  by a short tail; the theme is generated, so the only thing to change up there is the accent hue,
  currently 145.

## The layout

List on the left, map on the right, both the same height, with only the rows scrolling so the search
and the count stay put. Below 56rem there is no room for two columns, so they stack and the map goes
first: at that width it is a phone, and the first question is usually which one is nearby.

**The widget fills the box it is given.** This is the one template that lifts the shared \`.wrap\`
measure, because it is meant to sit in somebody else's iframe: a 940px column centred in a 1600px
frame is a locator with 300px of nothing down either side. The height works the same way, so a host
that asks for \`height="900"\` gets a taller map rather than a gap under a fixed one. Keep it that
way; if you cap the width again, cap it on whatever wraps the embed instead.

One rule this depends on: \`#map\` fills \`.map-wrap\` absolutely. Leaflet measures its container once
at startup and draws nothing if that container has no height, and the failure is quiet, a grey box
with no tiles and no message.

The accent appears three times and no more: the markers, the rule down the edge of the open row, and
the focus outline. Adding a fourth is what makes a page like this look busy.

## The markers

The pins are drawn by \`.pin-dot\` in the stylesheet and handed to Leaflet as a \`divIcon\`, not loaded
as images. Two reasons to keep it that way:

- They take \`--accent\` automatically, so moving the hue moves the pins with everything else.
- Leaflet's default pins are three PNGs fetched from \`unpkg.com\`. That is three more requests, and a
  broken-image icon on every marker when that host is unreachable.

The open marker is redrawn larger through \`setIcon\`. \`select()\` redraws **every** marker rather than
just the new one, so the previously open pin returns to its normal size instead of leaving two
looking selected.

To change the pin, edit \`.pin-dot\`. The teardrop is one square corner on an otherwise round element,
rotated 45 degrees to point down; \`iconAnchor\` is what puts that point on the coordinate, so it needs
to match the icon's height if you change the size.

## Adding a location

Append to \`locations\` in \`/locations.json\`:

\`\`\`json
{
  "id": "short-slug",
  "name": "Town, or town and district",
  "address": "Street, town, postcode",
  "lat": 51.4633,
  "lng": -2.5896,
  "phone": "0117 000 0001",
  "hours": "Mon-Sat 8am-6pm, closed Sunday",
  "note": "Anything a visitor needs to know before travelling."
}
\`\`\`

**\`lat\` and \`lng\` must be real numbers, not strings**, or the marker is skipped silently.

**Never invent coordinates.** If the user gives an address without them, say you need the
coordinates and suggest they look the address up on openstreetmap.org and read them from the URL. A
guessed latitude puts a shop in a field, and it looks convincing.

After adding locations well outside the current area, update \`centre\` and \`zoom\` so the first view
contains them.

## The map depends on the network

Leaflet and the tiles are loaded from \`unpkg.com\` and \`tile.openstreetmap.org\`. With no connection
the list still renders and a line appears where the map would be. Keep that fallback working; do not
make the list depend on the map having loaded.

OpenStreetMap's tiles are free but their usage policy expects attribution to stay on the map and the
volume to be modest. The attribution is already set in \`/scripts/locator.js\`. A busy commercial site
should move to a paid tile provider, which is a one-line change to the tile URL.

## Embedding this in another site

This is a whole page, so the way to put it in an existing site is an iframe:

\`\`\`html
<iframe src="https://your-deployment-url/" width="100%" height="600" style="border:0"
        title="Find a shop"></iframe>
\`\`\`

Nothing needs to change in the project for that to work.

## Conventions this project follows

- **The note field carries what would waste someone's journey**: no parking, step-free entrance,
  closed Mondays, ring ahead. Not marketing.
- **Hours are written the way a person would say them**, and closures are stated rather than
  implied by omission.
- **No opening-hours logic.** Do not add "open now" from the browser clock; it needs time zones and
  bank holidays to be right, and being wrong about it sends people to a locked door.

${TEMPLATE_STYLE_PROMPT}
`,
    },
  ],
};
