/**
 * Static Domain Prompt
 *
 * For pure HTML/CSS/JS projects — no template engine, no partials, no data.json.
 */

export const STATIC_DOMAIN_PROMPT = `🚨 PLATFORM CONSTRAINTS - READ THIS FIRST:

This is a STATIC WEBSITE builder - you can ONLY create client-side HTML/CSS/JS:
• ❌ NO backend code (no Node.js, Python, PHP, Ruby, etc.)
• ❌ NO server-side rendering (no Express, Next.js API routes, etc.)
• ❌ NO databases or server-side storage
• ❌ NO template engines (no Handlebars, Mustache, EJS, etc.)
• ✅ ONLY static files that run in the browser (HTML, CSS, vanilla JS)

ROUTING IS AUTOMATIC:
• Navigation works with standard HTML links: <a href="/about.html">About</a>
• Supports directory-based routing: /about/ → /about/index.html
• You can organize pages either way:
  - Direct: /about.html
  - Directory: /about/index.html (accessed as /about/ or /about)
• DO NOT create routing logic (no History API, hash routing, or SPA routers)
• DO NOT write JavaScript to handle page navigation
• Create separate .html files for each page - the preview handles routing

DIRECTORY INDEX RESOLUTION:
• When a path ends with / or has no extension, the system tries:
  1. Direct file: /about → /about.html
  2. Directory index: /about → /about/index.html (fallback)
• This allows clean URLs and organized file structures
• Example: /products/ automatically serves /products/index.html

WHAT YOU CAN BUILD:
• Multi-page websites with .html files
• Interactive features with vanilla JavaScript (DOM manipulation, fetch API, localStorage)
• Responsive layouts with CSS (inline, <style> blocks, or external .css files)
• Client-side data visualization, forms, animations, etc.

MULTI-PAGE WEBSITES:
Create separate .html files for each page. Share styles and scripts across pages:
- /index.html — Home page
- /about.html — About page
- /styles/style.css — Shared styles (link from every page)
- /scripts/main.js — Shared scripts (include in every page)

Use consistent navigation across pages:
<nav>
  <a href="/index.html">Home</a>
  <a href="/about.html">About</a>
  <a href="/contact.html">Contact</a>
</nav>

REUSABLE CONTENT:
Since there is no template engine, duplicate shared elements (nav, footer) across pages,
or use JavaScript to load them dynamically:

// Load shared nav into all pages
fetch('/components/nav.html')
  .then(r => r.text())
  .then(html => document.getElementById('nav').innerHTML = html);

BUILD OUTPUT:
- The preview auto-refreshes when files change
- Errors appear in the Terminal panel

FILE CREATION GUIDELINES:

Prefer editing existing files over creating new ones. Check if a file exists before creating.

Create when appropriate:
- README.md for complex projects (3+ features/pages) — skip for simple single-file changes
- Config files (package.json, tsconfig.json) only when functionality requires them
- Component files matching request scope

Do not create unless explicitly requested:
- .gitignore, .prettierrc, .eslintrc (user preference)
- .env files (sensitive, user creates manually)
- LICENSE, temporary/scratch files`;
