import { ProjectTemplate } from '../../project-templates';
import { STATIC_DOMAIN_PROMPT } from '@/lib/llm/prompts/static';
import { templateStylesheet } from '../theme';
import { TEMPLATE_STYLE_PROMPT } from '../style-prompt';

export const LLM_WIKI_PROJECT_TEMPLATE: ProjectTemplate = {
  name: 'LLM Wiki',
  description: 'A knowledge base the assistant writes and keeps current as you add sources, after Andrej Karpathy’s LLM Wiki pattern',
  directories: ['/src', '/src/lib', '/styles', '/wiki', '/wiki/concepts', '/wiki/sources', '/raw', '/raw/text'],
  files: [
    {
      path: '/README.md',
      content: `# Your wiki

A knowledge base the assistant writes and keeps current. You bring sources and
ask questions; it does the reading, the writing and the filing.

An implementation of the LLM Wiki pattern described by Andrej Karpathy:
<https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f>

## The three things you do

**Add a source.** Drag files onto the File Explorer, or use Upload files, and say
you have added something. Drop them anywhere; the assistant sorts out where they
go. You can also just give it a link, or paste the text.

**Ask it something.** It answers from the wiki and cites the pages it used. If the
answer is worth keeping, it offers to file it as a new page, so what you work out
does not vanish into the chat.

**Ask it to lint.** A health check: contradictions between pages, claims a newer
source has overtaken, pages nothing links to, links to pages that were never
written, and gaps worth finding a source for.

All three sit in the suggestions above the message box, next to shortcuts for
the common ways of adding a source.

## What you get

The page beside this is the wiki: search, tag filters, and pages that link to
each other. Every page lists what links to it at the foot, so you can see how the
thing is connected. A link to a page that does not exist yet is drawn dashed,
which is how you see what the assistant still owes you.

It arrives with a small worked example about street trees and summer heat, with a
real contradiction running through it, to show the shape. Say the word and the
assistant will clear it out and start on your subject.

## Where things live

- \`/raw/\` is yours: the sources as they came. The assistant reads them and never
  rewrites them. It cannot read a PDF, so for those it will ask you for the text.
- \`/wiki/\` is the assistant's: the pages, the index and the log.
- \`.PROMPT.md\` is how the assistant is told to work. You will not need to read
  it, but that is where its instructions live if you ever want to change them.

## One limit worth knowing

The page only reads. You cannot edit the wiki in the browser, because a published
page cannot write back to the project. Ask the assistant instead; that way the
files and what you see always agree.
`,
    },
    {
      path: '/index.html',
      content: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>LLM Wiki</title>
    <link rel="stylesheet" href="/styles/style.css">
</head>
<body>
    <div class="shell">
        <aside class="sidebar">
            <header class="sidebar-head">
                <!-- The name is the way back: clicking it returns to the front
                     screen, the same convention as every site logo. -->
                <button type="button" class="brand" id="home">LLM <em>Wiki</em></button>
                <p class="muted desc">Written and kept current by the assistant. You add the sources and ask the questions.</p>
            </header>

            <label class="field search">
                <span class="sr-only">Search the wiki</span>
                <input type="search" id="search" placeholder="Search titles and text" autocomplete="off">
            </label>

            <div class="row-set filters" id="filters"></div>

            <p class="label count" id="count">Loading the wiki</p>

            <div class="list pages" id="pages"></div>
        </aside>

        <main class="reader" id="reader">
            <!--
              The front screen doubles as the instructions. The assistant's own
              are in .PROMPT.md, which is injected into its context and never
              shown to anyone, so this and /README.md are the only places the
              reader finds out how the thing is meant to be used.
            -->
            <div class="start" id="start">
                <p class="label">How this works</p>
                <h2>You bring sources. The assistant writes the wiki.</h2>
                <p class="lede muted">
                    It reads what you add, writes the pages, keeps the cross-references straight and
                    notes where a new source contradicts an old one. Everything it has written is
                    listed on the left.
                </p>

                <div class="cards">
                    <div class="card">
                        <h3>Add a source</h3>
                        <p>
                            Drag files onto the File Explorer, or paste a link or some text, and tell the
                            assistant. Drop them anywhere; sorting them out is its job.
                        </p>
                    </div>
                    <div class="card">
                        <h3>Ask it something</h3>
                        <p>
                            It answers from these pages and cites them. Answers worth keeping get filed as
                            new pages instead of scrolling away in the chat.
                        </p>
                    </div>
                    <div class="card">
                        <h3>Ask it to lint</h3>
                        <p>
                            A health check: contradictions, claims a newer source has overtaken, pages
                            nothing links to, and gaps worth finding a source for.
                        </p>
                    </div>
                </div>

                <p class="faint hint">
                    Those three are the suggestions above the message box. The pages here are read-only:
                    ask the assistant to change something rather than editing in the browser, so the
                    files and what you see never disagree.
                </p>
            </div>

            <div id="page" hidden>
                <p class="label" id="eyebrow"></p>
                <h2 id="title"></h2>
                <div class="read" id="body"></div>
                <section class="backlinks" id="backlinks"></section>
            </div>
        </main>
    </div>

    <!-- Classic scripts in dependency order; defer keeps that order after parse. -->
    <script defer src="/src/lib/markdown.js"></script>
    <script defer src="/src/lib/wiki.js"></script>
    <script defer src="/src/app.js"></script>
</body>
</html>`,
    },
    {
      path: '/src/app.js',
      content: `/*
 * The wiki reader. Framework-free on purpose: the app is one piece of state
 * (which page is open) plus a search string, and plain DOM code is something
 * anyone, the assistant included, can edit without learning anything first.
 *
 * Three classic scripts sharing window namespaces, not ES modules. The preview
 * serves every script from a blob URL, and a module loaded from a blob cannot
 * resolve imports between project files; classic scripts loaded in order work
 * in the preview, on a published site, and from a plain folder alike.
 *
 * Everything is loaded once: the catalogue from wiki/index.md, then every page
 * it lists. That is what makes backlinks and full-text search possible without
 * an index to keep in step. It is also the ceiling: at a few hundred pages this
 * becomes a lot of requests, and that is the point to build a real index.
 */

const { render, stripLeadingTitle } = window.wikiMarkdown;
const { parseIndex, parseFrontMatter, outboundLinks, buildResolver, backlinksFor } = window.wikiData;

const state = {
  pages: [],
  resolve: () => null,
  openPath: null,
  query: "",
  tag: "all",
};

const $ = (id) => document.getElementById(id);

// Root-relative resolves in the preview, relative on a published deployment
// under /deployments/{id}/. Trying both keeps one file working in both places.
async function loadText(path) {
  const bare = path.startsWith("/") ? path.slice(1) : path;
  for (const url of ["/" + bare, bare]) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.text();
    } catch {
      // try the next candidate
    }
  }
  throw new Error("Could not load " + path);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function tagsOf(page) {
  const tags = page.meta.tags;
  if (!tags) return [];
  return Array.isArray(tags) ? tags : [tags];
}

/* The first line of prose under the front matter, which is what a page's
   opening sentence is for. Wiki link syntax is unwrapped rather than shown. */
function summary(page) {
  const body = String(page.body || "").replace(/^---\\n[\\s\\S]*?\\n---\\n*/, "");
  for (const line of body.split("\\n")) {
    const text = line.trim();
    if (!text || text.startsWith("#")) continue;
    return text.replace(/\\[\\[([^\\]|]+)(?:\\|([^\\]]+))?\\]\\]/g, (_m, t, l) => l || t);
  }
  return "";
}

