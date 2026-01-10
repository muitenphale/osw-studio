# What's New

Welcome to OSW Studio! This page highlights the latest features and updates.

**First time here?** Start with the **[Overview](?doc=overview)** or jump straight to **[Getting Started](?doc=getting-started)** to build your first website in 5 minutes.

---

## v1.22.0 - QuickJS WASM Sandbox

Edge and server functions now run in a QuickJS WebAssembly sandbox for stronger security isolation.

- **WASM Isolation** - Separate JavaScript engine via WebAssembly boundary
- **Memory Limits** - 64MB default, enforced by WASM runtime
- **Fetch Security** - 10 requests max, 10s timeout, 5MB limit, private IPs blocked in production
- **Base64 Support** - Added `atob()` and `btoa()` functions

Your existing functions work unchanged with the same API surface.

---

## v1.21.0 - Dashboard for Browser Mode

The dashboard is now available in browser mode and is the default landing page for both modes.

- **Dashboard for Browser Mode** - Dashboard now available in browser mode (previously server mode only)
- **Dashboard as Landing Page** - Dashboard is the default landing page for both modes
- **Quick Actions Bar** - Create projects, start guided tour, join Discord, and access docs
- **What's New Component** - Shows latest version highlights with link to full changelog
- **Recent Projects** - Quick access to recently updated projects from dashboard

---

## v1.20.0 - Admin Dashboard for server mode

A new dashboard is now the landing page after login, giving you a quick overview of your server:

- **System** - OSWS version, Node.js version, uptime, memory usage
- **Content** - Projects, templates, skills, and total files
- **Hosting** - Published sites, sites with databases, storage used
- **Traffic** - Requests per hour/day, error counts, top sites, recent errors

Traffic is logged server-side with automatic 7-day retention.

---

## v1.19.0 - Server Mode Backend Features

This release adds complete backend functionality for published sites, including edge functions, database management, server functions, secrets, and AI integration.

### Edge Functions

Create serverless JavaScript endpoints for your published sites:

- **REST API endpoints** - GET, POST, PUT, DELETE, or ANY method
- **Database access** - Query your site's SQLite database via `db.query()` and `db.run()`
- **External requests** - Use `fetch()` to call external APIs
- **Sandboxed execution** - Safe VM-based runtime with configurable timeouts (1-30 seconds)
- **Secrets access** - Use `secrets.get()`, `secrets.has()`, `secrets.list()` for API keys

```javascript
// Example: GET /api/sites/{siteId}/functions/get-users
const users = db.query('SELECT * FROM users LIMIT 10');
Response.json({ users });
```

### Server Functions (Helpers)

Create reusable JavaScript helpers callable from edge functions:

- **Code reuse** - Define shared logic once, use across all edge functions via `server.functionName()`
- **Same security model** - Runs in the same sandboxed VM as edge functions
- **Full access** - Helpers have access to `db`, `fetch`, and `console`

```javascript
// Server function "validateAuth"
const [apiKey] = args;
const users = db.query('SELECT * FROM users WHERE api_key = ?', [apiKey]);
return users.length > 0 ? { valid: true, user: users[0] } : { valid: false };
```

### Secrets Management

Encrypted storage for API keys and tokens:

- AES-256-GCM encryption with unique IVs per secret
- Admin-only access, values never logged or exposed
- AI can create secret placeholders, user sets values in admin UI

### Database Tools

- **SQL Editor** - Execute raw SQL queries with Monaco editor and query history
- **Schema Viewer** - Browse database structure with expandable table/column tree
- **Execution Logs** - Monitor function invocations with status, duration, timestamps

### Server Context Integration

The AI can now understand and work with your site's server features! When you select a site:

- **Site Selector** dropdown in workspace header to choose site context
- **`/.server/` hidden folder** with transient files containing server context
- AI receives edge functions, database schema, server functions, and secret names

#### The `/.server/` Folder

A hidden folder appears in the file explorer (right-click → "Show Hidden Files"):

- `db/schema.sql` - Database schema (read-only, use sqlite3 for DDL)
- `edge-functions/*.json` - Edge functions (editable)
- `server-functions/*.json` - Server functions (editable)
- `secrets/*.json` - Secret placeholders (editable - AI creates, user sets values)

### AI Read-Write Access to Server Features

The AI can create, modify, and delete server features:

#### SQL Queries with `sqlite3`

```
sqlite3 "SELECT * FROM products"
sqlite3 -json "SELECT * FROM users WHERE active = 1"
sqlite3 "CREATE TABLE orders (id INTEGER PRIMARY KEY, total REAL)"
```

System tables are protected from modification.

#### Creating Functions

Ask the AI to create endpoints or helpers:

```
Create an edge function called "list-products" that returns all products
```

Functions are stored as JSON files:

```json
{
  "name": "list-products",
  "method": "GET",
  "enabled": true,
  "timeoutMs": 5000,
  "code": "Response.json(db.query('SELECT * FROM products'));"
}
```

### Edge Function Routing for Published Sites

Published sites can call edge functions using simple paths like `/submit-contact` instead of the full API URL.

A lightweight interceptor script (~1.5KB) is injected into published HTML that:
- Intercepts `fetch()` and `XMLHttpRequest` calls
- Detects paths without file extensions (e.g., `/submit-contact`, not `/styles.css`)
- Routes them to `/api/sites/{siteId}/functions/{path}`
- Handles form submissions automatically

