# What's New

Welcome to OSW Studio! This page highlights the latest features and updates.

**First time here?** Start with the **[Overview](?doc=overview)** or jump straight to **[Getting Started](?doc=getting-started)** to build your first website in 5 minutes.

---

## v1.35.0 - Prompt Architecture & Shell Improvements (2026-02-25)

The AI system prompt no longer hard-codes website instructions. Domain knowledge now lives in a per-project `.PROMPT.md` file that the AI reads at conversation start, making OSW Studio adaptable to non-website projects.

- **Per-Project `.PROMPT.md`** - Each project can have a `/.PROMPT.md` file containing domain-specific instructions for the AI. All built-in templates ship with one pre-filled. Existing projects without it see a subtle banner offering to add the default
- **Configurable Entry Point** - Right-click any file in the explorer and choose "Set as Entry Point" to change which file the preview loads first. The entry point shows a green Home icon
- **Template Rename: "Blank" → "Website Starter"** - The Blank template is now called "Website Starter" to better describe its purpose
- **Tool Rename: `json_patch` → `write`** - The file editing tool was renamed for better LLM compatibility. Same behavior, better tool selection
- **Shell Pipes & Redirects** - Commands can now be chained with `|` and output redirected with `>` / `>>`
- **`sed` Command** - New text substitution command with `s/pattern/replacement/[g]` syntax
- **Repeat Helpers** - Added `{{#times N}}`, `{{#repeat N}}`, and `{{#for N}}` Handlebars block helpers

---

## v1.34.0 - Project-Scoped Backend & Deployments (2026-02-22)

Backend features are now managed at the **project level** instead of per-deployment, and "Sites" have been renamed to **"Deployments"** throughout the app.

- **Project-Scoped Backend** - Edge functions, server functions, secrets, scheduled functions, and database schema now live on the project. When you publish, they're automatically extracted into the deployment's runtime. This means one project can power multiple deployments, and your backend travels with the project
- **Per-Project Database** - Each project can have its own SQLite database for user-defined tables. Create tables via the schema editor, query them from edge functions, and they'll be included when you publish
- **"Sites" → "Deployments"** - What was called a "Site" is now a "Deployment" — the UI, API routes, URL paths, and admin views all reflect this. Existing databases migrate automatically
- **"Server Features" → "Backend"** - The toolbar button, template badges, and docs now use "Backend" instead of "Server Features"
- **Project Backend Panel** - New tabbed modal (accessible from the toolbar or project card menu) for managing all backend features in one place. The schema editor has been rewritten with three tabs: Tables (live schema viewer), SQL (query editor), and DDL (apply schema changes)
- **Deployment Selector** - New dropdown in the workspace header to pick which deployment's runtime context the AI should know about
- **Project Swap** - When repointing a deployment to a different project, a conflict dialog shows what will be added, removed, or changed so you can review before confirming
- **Unified Templates** - The separate "Site template" type is gone. All templates now use a single format with an optional `backendFeatures` field. Older `.oswt` files still import correctly
- **Split Databases** - Each deployment now has separate `runtime.sqlite` and `analytics.sqlite` files instead of one unified database. Existing deployments migrate automatically on first access

### Upgrading (Server Mode)

**Back up your `data/` and `sites/` directories before updating.** This release includes significant database and directory migrations that run automatically on first access:

- The `sites/` directory is renamed to `deployments/`
- Each unified `site.sqlite` is split into `runtime.sqlite` + `analytics.sqlite`
- API routes move from `/api/sites/*` to `/api/deployments/*`

The migrations are designed to be seamless, but given the scope of changes, a backup ensures you can roll back if anything goes wrong. Browser Mode users are unaffected.

---

## v1.33.0 - Checkpoint Rework (2026-02-19)

The checkpoint system has been redesigned with a new panel and a clearer lifecycle.

- **Checkpoints Panel** - New panel in the workspace to view, jump to, and restore any checkpoint from your session
- **Starting Point** - Opening a project now creates a permanent "Starting point" checkpoint. "Discard Changes" always takes you back here, no matter how many saves you've made
- **Stacking Saves** - Manual saves now accumulate instead of replacing each other, so you can jump between any saved state
- **Smart Eviction** - Only auto-checkpoints count toward the 50-checkpoint limit. Your manual saves and the starting point are never removed
- **Default Provider** - Self-hosted instances can set a default AI provider via `NEXT_PUBLIC_DEFAULT_PROVIDER`
- **Setup Guidance** - Chat input is now disabled when no API key is configured, and the model selector button highlights to guide you to settings