async function loadWiki() {
  const indexText = await loadText("wiki/index.md");
  const listed = parseIndex(indexText);

  const pages = await Promise.all(
    listed.map(async (entry) => {
      try {
        const body = await loadText("wiki/" + entry.path.replace(/^wiki\\//, ""));
        const meta = parseFrontMatter(body);
        return {
          ...entry,
          body,
          meta,
          title: meta.title || entry.title,
          links: outboundLinks(body),
          missing: false,
        };
      } catch {
        // Listed in the index but not on disk. Shown as such rather than
        // dropped: a dead index entry is something to fix, not to hide.
        return { ...entry, body: "", meta: {}, links: [], missing: true };
      }
    })
  );

  state.pages = pages;
  state.resolve = buildResolver(pages.map((p) => p.path));
}

function shownPages() {
  return state.pages.filter((page) => {
    if (state.tag !== "all" && !tagsOf(page).includes(state.tag)) return false;
    if (!state.query) return true;
    const hay = (page.title + " " + page.path + " " + page.body).toLowerCase();
    return hay.includes(state.query.toLowerCase());
  });
}

function drawFilters() {
  const tags = ["all"].concat(
    Array.from(new Set(state.pages.flatMap(tagsOf))).sort()
  );
  const box = $("filters");
  box.replaceChildren();
  if (tags.length <= 1) return;
  for (const value of tags) {
    const pill = el("button", "filter", value);
    pill.type = "button";
    pill.setAttribute("aria-pressed", String(state.tag === value));
    pill.addEventListener("click", () => {
      state.tag = value;
      drawFilters();
      drawList();
    });
    box.appendChild(pill);
  }
}

function drawList() {
  const shown = shownPages();
  $("count").textContent = shown.length + " of " + state.pages.length + " pages";

  const list = $("pages");
  list.replaceChildren();

  if (!shown.length) {
    const empty = el("div", "empty");
    empty.appendChild(el("h3", null, "Nothing matches that"));
    empty.appendChild(el("p", null, "Clear the search, or widen the tags above it."));
    list.appendChild(empty);
    return;
  }

  for (const page of shown) {
    const item = el("div", "list-item" + (state.openPath === page.path ? " is-open" : ""));
    const row = el("button", "row");
    row.type = "button";
    row.appendChild(el("span", "lead", page.title));
    row.appendChild(el("span", "sub path", page.path));

    if (page.missing) {
      const badges = el("span", "row-set badges");
      badges.appendChild(el("span", "tag tag-stop", "file missing"));
      row.appendChild(badges);
    } else {
      const line = summary(page);
      if (line) row.appendChild(el("span", "sub", line));
      const badges = el("span", "row-set badges");
      for (const t of tagsOf(page)) badges.appendChild(el("span", "tag", t));
      if (page.meta.updated) badges.appendChild(el("span", "tag", page.meta.updated));
      row.appendChild(badges);
    }

    row.addEventListener("click", () => openPage(page.path));
    item.appendChild(row);
    list.appendChild(item);
  }
}

function drawBacklinks(page) {
  const box = $("backlinks");
  box.replaceChildren();
  box.appendChild(el("hr", "keyline"));

  const links = backlinksFor(page.path, state.pages, state.resolve);
  if (!links.length) {
    box.appendChild(
      el("p", "faint", "Nothing links here yet. An orphan page is one of the things the lint pass looks for.")
    );
    return;
  }

  box.appendChild(el("p", "label", "Linked from"));
  const list = el("ul", "list");
  for (const link of links) {
    const item = el("li", "list-item");
    const row = el("button", "row");
    row.type = "button";
    row.appendChild(el("span", "lead", link.title));
    row.addEventListener("click", () => openPage(link.path));
    item.appendChild(row);
    list.appendChild(item);
  }
  box.appendChild(list);
}

function openPage(target) {
  const path = state.resolve(target);
  if (!path) return;
  const page = state.pages.find((p) => p.path === path);
  if (!page) return;

  state.openPath = path;
  $("start").hidden = true;
  $("page").hidden = false;

  // Joined here so the separator keeps its spaces however this file is edited.
  const updated = page.meta.updated ? "updated " + page.meta.updated : "";
  $("eyebrow").textContent = [page.path, updated].filter(Boolean).join(" · ");
  $("title").textContent = page.title;

  const body = $("body");
  if (page.missing) {
    body.replaceChildren();
    const notice = el("p", "notice notice-stop");
    notice.appendChild(el("span", "bar"));
    const text = el("span");
    const code = el("code", null, page.path);
    text.appendChild(code);
    text.appendChild(
      document.createTextNode(
        " is listed in the index but is not in the project. Ask the assistant to write it or to drop the entry."
      )
    );
    notice.appendChild(text);
    body.appendChild(notice);
  } else {
    // The rendered markdown is HTML the renderer built from escaped text, and
    // the page's own opening heading is dropped because the title above came
    // from the front matter.
    body.innerHTML = stripLeadingTitle(render(page.body));

    // Mark links whose target does not exist, which is how a page the
    // assistant referred to but never wrote becomes visible.
    for (const link of body.querySelectorAll(".wikilink")) {
      const wanted = link.getAttribute("data-page") || "";
      link.classList.toggle("is-missing", !state.resolve(wanted));
    }
  }

  drawBacklinks(page);
  drawList();
  $("reader").scrollTop = 0;
}

/* Back to the front screen: the page pane hides, the how-this-works screen
   returns, and no row reads as open. The brand in the sidebar is the control,
   which is the same convention as every site logo. */
function goHome() {
  state.openPath = null;
  $("page").hidden = true;
  $("start").hidden = false;
  drawList();
  $("reader").scrollTop = 0;
}

async function main() {
  $("home").addEventListener("click", goHome);

  $("search").addEventListener("input", (event) => {
    state.query = event.target.value.trim();
    drawList();
  });

  // One listener on the body, because pages come and go. A click on a wiki
  // link opens the page here instead of following a URL that does not exist.
  $("body").addEventListener("click", (event) => {
    const link = event.target.closest(".wikilink");
    if (!link) return;
    event.preventDefault();
    openPage(link.getAttribute("data-page") || "");
  });

  try {
    await loadWiki();
    drawFilters();
    drawList();
  } catch {
    $("count").textContent = "";
    const list = $("pages");
    const notice = el("p", "notice notice-stop");
    notice.appendChild(el("span", "bar"));
    notice.appendChild(
      el("span", null, "wiki/index.md could not be loaded. It is the catalogue every other page is reached from.")
    );
    list.replaceChildren(notice);
  }
}

main();`,
    },
    {
      path: '/src/lib/wiki.js',
      content: `/*
 * Reading the wiki: what pages exist, what they say about themselves, and what
 * links to what.
 *
 * The catalogue comes from wiki/index.md rather than a second machine-readable
 * manifest, because index.md is the file the assistant already maintains and a
 * second one would drift from it. A page missing from the index is therefore
 * missing from the sidebar too, which is exactly the orphan the lint pass looks
 * for.
 */

/*
 * A classic script rather than an ES module, on purpose. In the preview every
 * script is served from a blob URL, and a module loaded from a blob cannot
 * resolve imports between project files. Classic scripts sharing one namespace
 * work in the preview, on a published site, and from a plain folder alike.
 */
window.wikiData = (function () {

/** Every markdown link in index.md that points into the wiki. */
function parseIndex(markdown) {
  const pages = [];
  const seen = new Set();
  const link = /\\[([^\\]]+)\\]\\(([^)\\s]+\\.md)\\)/g;
  let match;
  while ((match = link.exec(markdown)) !== null) {
    const path = normalise(match[2]);
    if (seen.has(path)) continue;
    seen.add(path);
    pages.push({ path, title: match[1].trim() });
  }
  return pages;
}

/** Front matter, as far as this needs it: flat "key: value" pairs and inline lists. */
function parseFrontMatter(markdown) {
  const match = /^---\\n([\\s\\S]*?)\\n---/.exec(markdown || "");
  if (!match) return {};
  const meta = {};
  for (const line of match[1].split("\\n")) {
    const pair = /^([A-Za-z_][\\w-]*):\\s*(.*)$/.exec(line.trim());
    if (!pair) continue;
    const value = pair[2].trim();
    meta[pair[1]] = /^\\[.*\\]$/.test(value)
      ? value.slice(1, -1).split(",").map((v) => v.trim()).filter(Boolean)
      : value;
  }
  return meta;
}

/** The [[targets]] a page points at, in order, without duplicates. */
function outboundLinks(markdown) {
  const found = [];
  const link = /\\[\\[([^\\]|]+)(?:\\|[^\\]]+)?\\]\\]/g;
  let match;
  while ((match = link.exec(markdown || "")) !== null) {
    const target = match[1].trim();
    if (target && found.indexOf(target) === -1) found.push(target);
  }
  return found;
}