```javascript
// Your frontend code - simple and clean!
const response = await fetch('/submit-contact', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'John', email: 'john@example.com' })
});
```

Forms work automatically too:
```html
<form action="/submit-contact" method="POST">
  <input name="email" type="email" required>
  <button type="submit">Subscribe</button>
</form>
```

Custom events for response handling:
```javascript
document.addEventListener('edge-function-response', (e) => {
  console.log('Result:', e.detail.result);
});

document.addEventListener('edge-function-error', (e) => {
  console.error('Error:', e.detail.error);
});
```

### Preview Edge Function Support

The live preview now supports edge function routing when a site is selected. Test your edge functions directly in the preview without publishing first.

**[Server Features Guide →](?doc=server-features)** | **[Server Mode Guide →](?doc=server-mode)** | **[Edge Functions Guide →](?doc=edge-functions)**

---

## v1.18.0

### SQLite Migration - Simpler Server Mode

Server Mode now uses SQLite instead of PostgreSQL. This means:

- **Zero database setup** - No need to install or configure PostgreSQL
- **Just run it** - `npm install && npm start` is all you need
- **Portable** - All data stored in local files, easy to backup and move

### Per-Site Databases

Each published site now has its own SQLite database containing its files, settings, and analytics. This keeps sites isolated from each other.

**Storage structure:**
- `data/osws.sqlite` - Your projects, templates, and skills
- `sites/{siteId}/site.sqlite` - Each site's files and analytics

### Breaking Change

PostgreSQL is no longer supported. If you have an existing Server Mode deployment with PostgreSQL, you'll need to migrate your data manually.

**[Server Mode Guide →](?doc=server-mode)**

---

## v1.17.0

### Reasoning Token Support

See what the AI is thinking! Models with reasoning capabilities now display their thought process in a collapsible "reasoning" block in the chat panel.

- **Anthropic extended thinking** - Claude models with thinking enabled
- **DeepSeek reasoning models** - DeepSeek v3.2 and other reasoning-capable models
- **Gemini thinking models** - Gemini Pro 3 with thinking enabled

### Reasoning Toggle

Enable or disable reasoning on a per-model basis directly from the model selector. The toggle appears for models that support it.

### Malformed Tool Call Detection

The AI now auto-detects when a model accidentally writes tool syntax as text instead of properly invoking functions, and automatically prompts it to retry correctly.

### UI Improvements

- Renamed "Thinking..." indicator to "Waiting for response..." for clarity
- Fixed indicator sometimes persisting after the response completed

---

## v1.16.0

### Server Mode

Self-host OSW Studio for a complete web publishing platform. Server Mode adds:

- **Admin authentication** - Password-protected admin area
- **Project sync** - Push projects to the server, pull them back to any browser
- **Static site publishing** - Publish projects directly at `/sites/{siteId}/` with clean URLs
- **Site settings** - Configure scripts, analytics, SEO meta tags, and compliance (cookie consent, GDPR)
- **Built-in analytics** - Privacy-focused tracking, or integrate Google Analytics, Plausible, and more
- **Auto-generated files** - Sitemap.xml and robots.txt created on publish

Server Mode is optional and requires setup. It's still being actively developed - expect improvements to authentication, publishing, and site management in future releases.

**[Server Mode Guide →](?doc=server-mode)**

### In-App Documentation

Browse all documentation without leaving OSW Studio. Access guides from the sidebar under Docs.

### Gemini Thinking Model Support

Full compatibility with Gemini thinking models via OpenRouter.

### Skills System Enhancements

- Split `osw-workflow` into focused skills: `osw-planning` (multi-page sites) and `osw-one-shot` (landing pages)
- Skills now appear in the project structure shown to AI

### Debug Panel Terminal

The Debug panel now includes a terminal for testing VFS shell commands directly.

---

## v1.15.0

- **Skills System** - Create, import, and export AI skills with markdown-based editor
- **Built-in skills** - OSW Workflow, Handlebars Advanced, Accessibility (WCAG 2.1 AA)
- **Skills tab** - New tab alongside Projects and Templates

---

## v1.14.0

- **Event-driven chat** - Real-time event streaming with improved UI responsiveness
- **Debug panel** - Real-time event monitoring with filtering and auto-scroll
- **Handlebars subdirectories** - Organize templates in `/templates/components/`, `/templates/partials/`, etc.

---

## v1.13.0

- **Templates system** - Create, export, and import reusable project templates
- **Template browser** - Grid/list views, search, and sorting
- **Project screenshots** - Automatic preview captures

---

## v1.12.0

- Rebranded from DeepStudio to OSW Studio
- Dual mode system: Chat mode (read-only) and Code mode (full editing)
- Consolidated IndexedDB architecture

---

## v1.0.0

- 8 AI providers (OpenRouter, OpenAI, Anthropic, Google, Groq, Ollama, LM Studio, SambaNova)
- Virtual file system with project management
- Live preview with real-time updates
- Multi-tab Monaco editor
- Export to ZIP for deployment

---

**Ready to go?** Head back to **[Projects](?nav=projects)** or **[browse all docs](?doc=overview)**.