---

## v1.32.0 - Anonymous Usage Analytics (2026-02-18)

OSW Studio now includes lightweight, anonymous telemetry to help understand which features get used, which providers and models are popular, and where things are breaking. No prompts, code, file names, API keys, or error messages are ever collected.

- **What's tracked** - Page views, provider/model selection, task success/failure rates, tool call outcomes, API error types, and session heartbeats
- **Anonymous visitor ID** - A random UUID stored in localStorage counts unique visitors. It's not tied to any account or personal data and resets if you clear browser storage
- **Opt-out** - Toggle "Anonymous Usage Analytics" off in Settings > Application Settings. A first-run disclosure dialog explains everything on your first visit
- **Transparent** - Built with [osw-analytics](https://github.com/o-stahl/osw-analytics), an open-source analytics system (currently in testing, be sure to star it to get notified when it's done)
- **Low impact** - Events are batched and sent every 30 seconds. If the analytics server is unreachable, events are silently dropped. The app never blocks on telemetry

Self-hosted instances can disable telemetry entirely with `NEXT_PUBLIC_TELEMETRY_ENABLED=false` in `.env` or keep them on to help out with the development.

---

## v1.31.0 - HuggingFace Provider & Settings Refresh (2026-02-15)

HuggingFace is now available as an AI provider. Every HuggingFace account includes $0.10/month in free inference credits.

- **HuggingFace Provider** - New provider in Settings with access to 120+ models across multiple inference backends (Cerebras, Fireworks, Groq, Together, SambaNova, and more) through HuggingFace's unified API
- **Two Auth Methods** - Sign in with OAuth (on HuggingFace Spaces) or paste an API access token (everywhere)
- **Dynamic Model Discovery** - Models are fetched live from HuggingFace with full metadata: context length, tool support, vision capability, and per-model pricing
- **Cost Tracking** - Pricing from the HuggingFace API is automatically registered for accurate session and project cost calculations
- **Credit Limit Handling** - Friendly error message when your free monthly credits are exhausted, with a link to upgrade
- **Refreshed Settings UI** - Both the Model Settings and Settings popups have been redesigned with a cleaner, more compact layout. All providers now use a unified connect/disconnect flow — paste your API key, click Connect (validates first), and see a clean connection badge with a Disconnect option.
- **Bug Fix** - Fixed model selector dropdown overflowing past the bottom of the viewport

### Setup

1. In OSW Studio settings, select **HuggingFace** as your AI provider
2. Go to [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens) and create a token with "Make calls to Inference Providers" permission
3. Paste the token and click **Connect**
4. Pick a model and start building — no API costs until you exceed your free credits

---

## v1.30.0 - Codex Generation (2026-02-14)

Use your ChatGPT Plus/Pro subscription to generate code directly in OSW Studio. The new Codex adapter translates between our standard format and the Codex Responses API entirely server-side — the editor, preview, and chat all work exactly as before.

- **Codex Generation** - The "Codex (ChatGPT Sub)" provider now supports full generation with streaming responses and tool calls (shell, json_patch).
- **GPT-5.3 Codex** - New default model. Also available: GPT-5.2 Codex, GPT-5.1 Codex, GPT-5.1 Codex Mini, Codex Mini, and the general-purpose GPT-5.2 and GPT-5.1.
- **Usage Limit Handling** - Clear error messages with estimated retry time when you hit your ChatGPT subscription limits.
- **Compact Auth Panel** - Tighter layout with the "Disconnect" button inline. A warning banner notes the experimental nature of this provider.
- **Secure Auth** - Your ChatGPT refresh token is stored in an HttpOnly cookie, so page scripts can't read it. Only the short-lived access token (~1 hour) is kept in localStorage.
- **Bug Fix** - Fixed parallel tool calls showing stuck spinners. Status updates (executing/completed) now correctly map to the right tool when the AI runs multiple tools at once.
- **Bug Fix** - Fixed streaming parameter deltas not grouping properly during parallel tool execution.

### Setup

1. Install the [Codex CLI](https://github.com/openai/codex): `npm i -g @openai/codex`
2. Run `codex login` and follow the browser prompts
3. Copy your token: `cat ~/.codex/auth.json | pbcopy`
4. In OSW Studio settings, select **Codex (ChatGPT Sub)** and paste the token JSON
5. Pick a model and start building

---

## v1.29.0 (2026-02-13)

- **User-Managed Thumbnails** - Capture, upload, or remove thumbnails on project and site cards via icon buttons in the thumbnail area. The workspace preview toolbar also has a capture button. Uploaded images are automatically compressed. Auto-capture on save/publish has been removed.
- **Server Mode Fixes** - Edge function calls in the preview now work when a site is selected after initial load; `/.server/` folder refreshes automatically after AI operations; AI can create and modify scheduled functions; edge functions resolve by slug

---

## v1.28.0 - Scheduled Functions (2026-02-10)

Run edge functions automatically on a cron schedule. Set up daily cleanups, hourly stats aggregation, weekly report emails, or any recurring task — all managed from the admin UI.

- **Scheduled Functions** - New **Schedules** tab in Server Settings to create, edit, enable/disable, and delete cron-triggered functions
- **Cron Scheduling** - Standard 5-field cron expressions with timezone support (e.g., `0 8 * * *` for daily at 8am)
- **Custom Config** - Pass a JSON object as the request body to the linked edge function on each run
- **Execution Tracking** - Each schedule shows next run time, last status (success/error), and last run time
- **AI Awareness** - The AI can see and create scheduled functions via `/.server/scheduled-functions/` context files

**See**: [Backend → Scheduled Functions](?doc=backend-features#scheduled-functions-cron-jobs) for the full guide with examples.

---

## v1.27.0 - Site Templates (2026-02-06)

A new template type that bundles both frontend files AND backend infrastructure definitions. Site templates include edge functions, server functions, database schema, and secrets metadata — everything needed to deploy a full-stack site in Server Mode.

- **Site Templates** - New template type with backend infrastructure definitions
- **Built-in Site Templates** - Two new built-in templates:
  - **Landing Page with Contact Form** - Professional landing page with working contact form, Resend email integration, and message database (2 edge functions, database schema)
  - **Blog with Comments** - Blog platform with posts, comments, and content moderation (3 edge functions, server function, database schema)
- **Automatic Backend Provisioning** - In Server Mode, creating a project from a site template automatically syncs to the server, creates a site, and provisions all backend features (database schema, edge functions, server functions, secret placeholders) in one step
- **Export from Sites** - Export any published site as a site template directly from the Sites view; backend features are automatically captured
- **Type Filter** - Filter templates by type (All, Project, Site) in the template browser
- **Template Format v2.0** - Extended `.oswt` format with `siteFeatures` object for backend definitions
- **Graceful Degradation** - Site templates work in Browser Mode (frontend files only); toast notification about Server Mode for backend features
- **Improved Blog Template** - Blog posts are now static HTML pages with Handlebars partials (navigation, footer, comments) instead of dynamically loaded from the database. Post links work correctly when published under `/sites/{siteId}/`
- **Async Edge Functions** - Edge functions now support `await` for calling external APIs (e.g., sending emails via Resend, webhooks)
- **Improved Edge Function Errors** - Edge function errors now return meaningful messages instead of generic failures
- **Bug Fix** - Fixed published sites rendering empty Handlebars variables (static builder was not loading `data.json` context)
- **Bug Fix** - Fixed "IndexedDB not initialized" errors across pages caused by a race condition during database initialization

### How It Works

Site templates in **Server Mode** automatically provision the full backend when you create a project: the project is synced to the server, a site is created, and all backend features (database tables, edge functions, server functions, secret placeholders) are set up in one request. You'll see a summary of what was provisioned and a reminder to fill in any secret values via the Admin panel.

In **Browser Mode**, site templates create the frontend files normally. A notification reminds you that backend features require Server Mode.

### For Template Authors

Export projects as site templates in two ways:

1. **From the Sites view** — Use the dropdown menu on any site card and select "Export as Site Template". Backend features (edge functions, database schema, server functions, secrets) from that site are automatically included in the `.oswt` file.
2. **From the Templates tab** — Export any project as a template using the template export dialog.

---

## v1.26.0 - Screenshot Reliability & Project Swap (2026-02-04)

Improved reliability for project and site screenshots, plus smoother save UX.

- **Improved Screenshot Reliability** - Resource-waiting before capture (fonts, images, idle network)
- **Non-blocking Save** - Project save completes instantly; thumbnail updates in the background
- **Publish Spinner** - Spinner overlay on site card during publish and thumbnail capture

---

## v1.25.2 - Binary File Sync Fix

- **Bug Fix** - Fixed binary file sync and serving in Server Mode

---

## v1.25.1 - Binary File Publishing Fix

- **Bug Fix** - Fixed binary files (JPG, PNG, GIF, etc.) not publishing correctly in Server Mode

---

## v1.25.0 - Skill Evaluation Pass (2026-02-02)

A new pre-flight evaluation pass checks which skills are relevant to your prompt before the main AI call. When a match is found, the AI receives an explicit instruction to read the skill first, radically improving skill adoption rates.

Enable it in **[Skills Settings](?doc=skills)** > **Skill Evaluation** toggle.

- **Automatic Skill Matching** - Your selected model evaluates your prompt against enabled skills before each message
- **Explicit Directives** - Matched skills are injected as high-priority read instructions in the user message
- **Debug Visibility** - New `skill_evaluation` event in the debug panel shows what was evaluated and matched
- **Non-Streaming API** - The generate API now supports `stream: false` for lightweight calls

**Note:** This feature is disabled by default as it adds an extra API call per message, which increases initial token usage.

---

## v1.24.0 - Vision/Image Input Support (2026-01-26)

Drop or paste images directly into the chat input to share visual context with the AI on supported models.

- **Image Input** - Drag & drop or paste (Ctrl/Cmd+V) images into the chat
- **Multi-Provider Support** - Works with OpenRouter, OpenAI, Anthropic, Gemini, and Ollama vision models
- **Supported Models** - GPT-5.x, Claude Opus 4.5, Gemini 3 Flash/Pro, GLM-4.7V, llava, Pixtral, and more
- **Smart Detection** - Image input automatically enabled when using a vision-capable model
- **Multiple Images** - Attach multiple images in a single message
- **Formats** - PNG, JPEG, WebP, and GIF supported

### How to Use

1. Select a vision-capable model (e.g., GPT-5.2 via OpenRouter, Claude Opus 4.5, Gemini 3 Pro)
2. Drop an image onto the chat input or paste from clipboard
3. Add your prompt describing what you want
4. Send the message

The AI will analyze the image and can help you recreate designs, extract content, or use it as reference for building your site.

**Note:** For Gemini vision models, use OpenRouter rather than the direct Gemini API for best compatibility.

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

## v1.19.0 - Server Mode Backend

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

The AI can now understand and work with your site's backend features! When you select a site:

- **Site Selector** dropdown in workspace header to choose site context
- **`/.server/` hidden folder** with transient files containing server context
- AI receives edge functions, database schema, server functions, and secret names

#### The `/.server/` Folder

A hidden folder appears in the file explorer (right-click → "Show Hidden Files"):

- `db/schema.sql` - Database schema (read-only, use sqlite3 for DDL)
- `edge-functions/*.json` - Edge functions (editable)
- `server-functions/*.json` - Server functions (editable)
- `secrets/*.json` - Secret placeholders (editable - AI creates, user sets values)

### AI Read-Write Access to Backend Features

The AI can create, modify, and delete backend features:

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

**[Backend Features Guide →](?doc=backend-features)** | **[Server Mode Guide →](?doc=server-mode)**

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

- 10 AI providers (OpenRouter, OpenAI, Codex, Anthropic, Google, Groq, HuggingFace, Ollama, LM Studio, SambaNova)
- Virtual file system with project management
- Live preview with real-time updates
- Multi-tab Monaco editor
- Export to ZIP for deployment

---

**Ready to go?** Head back to **[Projects](?nav=projects)** or **[browse all docs](?doc=overview)**.