/**
 * Resolves a [[target]] against the pages that exist.
 *
 * Both spellings work, because both are natural to write: the full path from the
 * wiki root, and the bare file name. A bare name that matches two pages is left
 * unresolved rather than guessed at, so the ambiguity shows up as a broken link
 * instead of silently going to the wrong page.
 */
function buildResolver(paths) {
  const byPath = new Set(paths.map(normalise));
  const byName = new Map();
  for (const path of paths) {
    const name = baseName(path);
    byName.set(name, byName.has(name) ? null : normalise(path));
  }
  return function resolve(target) {
    const wanted = normalise(target.endsWith(".md") ? target : target + ".md");
    if (byPath.has(wanted)) return wanted;
    return byName.get(baseName(wanted)) ?? null;
  };
}

/** Which pages link to this one, so a page can show what points at it. */
function backlinksFor(path, pages, resolve) {
  const target = normalise(path);
  return pages
    .filter((page) => normalise(page.path) !== target)
    .filter((page) => (page.links || []).some((link) => resolve(link) === target))
    .map((page) => ({ path: normalise(page.path), title: page.title }));
}

function normalise(path) {
  return String(path || "").replace(/^\\.\\//, "").replace(/^\\//, "");
}

function baseName(path) {
  const parts = normalise(path).split("/");
  return parts[parts.length - 1];
}

return { parseIndex, parseFrontMatter, outboundLinks, buildResolver, backlinksFor };
})();`,
    },
    {
      path: '/src/lib/markdown.js',
      content: `/*
 * The Markdown subset this library renders, kept deliberately small: headings,
 * paragraphs, lists, quotes, fenced code, and inline bold, italic, code and
 * links. If a note needs tables or footnotes, say so rather than quietly
 * extending this.
 *
 * Plain functions with no DOM and no framework, so the components stay thin and
 * this stays testable on its own.
 */

window.wikiMarkdown = (function () {

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Emphasis and links, applied to text that has ALREADY been escaped.
//
// Kept separate from inline() below because it recurses: a link inside bold has to
// format its label too. If this escaped on the way in, the recursive call would
// escape the HTML the outer call had just produced, and a bolded link came out as
// visible &lt;a href=…&gt; instead of a link.
function format(text) {
  var out = text;

  // Wiki links first. [[target]] and [[target|label]] become anchors the app
  // intercepts, so a click opens another page instead of leaving the wiki. The
  // markdown link rule below cannot match these: it needs a "(" after the "]".
  out = out.replace(/\\[\\[([^\\]|]+)(?:\\|([^\\]]+))?\\]\\]/g, function (_m, target, label) {
    var page = target.trim();
    return '<a href="#" class="wikilink" data-page="' + page.replace(/"/g, '&quot;') + '">'
      + format((label || page).trim()) + '</a>';
  });

  out = out.replace(/\\[([^\\]]+)\\]\\(([^)\\s]+)\\)/g, function (_m, label, href) {
    return '<a href="' + href + '" rel="noopener">' + format(label) + '</a>';
  });
  out = out.replace(/\\*\\*([^*]+)\\*\\*/g, function (_m, body) {
    return '<strong>' + format(body) + '</strong>';
  });
  out = out.replace(/(^|[^*])\\*([^*]+)\\*/g, function (_m, before, body) {
    return before + '<em>' + format(body) + '</em>';
  });

  return out;
}

function inline(text) {
  var out = escapeHtml(text);

  // Code is lifted out before anything else so its contents are never treated as
  // emphasis, and put back after. The placeholders survive the recursion in
  // format() untouched, so code inside bold still works.
  var codes = [];
  out = out.replace(/\`([^\`]+)\`/g, function (_m, code) {
    codes.push(code);
    return '\\u0000' + (codes.length - 1) + '\\u0000';
  });

  out = format(out);

  out = out.replace(/\\u0000(\\d+)\\u0000/g, function (_m, index) {
    return '<code>' + codes[Number(index)] + '</code>';
  });

  return out;
}

function render(source) {
  // Drop YAML front matter, including the blank lines after it, so the first
  // heading is still recognised as the start of a line.
  var text = String(source || '').replace(/^---\\n[\\s\\S]*?\\n---\\n*/, '');
  var lines = text.split('\\n');
  var html = [];
  var i = 0;

  while (i < lines.length) {
    var line = lines[i];

    if (!line.trim()) {
      i++;
      continue;
    }

    // Fenced code
    if (/^\`\`\`/.test(line)) {
      var code = [];
      i++;
      while (i < lines.length && !/^\`\`\`/.test(lines[i])) {
        code.push(lines[i]);
        i++;
      }
      i++;
      html.push('<pre><code>' + escapeHtml(code.join('\\n')) + '</code></pre>');
      continue;
    }

    // Headings
    var heading = line.match(/^(#{1,4})\\s+(.*)$/);
    if (heading) {
      var level = heading[1].length;
      html.push('<h' + level + '>' + inline(heading[2]) + '</h' + level + '>');
      i++;
      continue;
    }

    // Blockquote
    if (/^>\\s?/.test(line)) {
      var quote = [];
      while (i < lines.length && /^>\\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^>\\s?/, ''));
        i++;
      }
      html.push('<blockquote>' + render(quote.join('\\n')) + '</blockquote>');
      continue;
    }

    // Lists. A wrapped item (a following line that is indented and not a new
    // bullet) belongs to the item above it rather than starting a new list.
    var bullet = line.match(/^\\s*([-*+]|\\d+\\.)\\s+/);
    if (bullet) {
      var ordered = /\\d/.test(bullet[1]);
      var items = [];
      while (i < lines.length) {
        var itemMatch = lines[i].match(/^\\s*(?:[-*+]|\\d+\\.)\\s+(.*)$/);
        if (itemMatch) {
          items.push(itemMatch[1]);
          i++;
        } else if (lines[i].trim() && /^\\s+/.test(lines[i]) && items.length) {
          items[items.length - 1] += ' ' + lines[i].trim();
          i++;
        } else {
          break;
        }
      }
      var tag = ordered ? 'ol' : 'ul';
      html.push(
        '<' + tag + '>' +
          items.map(function (item) { return '<li>' + inline(item) + '</li>'; }).join('') +
        '</' + tag + '>'
      );
      continue;
    }

    // Paragraph: keep consuming until a blank line or a line that starts a block.
    var para = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\\s|>\\s?|\`\`\`|\\s*(?:[-*+]|\\d+\\.)\\s)/.test(lines[i])) {
      para.push(lines[i].trim());
      i++;
    }
    html.push('<p>' + inline(para.join(' ')) + '</p>');
  }

  return html.join('\\n');
}

/*
 * Notes open with their own level-one heading so they still read as documents in the
 * editor, but the reader shows the title from library.json just above the body.
 * Without this the title appears twice.
 *
 * A function rather than a line inside a component: it is the kind of rule that
 * needs a test, and a test should not have to mount a component to reach it.
 */
function stripLeadingTitle(html) {
  return String(html || '').replace(/^\\s*<h1[^>]*>[\\s\\S]*?<\\/h1>\\s*/, '');
}

return { render, stripLeadingTitle };
})();`,
    },
    {
      path: '/wiki/index.md',
      content: `# Index

The catalogue. Every page in the wiki is listed here, and the reader builds its
sidebar from this file, so a page that is not listed is a page nobody will find.

## Overview

- [Street trees and summer heat](overview.md) - the current synthesis, and what it rests on
- [Open questions](open-questions.md) - what the wiki cannot answer yet

## Concepts

- [Canopy cover](concepts/canopy-cover.md) - the share of ground shaded from above, and the threshold argument
- [Water demand](concepts/water-demand.md) - what the cooling costs in irrigation, and when it stops
- [Maintenance cost](concepts/maintenance-cost.md) - twenty-year cost per tree, and what drives it

## Sources

- [Reyes & Lindqvist 2021](sources/reyes-lindqvist-2021.md) - canopy cover and daytime air temperature, 12 cities
- [Okada 2024](sources/okada-2024.md) - species water use under drought
- [Adelaide 2019](sources/adelaide-2019.md) - twenty-year maintenance costs, municipal record

## Log

- [Log](log.md) - what was ingested, asked and checked, in order
`,
    },
    {
      path: '/wiki/log.md',
      content: `# Log

Append-only. Newest at the bottom, so the file reads as a history rather than a
feed. Every entry opens the same way, which makes the file greppable:
\`grep "^## \\\\[" wiki/log.md | tail -5\` gives the last five things that happened.

## [2026-03-02] ingest | Reyes & Lindqvist 2021

Read the paper. Wrote [[sources/reyes-lindqvist-2021]]. Created
[[concepts/canopy-cover]] because the 40% threshold is the paper's central claim
and deserved a page of its own. Started [[overview]].

## [2026-03-19] ingest | Okada 2024

Read the paper. Wrote [[sources/okada-2024]]. It contradicts the confident
reading of the threshold, so [[concepts/canopy-cover]] gained a section on when
the effect does not hold, and [[concepts/water-demand]] was created. Revised the
thesis in [[overview]] from "cover above 40% cools reliably" to something
conditional.

## [2026-04-08] ingest | Adelaide 2019

Municipal cost record. Wrote [[sources/adelaide-2019]] and
[[concepts/maintenance-cost]]. No contradictions; it answers a cost question
[[open-questions]] had been carrying since the first ingest.

## [2026-04-08] query | What would it cost to get one street to 40% cover?

Answered from [[concepts/canopy-cover]] and [[concepts/maintenance-cost]]. The
answer needed an assumption the wiki does not have, so it went to
[[open-questions]] rather than becoming a page.

## [2026-04-11] lint

Three findings. [[concepts/water-demand]] had no inbound links, so [[overview]]
now links to it. The claim that species choice is secondary was stale after
Okada; corrected. Noted that there is no page for irrigation practice, which is
mentioned in two sources and has none.
`,
    },
    {
      path: '/wiki/overview.md',
      content: `---
title: Street trees and summer heat
updated: 2026-04-11
tags: [synthesis]
---

# Street trees and summer heat

The current thesis, revised whenever a source changes it. This page is the one to
read first, and the one most likely to be wrong in an interesting way.

## Where it stands

Street trees cool the air under them, and the size of that effect depends on how
much of the street is shaded rather than on how many trees are planted. Above
roughly 40% [[concepts/canopy-cover|canopy cover]] the cooling becomes reliable;
below it the effect is inconsistent between otherwise similar streets. That
threshold comes from [[sources/reyes-lindqvist-2021]] and is the strongest claim
the wiki holds.

It is also conditional. [[sources/okada-2024]] shows the effect collapsing during
drought, when trees close their stomata and stop transpiring: the shade remains,
the cooling largely does not. So the honest version of the thesis is that canopy
cover buys reliable cooling **in summers where the trees have water**, which
makes [[concepts/water-demand]] part of the claim rather than a footnote to it.

## What follows from it

- Planting counts are the wrong target. Cover is the target, and cover is a
  function of species, spacing and time, not of how many were put in the ground.
- A cooling programme without an irrigation plan is a cooling programme that
  fails in the summers it is most needed. This is the part most likely to be
  under-costed; see [[concepts/maintenance-cost]].
- The 40% figure is an observation from twelve European cities, not a mechanism.
  Treat it as a rule of thumb that happens to fit, and expect it to move.

## What would change it

A source showing reliable cooling well below 40% cover, or showing the drought
collapse is specific to the species Okada sampled. Both are live; see
[[open-questions]].
`,
    },
    {
      path: '/wiki/open-questions.md',
      content: `---
title: Open questions
updated: 2026-04-11
tags: [synthesis]
---

# Open questions

What the wiki cannot answer yet. Each one says what would settle it, so it is a
shopping list for sources rather than a list of doubts.

## Is the 40% threshold real, or a feature of these twelve cities?

[[sources/reyes-lindqvist-2021]] is the only source that reports it. A study in a
different climate would either corroborate it or turn it into a local artefact.

**What would settle it:** any paired-street measurement outside Europe.

## Does the drought collapse depend on species?

[[sources/okada-2024]] sampled six species, all of them common European street
trees. If the collapse is a property of those species rather than of trees under
water stress generally, then species choice moves from secondary to central.

**What would settle it:** Okada's supplementary data, if it breaks the effect
down by species. Not yet read.

## What does it cost to take one street from 20% to 40% cover?

Asked on 2026-04-08 and not answerable. [[concepts/maintenance-cost]] has a
per-tree figure and [[concepts/canopy-cover]] has a cover figure, but nothing
connects trees planted to cover reached, which depends on species and on twenty
years passing.

**What would settle it:** a growth model, or a municipality that recorded both.

## Nothing here covers irrigation practice

Two sources mention it and neither is about it. Flagged by the lint pass on
2026-04-11 and still true.
`,
    },
    {
      path: '/wiki/concepts/canopy-cover.md',
      content: `---
title: Canopy cover
updated: 2026-04-11
tags: [concept, cooling]
---

# Canopy cover

The share of ground shaded from above by tree crowns, measured at midday. The
unit the cooling literature reports against, and not the same thing as the number
of trees on a street.

## The threshold

[[sources/reyes-lindqvist-2021]] paired temperature loggers on streets of
differing cover across twelve European cities, over two summers. Below roughly
40% cover the difference between a treed and an untreed street was inconsistent:
sometimes 0.4 degrees, sometimes nothing measurable. Above 40% it became
reliable, averaging 1.9 degrees at 3pm.

The threshold is an observation from those twelve cities. The paper is explicit
that it does not propose a mechanism for why 40% rather than 30% or 50%, and
[[open-questions]] carries that as live.

## When it does not hold

[[sources/okada-2024]] measured the same kind of streets during drought and found
the effect largely gone above the threshold as well as below it. Shade is not the
whole mechanism: a transpiring tree cools the air, and a water-stressed tree
closes its stomata and stops. So cover predicts cooling only where
[[concepts/water-demand|water demand]] is being met.

## Why it is not a planting count

Cover is a function of species, spacing and elapsed time. Two streets planted
with the same number of trees on the same day reach very different cover twenty
years later, which is also why [[concepts/maintenance-cost]] is per tree and this
page is not.
`,
    },
    {
      path: '/wiki/concepts/water-demand.md',
      content: `---
title: Water demand
updated: 2026-04-11
tags: [concept, cost, cooling]
---

# Water demand

What the cooling costs in water, and the condition under which the cooling stops.

## The mechanism

A tree cools the air two ways: it shades the ground, and it transpires. Shade is
free and passive. Transpiration is the larger of the two effects in the
measurements [[sources/okada-2024]] reports, and it is the one that has a price,
because a tree only transpires while it has water to move.

Under drought the tree closes its stomata to conserve water. The shade stays and
the evaporative cooling largely goes, which is the collapse described in
[[concepts/canopy-cover]] and the reason [[overview]] treats the threshold as
conditional.

## What that means for a programme

The summers when a cooling scheme matters most are the summers when it stops
working, unless it is irrigated. That makes irrigation part of the intervention
rather than part of the upkeep, which is a budgeting distinction more than a
horticultural one: see [[concepts/maintenance-cost]], where irrigation is the
line most often left out.

There is no page here on irrigation practice itself. Two sources mention it and
neither is about it; [[open-questions]] carries the gap.
`,
    },
    {
      path: '/wiki/concepts/maintenance-cost.md',
      content: `---
title: Maintenance cost
updated: 2026-04-08
tags: [concept, cost]
---

# Maintenance cost

What a street tree costs to keep, over the period it takes to reach useful
[[concepts/canopy-cover|cover]].

## The figure

[[sources/adelaide-2019]] is a municipal record rather than a study: twenty years
of actual spending on a known population of street trees. It reports a
twenty-year cost per surviving tree, with establishment watering and early
replacement dominating the first five years and pruning dominating the rest.

Two things in it are easy to misread:

- The figure is **per surviving tree**, and the record shows a substantial share
  not surviving establishment. A cost per tree planted is meaningfully higher.
- Irrigation appears only as establishment watering. Adelaide did not irrigate
  mature street trees in the period covered, so the record says nothing about the
  cost of keeping the cooling working through drought, which
  [[concepts/water-demand]] argues is the load-bearing cost.

## Why it is not enough on its own

It answers cost per tree and not cost per degree, because nothing in the wiki
connects trees planted to cover reached. That is an open question, not an
oversight; see [[open-questions]].
`,
    },
    {
      path: '/wiki/sources/reyes-lindqvist-2021.md',
      content: `---
title: Reyes & Lindqvist 2021
updated: 2026-03-02
tags: [source, paper, cooling]
source: raw/reyes-lindqvist-2021.pdf
---

# Reyes & Lindqvist 2021

Canopy cover and daytime air temperature across twelve European cities. Paper,
2021. Raw copy at \`raw/reyes-lindqvist-2021.pdf\`.

## What they did

Paired temperature loggers on streets with differing canopy cover in twelve
cities, over two summers. Streets were matched for width, orientation and
traffic, which makes the comparison closer to like-for-like than most of this
literature manages.

## What they found

- Below roughly 40% cover the difference was **inconsistent**: sometimes 0.4
  degrees, sometimes nothing.
- Above 40% the effect became reliable, averaging 1.9 degrees at 3pm.
- Street orientation mattered nearly as much as cover. North to south streets got
  far less benefit, because the trees are not between the sun and the pavement
  for most of the day.

## What it does not say

It does not propose a mechanism for the threshold, and it says so. It also
measured only in summers without drought restrictions, which is what
[[sources/okada-2024]] later made significant.

Feeds [[concepts/canopy-cover]] and [[overview]].
`,
    },
    {
      path: '/wiki/sources/okada-2024.md',
      content: `---
title: Okada 2024
updated: 2026-03-19
tags: [source, paper, drought]
source: raw/okada-2024.pdf
---

# Okada 2024

Species water use and cooling under drought conditions. Paper, 2024. Raw copy at
\`raw/okada-2024.pdf\`.

## What they did

Measured sap flow and air temperature for six common street tree species through
two summers, one of them under municipal drought restrictions.

## What they found

- Under restriction, transpiration fell sharply and the measured cooling fell
  with it, on streets above and below the 40% cover threshold alike.
- Shade alone accounted for a minority of the cooling in the unrestricted summer.
- Recovery after rain was not immediate; cooling lagged the water by several
  days.

## Why it matters here

It is the source that turned [[concepts/canopy-cover]] from a claim into a
conditional one, and the reason [[concepts/water-demand]] exists. It contradicts
nothing in [[sources/reyes-lindqvist-2021]] directly, because that study did not
measure under drought, but it removes the reading that cover alone is sufficient.

Its supplementary data may break the effect down by species, which would settle
one of [[open-questions]]. Not yet read.
`,
    },
    {
      path: '/wiki/sources/adelaide-2019.md',
      content: `---
title: Adelaide 2019
updated: 2026-04-08
tags: [source, record, cost]
source: raw/adelaide-2019-costs.csv
---

# Adelaide 2019

Twenty-year street tree maintenance costs. Municipal record, 2019. Raw copy at
\`raw/adelaide-2019-costs.csv\`.

## What it is

Not a study. Twenty years of recorded spending against a known population of
street trees, published by the municipality. That makes it more reliable than a
modelled estimate for the things it counted, and silent on everything it did not.

## What it counted

- Establishment watering, for the first three years after planting.
- Replacement of trees lost during establishment, which was a substantial share.
- Pruning, on a cycle, dominating the cost from year five onward.
- Removal at end of life.

## What it did not count

Irrigation of mature trees, because Adelaide did not do it in this period. That
is the omission that matters most here, for the reason set out in
[[concepts/water-demand]].

Feeds [[concepts/maintenance-cost]].
`,
    },
    {
      path: '/raw/README.md',
      content: `# Raw sources

Yours, not the assistant's. The originals, as they arrived, kept so that every
claim in the wiki has something to be checked against. The assistant files things
in here and never rewrites what a source says; if a wiki page and a source
disagree, the source is right and the page is what gets fixed.

Two folders, because the thing you have and the thing the assistant can read are
not always the same file.

## \`/raw/\` - the artifact

Whatever you were given: a PDF, a screenshot, a spreadsheet, an export. Any file
can be stored here. Keep it even when the assistant cannot open it, because it is
the provenance: the wiki cites it, and you can go back to it.

## \`/raw/text/\` - the readable form

The same source as text the assistant can actually read, named to match the
original. \`report.pdf\` in the first folder becomes \`report.md\` in this one.

This second copy exists because of a hard limit worth knowing before you rely on
it: **the assistant can read text files and cannot read PDFs.** A PDF stored here
is a file it can list and cite but not open. So a PDF source needs its text
getting in some other way, which usually means you paste it, or the article
exists on the web and the assistant fetches it directly.

Once a source is in \`text/\`, it is read once and compiled into the wiki. After
that the wiki is what gets read; you come back here to check a claim, not to
re-read the source.

## Putting things in

Drag them onto the File Explorer, or use Upload files, and tell the assistant they
are there. Drop them anywhere; it sorts them out. Originals end up in \`/raw/\`,
readable copies in \`/raw/text/\`, and anything it cannot read gets named so you
know which ones still need their text.

## What is here now

Nothing. The three sources this wiki was built from are named in
\`/wiki/sources/\` and stand in for papers you would have put here yourself.
`,
    },
    {
      path: '/styles/style.css',
      content: `${templateStylesheet({ hue: 32, radius: 6 })}

/* Everything above is the shared theme. This template tightens the corners to
   6px, which is the one density change the spec allows and what makes a
   reference tool read as a reference tool rather than a marketing page.
   Below is only what a two-pane reader needs and the components have no rule
   for. */

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

/* Catalogue on the left, the open page on the right, and one column as soon as
   there is not room for two. Both panes scroll on their own so the list does not
   run away while a long page is being read. */
.shell {
  display: grid;
  grid-template-columns: minmax(0, 22rem) minmax(0, 1fr);
  min-height: 100vh;
}

.sidebar {
  border-right: 1px solid var(--line);
  padding: 1.5rem 1.25rem 3rem;
  overflow-y: auto;
  max-height: 100vh;
  background: var(--base);
}

.reader {
  padding: 2.25rem clamp(1.25rem, 4vw, 3rem) 5rem;
  overflow-y: auto;
  max-height: 100vh;
}

@media (max-width: 860px) {
  .shell {
    grid-template-columns: minmax(0, 1fr);
  }

  .sidebar {
    border-right: 0;
    border-bottom: 1px solid var(--line);
    max-height: none;
    overflow: visible;
  }

  .reader {
    max-height: none;
    overflow: visible;
  }
}

.sidebar-head {
  margin-bottom: 1.25rem;
}

/* The shared .brand styles an <a>; this one is a <button>, so the button look
   is stripped and the pointer is what says it does something. */
button.brand {
  border: 0;
  background: none;
  padding: 0;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.desc {
  font-size: 0.875rem;
  margin-top: 0.35rem;
}

.search {
  margin-bottom: 0.85rem;
}

.filters {
  margin-bottom: 0.6rem;
}

.count {
  margin: 1.25rem 0 0.6rem;
}

/* A row in the list is a whole button, so the click target is the row rather
   than the title inside it. */
ul.pages {
  margin: 0;
  padding: 0;
  list-style: none;
}

.pages .list-item,
.backlinks .list-item {
  padding: 0;
  display: block;
}

.row {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  width: 100%;
  padding: 0.8rem 1rem;
  border: 0;
  background: none;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.path {
  font-family: var(--mono);
  font-size: 0.6875rem;
  color: var(--ink-faint);
}

.badges {
  margin-top: 0.35rem;
  gap: 0.3rem;
}

/* The open page keeps the accent on its left edge, which is the only place on
   this page the accent appears twice. */
.pages .is-open {
  box-shadow: inset 2px 0 0 var(--accent);
  background: var(--raised);
}

.reader h2 {
  margin: 0.4rem 0 1.25rem;
}

/* A page's own subheads come through as h2 and h3. The shared h2 is sized for a
   page heading, which puts them within a hair of the title above them; in the
   reading column they take the size .read h3 is drawn at. */
.read h2 {
  font-size: 1.0625rem;
  letter-spacing: -0.01em;
  margin: 1.75rem 0 0.5rem;
}

/* The front screen. Wider than the reading column, because it is a set of cards
   rather than prose, and it is the first thing anyone sees. */
.start {
  max-width: 52rem;
}

.start h2 {
  margin: 0.4rem 0 0.75rem;
}

.start .lede {
  margin-bottom: 1.75rem;
}

.start .cards {
  margin-bottom: 1.5rem;
}

.start .hint {
  font-size: 0.8125rem;
  max-width: var(--measure);
}

/* A link to another page in the wiki. Underlined rather than coloured, because
   a page of prose can hold a lot of them and an accent on each would be the
   loudest thing on the screen. */
.wikilink {
  color: var(--ink);
  text-decoration-color: var(--accent);
  text-decoration-thickness: 1px;
  text-underline-offset: 2px;
  cursor: pointer;
}

.wikilink:hover {
  color: var(--accent-text);
}

/* A link to a page that does not exist. Not an error: the assistant refers to
   pages before it writes them, and this is how you see which are owed. */
.wikilink.is-missing {
  color: var(--ink-faint);
  text-decoration-style: dashed;
  text-decoration-color: var(--ink-faint);
}

.wikilink.is-missing::after {
  content: "?";
  font-size: 0.75em;
  vertical-align: super;
}

.backlinks {
  margin-top: 2.5rem;
  max-width: var(--measure);
}

.backlinks .label {
  margin-bottom: 0.6rem;
}

.reader .notice {
  margin-top: 1rem;
}`,
    },
    {
      path: '/.PROMPT.md',
      content: `${STATIC_DOMAIN_PROMPT}

---

# This project: an LLM Wiki

The user curates; you maintain. They bring sources and ask questions. You write
every page, every cross-reference and every log entry. These instructions are
what make that work, and following them is most of the job.

An implementation of the LLM Wiki pattern described by Andrej Karpathy:
<https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f>. The pattern
is his; the conventions below are one way of instantiating it. If one of them
does not suit the subject, say so and suggest the change rather than drifting
away from it quietly.

## Why this is not retrieval

The usual way to use an LLM with documents is to search a pile of them at
question time. Nothing accumulates: every question re-derives its answer from raw
text, and the tenth question knows no more than the first.

Here you compile the knowledge once and then keep it current. When a source
arrives you read it, fold what it says into the pages it touches, and note where
it contradicts what was already there. The synthesis, the cross-references and
the contradictions are on disk before anyone asks. **The wiki is the artifact
that compounds; the chat is not.** Answering well and leaving the wiki unchanged
is the failure mode to watch for in yourself.

## The three layers

**\`/raw/\` belongs to the user.** Sources as they came, in two folders because
what they have and what you can read are not always the same file. \`/raw/\` holds
the artifact: the PDF, the screenshot, the export, kept because the wiki cites it
and someone may need to check it. \`/raw/text/\` holds the readable form, named to
match, so \`report.pdf\` becomes \`text/report.md\`.

You file things in here and you never change what a source says. Moving something
the user dropped in, or writing a source's text into \`/raw/text/\`, is filing, and
you do that. Rewriting the contents of a source is not. If a wiki page and a
source disagree, the source is right and the page is what needs fixing.

One hard limit: **you can read text and you cannot read a PDF.** A PDF in here is
a file you can list, move and cite, and cannot open. That is what the second
folder is for. Say so plainly rather than summarising a document nobody has
actually given you.

**\`/wiki/\` belongs to you.** Every file in it is yours to write and to keep
consistent. The user reads it and can edit it, so if they say they have, re-read
the page before touching it rather than overwriting their edit on the next
ingest.

**This file is the schema.** It is injected into your instructions on every
conversation, and the user does not see it. So two things follow: it is the only
place a convention survives between sessions, and it is not where you explain
anything to them. Explain in chat, and in the wiki. If a convention here turns
out to be wrong for the subject, tell the user what you would change and why, and
let them decide.

## Getting a source in

Four routes. Work out which one is in play before ingesting, because they do not
all end with the same thing on disk.

**Files the user drops in.** The most direct route and the one to expect. They
drag sources onto the File Explorer, or use Upload files, and tell you they are
there. **They are not expected to put them anywhere in particular.** Sorting them
is your job, and saying otherwise pushes work onto them that this project exists
to remove.

What you do: work out which files are new, move each original into \`/raw/\`, put a
readable copy in \`/raw/text/\` under a matching name where you can read it, and
name the ones you cannot so they know which still need their text. Do not start
ingesting a pile without asking which to take first.

Where files land is yours to know. An external drop arrives at the **project
root** whatever folder row it was aimed at, so the root is where you look for new
files, not \`/raw/\`. A dropped folder keeps its structure, so nested sources stay
nested. A lone \`.zip\` opens the import preview instead of becoming a file, and
that dialog can either bring its contents in or keep the zip itself; either way
you pick up whatever lands in the project.

**A link.** Fetch and convert it yourself:

\`\`\`bash
curl --markdown https://example.com/article -o raw/text/article.md
\`\`\`

This needs web access permission and is the cleanest route, because the text
lands in the project already readable and already attributed to a URL. Put the
URL in the source page's front matter so the provenance survives.

**Text pasted into chat.** Write it to \`/raw/text/<slug>.md\` before ingesting,
rather than working from the message. A source that only exists in the
conversation cannot be re-read later, and the wiki page citing it will point at
nothing.

**A file added by hand.** If it is text, read it. If it is a PDF or a scan, you
cannot, and should not pretend otherwise: ask for the text, or for the web
version if one exists. The original stays in \`/raw/\` either way, because it is
the receipt.

There is also \`search "query"\` for finding sources rather than reading one. It
belongs to lint more than to ingest: the gaps are easier to see from inside the
wiki than from outside it.

## The three operations

These three are the whole workflow. They are also the suggestions above the
message box, so expect them to arrive as bare requests.

### Ingest

A source needs to get into the wiki.

1. Get it filed by whichever of the four routes applies, so the original is in
   \`/raw/\` and its text is in \`/raw/text/\`. Then read it, say what is actually in
   it before writing anything, and flag straight away if it contradicts what the
   wiki already claims.
2. Write \`/wiki/sources/<slug>.md\`: what they did, what they found, what it does
   not say. That last section is what stops a source being over-read.
3. Update every page the source touches. One source usually moves several: a
   concept page gains a section, the synthesis gets revised, an open question
   gets closed or sharpened. **This is the work.** Filing the summary and
   stopping is the failure mode.
4. Create concept pages for anything the source introduces that deserves to be
   referred to from more than one place.
5. Add the new pages to \`/wiki/index.md\`.
6. Append one entry to \`/wiki/log.md\`.

Ingest one source at a time unless told otherwise, and stay in conversation while
doing it. Batch ingestion is possible and is worse: it is where the
cross-referencing quietly stops happening.

### Query

A question, to be answered from the wiki. Search it, read what is relevant, and
answer with citations to the pages the answer came from.

Then the part that is easy to skip: **if the answer was worth asking for, file
it.** A comparison, an analysis, a connection nobody had written down is a new
page, not a chat message that scrolls away. Ask first if it is unclear whether it
earns a page.

If the wiki cannot answer, say so plainly and add the question to
\`/wiki/open-questions.md\` with a line on what would settle it. An answer invented
to be helpful is worse than a gap that is recorded.

### Lint

A health check across the wiki. Report:

- **Contradictions** between pages that nobody has reconciled.
- **Stale claims** a newer source has superseded.
- **Orphans**: pages nothing links to. The page shows this at the foot of every
  entry, so it is visible without asking.
- **Missing pages**: a \`[[link]]\` to something never written. The page draws
  these dashed with a question mark.
- **Pages missing from the index**, which are invisible in the sidebar.
- **Gaps**: something two sources mention and no page covers.
- **Findable gaps**: a question the wiki carries that a search might answer. With
  web access, run \`search\` and propose sources; suggest, do not ingest unasked.

Report first, fix second, and ask before doing anything sweeping.

## Conventions

**Links.** \`[[concepts/canopy-cover]]\` or \`[[canopy-cover]]\`, and
\`[[concepts/canopy-cover|canopy cover]]\` when the sentence needs different words.
A bare name matching two pages resolves to neither, on purpose, so write the path
when there is any doubt. Link generously: the links are what make this a wiki
rather than a folder.

**Front matter.** \`title\`, \`updated\`, and \`tags\` as an inline list. A source page
adds \`source\`: the path in \`/raw/\` or the URL it came from, so a claim can be
traced without opening the page body. The tags become the filter pills in the
sidebar, so keep the vocabulary small and reuse it rather than inventing a tag
per page.

**index.md** is the catalogue and the sidebar is built from it. Adding a page
without listing it there hides the page. Group entries under the same headings
the folders use.

**log.md** is append-only, newest at the bottom, every entry opening
\`## [YYYY-MM-DD] ingest|query|lint | subject\`. Never rewrite history in it; a
correction is a new entry.

**Page shape.** Sources get "what they did / what they found / what it does not
say". Concepts get the claim, then where it does not hold. The synthesis in
\`overview.md\` gets the current thesis and what would change it. Write plainly and
commit to a position: a page that hedges everything records nothing.

## What the page does

A reader over \`/wiki/\`, in three plain scripts with no build step:
\`/src/lib/markdown.js\` renders, \`/src/lib/wiki.js\` parses the catalogue and the
links, \`/src/app.js\` drives the page. They are classic scripts sharing window
namespaces, not ES modules, because the preview serves scripts from blob URLs
and a module loaded from a blob cannot resolve imports between project files.
Keep any new script classic and keep the load order in \`/index.html\`. It loads \`index.md\`, then every page listed
there, which is what lets it offer full-text search and show what links to what
without a search index to keep in step. That also sets the ceiling: a few hundred
pages is a lot of requests, and the point at which the right move is a real index
that you maintain. Until then, \`rg\` across \`/wiki/\` is the search tool you
already have.

\`/README.md\` is the user's copy of how this works, and the page's own front
screen says the same thing. If the workflow changes, those two are where the user
finds out, because they never see this file.

There is no bundle and no compiler: an edit is live on the next preview refresh.
Keep it that way; this app is small enough that a framework would cost more to
carry than it saves.

The page **only reads**. There is no editing in the browser, because a static
page cannot write back to the project: an edit box would either lose the change
on reload or hide it in browser storage where you cannot see it, and the wiki
would then disagree with the files. If the user asks for one, explain the trade
rather than building something that silently loses their work.

## Starting a new subject

The seed wiki is a small real-shaped one about street trees and summer heat,
there to show the conventions rather than because the subject matters. When the
user brings their own subject, clear \`/wiki/\` and start the index, the log and
the overview from their first source. \`/raw/\` is already empty, and the three
sources the sample pages cite were never in it: they are named to show what a
citation looks like. Do not leave sample pages beside real ones; a wiki with
somebody else's content in it is one people stop trusting.

${TEMPLATE_STYLE_PROMPT}
`,
    },
  ],
};
