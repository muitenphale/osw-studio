# Changelog

## v1.33.0 - 2026-02-19
- **Checkpoint System Rework**: New checkpoint panel and redesigned checkpoint lifecycle
  - New "Checkpoints" panel in the workspace — view, jump to, and restore any checkpoint from the session
  - Opening a project creates an immutable "Starting point" checkpoint (`system` kind) that persists for the entire session
  - Multiple manual save checkpoints now supported — saves accumulate instead of replacing each other
  - "Discard Changes" always reverts to the session starting point, not the last save
  - Global limit (50) applies only to auto-checkpoints; manual and system checkpoints are never evicted
- **QoL**: Default provider configurable via `NEXT_PUBLIC_DEFAULT_PROVIDER` env var (used by HF deployment)
- **QoL**: Chat input disabled when no credentials configured; model selector button highlights to guide setup

## v1.32.0 - 2026-02-18
- **Anonymous Telemetry**: Client-side usage analytics via [osw-analytics](https://github.com/o-stahl/osw-analytics)
  - Events: session, pageview, heartbeat, provider/model selection, task lifecycle, tool calls, API errors
  - Random anonymous visitor ID (localStorage) for unique visitor counts — no cookies, no fingerprinting
  - Batched payloads via `fetch` with `sendBeacon` fallback on page unload
  - Opt-out toggle in Settings, first-run disclosure dialog, env kill switch (`NEXT_PUBLIC_TELEMETRY_ENABLED=false`)

## v1.31.2 - 2026-02-16
- **Fix**: HF OAuth switched to client-side PKCE via `@huggingface/hub` — no server routes, no cookies, token exchange happens entirely in browser
- **Cleanup**: Removed server-side OAuth routes (login, callback, status, disconnect) and cookie helper

## v1.31.1 - 2026-02-16
- **Bug Fix**: Fixed HF OAuth 401 — HttpOnly cookies silently dropped on HF Spaces; tokens now stored in localStorage via URL fragment
- **Bug Fix**: Fixed OAuth redirect using internal container hostname instead of public URL
- **Improvement**: Token exchange uses Basic auth header; callback validates inference scope before storing
- **Improvement**: HTML error responses from providers sanitized to clean messages
- **Security**: Codex provider hidden on HF Spaces (refresh token too sensitive for localStorage)

## v1.31.0 - 2026-02-15
- **HuggingFace Provider**: New AI provider with free inference tier ($0.10/month free credits)
  - Two auth methods: OAuth (HF Spaces only) and API key (everywhere)
  - Dynamic model discovery — 120+ models with metadata (context length, tool support, vision, pricing)
  - Full cost tracking integrated with session and project cost calculations
  - Credit exhaustion detection with friendly error message
- **UI Overhaul — Model Settings & Settings Popups**: Visual refresh of both settings popups
  - Model Settings: inline model list with search, separate chat model toggle, cleaner section layout
  - Settings: segmented theme selector, streamlined cost tracking, card-style data management
  - Unified connection badge for all providers — HuggingFace, Codex, and API key providers all show a consistent connected/disconnected state
  - API key providers (OpenRouter, OpenAI, Anthropic, Google, Groq, SambaNova) now validate keys on connect instead of saving on every keystroke
- **Bug Fix**: Fixed model selector dropdown extending beyond viewport

## v1.30.0 - 2026-02-14
- **Codex Generation**: The "Codex (ChatGPT Sub)" provider now supports full generation — streaming responses, tool calls (shell, json_patch), and usage-limit error handling
  - Server-side adapter (`lib/llm/codex-adapter.ts`) converts between Chat Completions and Codex Responses API formats
  - Uses `@spmurrayzzz/opencode-openai-codex-auth` for JWT decode, header construction, model normalization, and error parsing
  - No client-side changes — the streaming parser, orchestrator, and UI work unchanged
- **Model List**: Available models: `gpt-5.3-codex`, `gpt-5.2-codex`, `gpt-5.2`, `gpt-5.1-codex`, `gpt-5.1-codex-mini`, `gpt-5.1`, `gpt-5-codex`, `codex-mini-latest`; future model IDs are passed through without normalization
- **Codex Error Handling**: Usage limit errors show a clear message with estimated retry time
- **UI**: Codex auth panel layout tightened — "Disconnect" button inline with connection status; security/stability warning banner added
- **Codex Auth**: Refresh token stored in HttpOnly cookie (`osw_codex_rt`), not localStorage — JS never has access to it
  - Server routes handle connect, disconnect, status check, and token refresh (`/api/auth/codex/*`)
  - Client stores only `access_token`, `expires_at`, and `user_email` in localStorage
  - `CLIENT_ID` and refresh token kept server-side only
- **Bug Fix**: Fixed parallel tool call status indicators going to the wrong tool (spinners stuck on completed tools)
  - Root cause: batch-based tracking assumed one `toolCalls` event per batch, but the streaming parser emits one event per tool — so `tool_status` looked up the wrong tool
  - Replaced batch/index Map with a flat per-iteration array; `tool_status` and `tool_result` now use direct index lookup
- **Bug Fix**: Fixed `tool_param_delta` events not coalescing when parallel tools stream interleaved with `toolCalls` events
  - Coalescing now searches backward through the last 4 events for a matching type instead of only checking the last event

## v1.29.0 - 2026-02-13
- **User-Managed Thumbnails**: Replaced automatic screenshot capture with user-initiated controls
  - Camera button (capture) and upload button on project cards, site cards, and the workspace preview toolbar
  - Remove button (X) on hover for cards that already have a thumbnail
  - Removed fire-and-forget screenshot on project save
  - Removed automatic thumbnail capture after site publish
- **New Component**: `ThumbnailArea` — reusable thumbnail widget with capture, upload, and remove states (`sm`/`md` sizes)
- **New Utility**: `captureProjectScreenshot()` — compiles project in a hidden iframe and captures a screenshot on demand
- **Refactored**: `captureSiteScreenshot()` now returns a base64 data URL instead of uploading directly; callers handle persistence
- **New Utility**: `compressImage()` — resizes uploaded images to max 640×360 JPEG, retries at lower quality if over 100KB
- **API**: Site thumbnail endpoint now accepts `null` to clear thumbnails
- Thumbnail area stops event propagation so button clicks don't navigate to the workspace
- **Bug Fix**: Fixed edge function calls from the preview not being intercepted when a site is selected after initial render
- **Bug Fix**: Fixed `ls /.server/` returning empty — transient subdirectories were not synthesized as directory entries
- **Bug Fix**: Added missing scheduled function handlers to `createServerContextFile()` and `updateServerContextFile()`
- **Improvement**: Server context in the file explorer now auto-refreshes after AI operations
- **Improvement**: Edge function route now resolves sites by slug in addition to UUID
- **Improvement**: AI system prompt and skills now instruct the AI to use simple fetch paths in client code
- **Improvement**: File explorer race condition guard for concurrent `loadFiles` calls

## v1.28.0 - 2026-02-10
- **Scheduled Functions**: Run edge functions on cron schedules via the new Schedules tab in Server Settings
  - Create, edit, enable/disable, and delete scheduled functions from the admin UI
  - Standard 5-field cron expressions with timezone support
  - Custom JSON config passed as request body to the linked edge function
  - Execution tracking: next run time, last status (success/error), last run time
  - AI integration: scheduled functions visible in `/.server/scheduled-functions/` context and documented in the `server-functions` skill
- **Server Context**: AI system prompt now includes scheduled function count and creation instructions

## v1.27.0 - 2026-02-06
- **Site Templates**: New template type that bundles frontend files AND backend infrastructure
  - Edge functions, server functions, database schema, and secrets metadata in one `.oswt` file
  - Template format v2.0 with `siteFeatures` object for backend definitions
  - Type filter (All, Project, Site) and badges in template browser
- **Built-in Site Templates**: Two new site templates:
  - **Landing Page with Contact Form** - Professional landing page with Resend email integration, contact form edge functions, and message database
  - **Blog with Comments** - Blog platform with static HTML posts, Handlebars partials, comment system edge functions, and content moderation
- **Automatic Backend Provisioning** (Server Mode): Creating a project from a site template automatically syncs to server, creates a site, and provisions all backend features (database schema, edge functions, server functions, secret placeholders) in one bulk request
- **Export from Sites**: Export any published site as a site template from the Sites view; backend features are automatically captured
- **Graceful Degradation**: Site templates work in Browser Mode (frontend files only); toast notification about Server Mode for backend features
- **Improved Blog Template**: Blog posts are now static HTML pages with Handlebars partials instead of dynamically loaded from the database; post links work correctly under `/sites/{siteId}/`
- **Async Edge Functions**: Edge functions now support `await` (async IIFE wrapper in QuickJS executor) for calling external APIs
- **Improved Edge Function Errors**: Proper error message extraction from QuickJS error objects instead of generic failures
- **Bug Fix**: Static builder missing `fileExists()` in VFS wrapper — Handlebars `data.json` context not loaded during publish
- **Bug Fix**: IndexedDB `init()` race condition — async function was not returning its promise, causing "not initialized" errors

## v1.26.1 - 2026-02-06
- **Bug Fix**: Fixed server sync pull failing when project doesn't exist locally
  - `vfs.getProject()` threw instead of returning null, crashing the pull flow
  - New projects pulled from server were created with a new ID, orphaning synced files
  - `createProject` now accepts an optional ID parameter to preserve server project IDs

## v1.26.0 - 2026-02-04
- **Improved Screenshot Reliability**: Thumbnails now capture fully-loaded content
  - New resource-waiting layer: waits for fonts, images, and browser idle before capture
  - Site publish thumbnails wait ~2.5s minimum (up from 500ms) for resources to load
  - Project save no longer blocks on screenshot — save completes instantly, thumbnail updates in background
  - Spinner overlay shown on site card thumbnail during publish
- **Change Source Project** (Server Mode): Site settings now allow swapping the source project via a dropdown on the General tab, with a warning that it may break the published site
- **Sidebar Version Display**: Application version and mode now shown in sidebar below the app name

## v1.25.2 - 2026-02-03
- **Bug Fix**: Fixed binary file sync and serving in Server Mode
  - Sync now properly serializes ArrayBuffer content to base64 before JSON transport
  - Sites route correctly serves binary files without UTF-8 corruption
  - Handles data URL format (`data:image/...;base64,...`) in both SQLite adapters
- **Bug Fix**: Fixed Model Tester link not navigating correctly from sidebar
- **Docs**: Added comprehensive VPS Deployment Guide with security hardening

## v1.25.1 - 2026-02-03
- **Bug Fix**: Fixed binary files (JPG, PNG, GIF, etc.) not publishing correctly in Server Mode
  - SQLite adapter now properly decodes base64 content back to ArrayBuffer when reading image/video files

## v1.25.0 - 2026-02-02
- **(Optional) Skill Evaluation Pass**: Pre-flight relevance check on the user message before main LLM call
  - Non-streaming call using the selected model determines which skills match the user's prompt
  - Matched skills are injected as explicit directives in the user message for higher adoption
  - 5s timeout with silent fallback on any failure
  - New `skill_evaluation` debug event in the debug panel
  - Toggle in Skills tab (disabled by default)
- **Non-Streaming API Support**: `/api/generate` route now respects `stream: false` parameter
  - Returns JSON response directly instead of SSE stream when streaming is disabled
  - Enables lightweight API calls without stream parsing overhead

## v1.24.0 - 2026-01-26
- **Vision/Image Input Support**: Drop or paste images into the chat input on supported models
  - Supported formats: PNG, JPEG, WebP, GIF
  - Multi-provider support: OpenRouter, OpenAI, Anthropic, Gemini, Ollama (llava models)
  - Image thumbnails shown in chat input with remove button
  - Visual drop indicator when dragging images
  - Automatic model capability detection (GPT-5.x, Claude Opus 4.5, Gemini 3, GLM-4.7V, llava, etc.)
  - Images displayed in chat history at 60px height in a flex container
- **Dismissable Toasts**: All toast notifications now have a close button
- **Bug Fix**: Fixed orchestrator exiting prematurely without evaluation due to stale state
- Updated Next.js to 15.5.9
- Added defensive null checks in sync API routes

## v1.23.0 - 2026-01-18
- **Enhanced Server Sync Modal** (Server Mode): Redesigned sync dialog with granular control
  - Tabbed interface for Projects, Skills, and Templates (previously only projects synced)
  - Per-item sync status badges showing: Synced, Local Newer, Server Newer, Conflict, Local Only, Server Only
  - Hover tooltips explaining each status and recommended actions
  - Individual push/pull buttons per item for precise control
  - Bulk selection with "Select All" and batch push/pull operations
  - Summary bar showing status counts per category
- **Skills & Templates Sync** (Server Mode): Full sync support for custom skills and templates
  - New API endpoints: `/api/sync/skills`, `/api/sync/templates` with individual item routes
  - Skills (localStorage) and templates (IndexedDB) now sync with SQLite server storage
  - Sync metadata tracking: `lastSyncedAt`, `serverUpdatedAt` for three-way comparison
- **Security**: Updated Next.js to 15.3.8 (CVE-2025-55182)

## v1.22.1 - 2026-01-11
- Fixed Server Mode setup docs to match `.env.example`
- Removed unused bcryptjs dependency
- Fixed redirect on new version going to What's New instead of Dashboard

## v1.22.0 - 2026-01-10
- **QuickJS WASM Sandbox**: Upgraded function executor from Node.js VM to QuickJS WebAssembly
  - Edge and server functions now run in isolated WASM sandbox
  - Memory limits enforced by WASM (64MB default)
  - Execution time limits with interrupt handler
  - No access to Node.js APIs (process, require, fs, etc.)
  - Same API surface: `db`, `secrets`, `Response`, `console`, `server`, `fetch`, `atob`, `btoa`
- **Fetch API with Security Controls**: External HTTP requests from functions
  - Max 10 requests per execution
  - 10 second timeout per request
  - 5MB max response body
  - Protocol allowlist: only `http://` and `https://`
  - Private IP blocking in production (localhost, 10.x, 172.16-31.x, 192.168.x, 169.254.x)
  - Development mode allows local requests for testing
- **Base64 Encoding**: Added `atob()` and `btoa()` functions for base64 encode/decode

## v1.21.0 - 2026-01-10
- **Dashboard for Browser Mode**: Dashboard now available in browser mode (previously server mode only)
- **Dashboard as Landing Page**: Dashboard is now the default landing page for both modes
- **Quick Actions Bar**: Create projects, start guided tour, join Discord, and access docs from dashboard
- **What's New Component**: Shows latest version highlights with link to full changelog
- **Recent Projects**: Quick access to recently updated projects from dashboard

## v1.20.0 - 2026-01-08
- **Admin Dashboard** (Server Mode): New landing page after login with server stats and traffic metrics
  - System info: OSWS version, Node.js version, uptime, memory usage
  - Content stats: Projects, templates, skills, total files counts
  - Hosting stats: Published sites, sites with databases, storage used
  - Traffic monitoring: Requests per hour/day, error counts, top sites, recent errors
  - Manual refresh button (no polling overhead)
- **Request Logging**: Lightweight server-side logging for published site traffic
  - Logs site requests to `request_log` table in core database
  - Anonymized IP hashing for privacy
  - Fire-and-forget async inserts (no response latency impact)
  - Automatic 7-day log retention cleanup
- Fixed admin routes (`/admin/*`, `/api/admin/*`) being accessible in Browser mode

## v1.19.5 - 2026-01-07
- Fixed binary file sync causing "Too few parameter values" error (ArrayBuffer becomes {} in JSON)

## v1.19.4 - 2026-01-07
- Fixed VPS deployment docs missing standalone mode static file copy step
- Fixed "Too few parameter values" error in SiteDatabase (mimeType/size null coalescing)

## v1.19.3 - 2026-01-07
- Fixed static site path rewriting for navigation links and root "/" href

## v1.19.2 - 2026-01-07
- Fixed admin login not redirecting after successful authentication
- Fixed file sync failing with "Too few parameter values" error for legacy files

## v1.19.1 - 2026-01-06
- System prompt now recommends `json_patch` over `echo` for creating server functions/edge functions
- Added `SECURE_COOKIES` environment variable to allow insecure cookies for pre-SSL VPS setup

## v1.19.0 - 2026-01-03
- **Server Mode Backend Features**: Complete backend functionality for published sites
  - **Edge Functions**: REST API endpoints with JavaScript runtime
    - Create JavaScript API endpoints for published sites (GET, POST, PUT, DELETE, ANY)
    - Database access via `db.query()` and `db.run()` with parameterized queries
    - External API calls with `fetch()`
    - Isolated execution via Node.js VM contexts with configurable timeouts (1-30 seconds)
    - Access to secrets via `secrets.get()`, `secrets.has()`, `secrets.list()`
  - **Server Functions (Helpers)**: Reusable JavaScript code callable from edge functions
    - Define shared logic once, use across edge functions via `server.functionName()`
    - Same security model as edge functions with full `db` and `fetch` access
  - **Secrets Management**: Encrypted storage for API keys and tokens
    - AES-256-GCM encryption with unique IVs per secret
    - Admin-only access, values never logged or returned in API responses
    - AI can create secret entries, user sets values via admin UI
  - **SQL Editor**: Execute raw SQL queries with Monaco editor and query history
  - **Schema Viewer**: Browse database structure with expandable table/column tree
  - **Execution Logs**: Automatic logging of function invocations with status, duration, timestamps
- **Server Context Integration** (Experimental): AI awareness of site server features
  - Site Selector dropdown in workspace header to choose site context
  - `/.server/` hidden folder with transient files containing server context
  - AI receives edge functions, database schema, server functions, and secret names
  - Hidden folder icons: purple book for `/.skills/`, orange server for `/.server/`
- **AI Read-Write Access to Server Features**:
  - `sqlite3` shell command for executing SQL queries on site database
    - Supports `-json` and `-header` output flags
    - System tables protected from modification
  - Edge functions writable via `json_patch` on `/.server/edge-functions/*.json`
  - Server functions writable via `json_patch` on `/.server/server-functions/*.json`
  - Function files use JSON format with metadata (name, method, enabled, code, etc.)
- **Edge Function Routing for Published Sites**: Automatic client-side routing
  - Lightweight interceptor script (~1.5KB) injected into published HTML
  - Intercepts `fetch()` and `XMLHttpRequest` calls to paths without file extensions
  - Routes requests to `/api/sites/{siteId}/functions/{path}` automatically
  - Form submissions with edge function actions intercepted and sent as JSON
  - Custom events: `edge-function-response` and `edge-function-error`
  - Zero server overhead for static files - only edge function calls hit the server
- **Preview Edge Function Support**: Test edge functions in preview before publishing
  - VirtualServer accepts optional siteId parameter
  - VFS interceptor routes edge functions in preview iframe
- **System Prompt Enhancements**: Comprehensive server feature guidance
  - sqlite3 usage examples with proper quoting and common mistakes to avoid
  - Function creation, editing, and deletion patterns
  - JSON format documentation for edge and server functions
- **Bug Fix**: Fixed system prompt being appended on every follow-up message (~8k extra tokens per message)

## v1.18.0 - 2025-12-11
- **SQLite Migration**: Replaced PostgreSQL with SQLite (better-sqlite3) for Server Mode
  - No external database setup required - just `npm install && npm start`
  - Simpler self-hosting with zero configuration
- **Per-Site Database Architecture**: Each site now has its own SQLite database
  - `data/osws.sqlite` - Core database (projects, templates, skills)
  - `sites/{siteId}/site.sqlite` - Per-site database (files, settings, analytics)
- **Memory Leak Fix**: Reduced memory usage during long AI sessions
- **Removed**: PostgreSQL support - `DATABASE_URL` environment variable no longer used
- **Breaking Change**: Existing PostgreSQL Server Mode deployments must migrate data manually

## v1.17.0 - 2025-12-03
- **Reasoning Token Support**: Display reasoning/thinking from compatible models
  - Anthropic extended thinking, DeepSeek R1, Gemini thinking models
  - Separate reasoning tracking with `reasoning_delta` events and coalescing
  - Collapsible reasoning display in chat panel
- **Reasoning Toggle**: Enable/disable reasoning per model in settings
- **Malformed Tool Call Detection**: Auto-detect and correct when model writes tool syntax as text instead of using function calling
- **UI Improvements**:
  - Renamed "Thinking..." to "Waiting for response..." for clarity
  - Fixed "Thinking..." indicator persisting after response completes

## v1.16.0 - 2025-11-23
- **Server Mode (Optional)**: PostgreSQL-backed deployment mode for persistent storage and multi-device access
  - Browser Mode remains the default (IndexedDB, client-side only, no backend required)
  - Server Mode adds PostgreSQL persistence, admin authentication, and sites publishing
  - Automatic database setup (no manual migrations)
  - Bookmarkable URLs for all pages (`/admin/projects`, `/admin/sites`, etc.)
  - Admin login with password protection (24-hour sessions)
- **Published Sites Management**: Create and host static sites directly from your projects
  - New dedicated "Sites" view with search, sort, and filtering
  - Publish projects to live URLs with one click
  - 6 configuration tabs: General, Scripts, CDN, Analytics, SEO, Compliance
  - Custom domain support with automatic HTTPS URLs
  - "Under Construction" mode with placeholder page
  - Status badges: "Live", "Pending Changes", "Under Construction", "Compliance Enabled"
  - Copy site URL to clipboard from context menu
  - Automatic sitemap.xml and robots.txt generation
- **Compliance/Cookie Consent**: GDPR-ready cookie consent banners
  - Opt-in or opt-out consent modes
  - Customizable position (6 locations), button style (pill/rounded/square), and text
  - Privacy policy and cookie policy links
  - Dark mode support and responsive design
- **Sites Publishing Features**: Configure published sites with advanced options
  - Inject custom scripts (head/body) for analytics, tracking, or functionality
  - Add external CDN resources (stylesheets, scripts)
  - Privacy-focused analytics (no cookies, IP anonymization, LocalStorage consent)
  - SEO metadata (title, description, keywords, Open Graph, Twitter Cards)
- **UI/UX Improvements**:
  - Sites view matches modern Projects/Templates/Skills layout
  - Improved modal sizing for better readability
  - Sidebar no longer shifts content when unpinned
  - Site cards display thumbnails, status badges, and quick actions
  - Analytics dashboard shows page views, unique visitors, and referrers
- **Performance**: Sites view loads in <3 seconds for 50 projects
- **Documentation**: Comprehensive docs added for all features (12 guides including Server Mode, Sites Publishing, Deployment, Architecture, and more)
  - Fixed version display showing "-" instead of version number
  - Fixed compliance settings not persisting
  - Fixed site thumbnails not updating
  - Fixed analytics tracking issues
- **Gemini Thinking Model Support**: Full compatibility with Gemini thinking models via OpenRouter
  - Automatic `reasoning_details` preservation for multi-turn tool use conversations
  - Enables reliable function calling with thinking models (previously failed with 400 errors)
- **Skills System Enhancements**: Reorganized built-in skills for better AI guidance
  - Split `osw-workflow` into focused skills: `osw-planning` (multi-page site planning) and `osw-one-shot` (landing page generation)
  - Improved skill descriptions to be more action-oriented
  - Skills now appear in Project Structure shown to AI (previously only listed separately)
- **Debug Panel Improvements**: Enhanced debugging experience
  - The mini terminal can be used to test out or perform VFS operations 
  - Easier troubleshooting of AI file operations

## v1.15.0 - 2025-11-04
- Added Agent Skills System (Anthropic-inspired, compatible with prompt-only skills) with integrated Skills tab (Projects | Templates | Skills)
- Global enable/disable toggle for entire skills system with per-skill enable/disable controls
- Built-in skills: OSW Workflow (comprehensive website building guide), Handlebars Advanced, Accessibility (WCAG 2.1 AA)
- Create custom skills with markdown-based editor (YAML frontmatter + content, follows Anthropic SKILL.md convention)
- Import/export skills as .md files or .zip archives
- Skills automatically injected into AI system prompt when enabled (prompt-only approach)
- Expandable/collapsible skill cards with content preview
- Dual-mode skills editor (form view + raw markdown view)
- Moved hidden files toggle from file explorer header to right-click context menu
- Hidden files now only show enabled skills in `/.skills/` folder
- AI interacts with transient files (skills, temp files) via shell commands

## v1.14.1 - 2025-11-02
- Fixed Cmd/Ctrl+S triggering project save when Monaco editor has focus (now lets Monaco handle file saves internally)
- Enhanced directory-based routing: paths ending with `/` now correctly resolve to `index.html` (e.g., `/about/` → `/about/index.html`)
- Added fallback routing logic: `/about` tries `/about.html` first, then `/about/index.html` as fallback
- Updated system prompt documentation to clarify directory index resolution and clean URL support
- Smart JSON repair for truncated tool calls: auto-repairs and executes safe operations (rewrite), fails gracefully with guidance for unsafe operations (update/replace_entity)
- Removed duplicate naive JSON repair from streaming parser to prevent malformed JSON
- Fixed LLM message rendering: normalizes excessive whitespace in LLM output that caused ReactMarkdown to incorrectly render plain text as indented code blocks
- Fixed guided tour compatibility with v1.14.0 event-driven architecture: tour events now properly convert to debug events for ChatPanel display
- Enhanced guided tour reliability: always creates fresh "Example Studios (Tour)" demo project with correct file structure
- Improved tour UX: automatically navigates to project page after completion when demo project is deleted (if other projects exist)

## v1.14.0 - 2025-10-23
- Event-driven chat architecture replacing message-based system
- Real-time event streaming with chronological display and improved UI responsiveness
- Chat panel with event-driven UI, per-batch tool tracking, green color scheme, and hover-transition close button
- Debug panel with real-time event monitoring, automatic event coalescing, filtering, auto-scroll, and improved close interaction
- Debug event persistence: debounced IndexedDB writes prevent duplicates during rapid streaming
- IndexedDB schema v3: added `debugEvents` object store for persistent debug event storage
- Mobile workspace updated to use event-driven chat architecture
- Refactored architecture: modular tool and agent systems with declarative tool registry
- Enhanced error messages: comprehensive usage hints for shell commands to improve LLM self-correction
- Handlebars partial subdirectory support: organize templates in `/templates/components/`, `/templates/partials/`, etc. with automatic multi-name registration
- Fixed file explorer not refreshing after `json_patch` operations
- Enhanced system prompt with improved Handlebars templating guidance: workflow-first approach, 3-step tutorial, working examples, and common LLM anti-patterns
- Added platform constraints to system prompt: emphasizes static-only websites, Handlebars is build-time not runtime, automatic routing

## v1.13.4 - 2025-10-19
- Enhanced Handlebars with `limit` helper for displaying subset of array items
- Improved json_patch error messages to detect and guide LLMs when operations are incorrectly stringified
- Simplified loop detection logic for more accurate duplicate tool call prevention

## v1.13.3 - 2025-10-19
- Fixed "New Project" dialog to show custom imported templates in dropdown
- Refactored built-in template definitions into centralized registry

## v1.13.2 - 2025-10-19
- Fixed duplicate tool call detection producing false positives for different json_patch operations

## v1.13.1 - 2025-10-17
- Fixed streaming response parser breaking early on `finish_reason` before tool calls arrive
- Fixed "No actions were taken" error appearing despite successful tool call execution
- Fixed success determination to use accumulated tool calls instead of steps completed
- Fixed SSE comment filtering to skip lines starting with `:` (removes "OPENROUTER PROCESSING" messages)
- Enhanced json_patch error messages with detailed format guide, operation types, and examples
- Cleared accumulated tool calls at start of new execution

## v1.13.0 - 2025-10-15
- Added Templates system for creating, managing, and sharing reusable project templates
- Export any project as a template (.oswt file) with customizable metadata (name, description, author, version, tags, license)
- Import templates to quickly start new projects
- Template browser with grid/list views, search, and sorting by name, author, or file count
- Project cards now display preview screenshots automatically captured from live preview
- Redesigned project list view with improved 3-column desktop layout
- Added pill-toggle navigation between Projects and Templates pages

## v1.12.0 - 2025-10-04
- Switch between read-only exploration (Chat) and full coding mode (Code)
- Chat mode: Read-only commands for codebase exploration and planning
- Code mode: Full file modification capabilities with json_patch and evaluation tools
- Write commands (touch, echo >, mkdir, rm, mv, cp) blocked in chat mode with helpful error messages
- Optional separate model selection per mode for cost optimization (e.g., use cheaper models for chat/planning)
- Mode state persists across sessions
- Renamed from DeepStudio to Open Source Web Studio (OSW Studio)
- Updated all UI text, database names, storage keys, and API headers
- Maintained full backward compatibility with DeepStudio .osws backup files
- Integrated new OSW Studio logo with theme-aware SVG (automatic light/dark mode support)
- Added outlined favicon design for visibility on all backgrounds
- Established brand naming convention: "Open Source Web Studio" (full), "OSW Studio" (short)
- Consolidated IndexedDB architecture from 3 separate databases to 1 unified database
- Atomic transactions now possible across all data types (projects, files, conversations, checkpoints)
- Improved import/export performance with single database connection
- Fixed backup import hanging issues with proper timeout handling and blocked connection detection
- Added DeepStudio → OSW Studio migration support via backup import
- Enhanced error handling and logging for all database operations
- Enhanced error handling: API errors now show toast notifications and remove thinking indicator
- Error messages persist in chat history with visual styling for easy troubleshooting
- Mobile save button indicator in workspace header appears when unsaved changes exist
- Added "Thinking..." indicator for LLM response wait times
- Early tool call visibility with streaming parameter updates
- Fixed chat auto-scroll during streaming (instant scroll instead of competing animations)
- Fixed preview button flashing during streaming (memoized component and callbacks)
- Subtle retry notifications
- Fixed double JSON encoding in API error responses for cleaner error messages
- Fixed 'echo' and 'touch' commands missing from structural commands for file explorer refresh
- Fixed evaluation tool showing premature status
- Fixed project name input validation
- Fixed metadata URLs (oswstudio → osw-studio) in layout and CLAUDE.md
- Added finish_reason handling for OpenRouter streaming
- Request evaluation when tool calls stop instead of blind retries
- Added runtime validation for tool definitions to prevent malformed tools
- Added loop detection: prevents LLM from repeating the same failing command consecutively
- Added progressive Handlebars rendering: missing partials show inline error stubs instead of failing entire page
- Codebase cleanup: removed 8 unused files and 9 unused dependencies
- Removed tw-animate-css dependency (Tailwind v4 includes built-in animations)
- Removed DeepStudio logo files (deepstudio-logo-dark.svg, app/favicon.ico)
- Updated demo template and GitHub repository links
- Updated theme storage and cost settings event naming

## v1.11.0 - 2025-02-03
- Enhanced evaluation tool with goal-oriented progress tracking (progress_summary, remaining_work, blockers)
- Improved orchestrator loop to properly enforce evaluation after meaningful work (3+ steps)
- Fixed evaluation state handling: now correctly respects should_continue flag
- Added comprehensive error messages with examples for all tool call failures
- Unified error message format across shell, json_patch, and evaluation tools
- Added file creation guidelines to system prompt for cleaner project structure

## v1.10.0 - 2025-02-02
- Added token-efficient shell commands: `rg` (ripgrep), `head`, `tail`, `tree`, `touch`, and `echo >` redirection
- Removed redundant commands: `sed`, `nl`, `rmdir`
- Enhanced system prompt to discourage `cat` usage with decision flowchart and token cost warnings

## v1.9.1 - 2025-01-30
- Fixed Handlebars navigation links being converted to blob URLs instead of remaining as routes

## v1.9.0 - 2025-01-29
- Added complete data backup and restore functionality
- Export all projects, conversations, and checkpoints to .dstudio file
- Import data with merge or replace options
- Fixed changelog versioning to follow semantic versioning (major.minor.patch)

## v1.8.0 - 2025-01-28
- Enhanced system prompt with directory tree structure and file sizes
- Major VFS improvements: Added comprehensive image loading interceptor for dynamic content
- VFS now transparently handles JavaScript-generated images and assets via blob URLs
- Fixed image resolution issues in templates with automatic innerHTML processing
- Refactored template system with self-contained asset definitions
- Unified createProjectFromTemplate function with optional assets parameter

## v1.7.0 - 2025-01-27
- Modularized the monolithic template file
- Removed Handlebars template
- Added step counter to guided tour overlay

## v1.6.0 - 2025-01-27
- Fixed binary file persistence in checkpoint system
- Images and other binary files now properly persist across page reloads
- Added base64 encoding/decoding for binary content in checkpoints
- Updated VFS updateFile to support ArrayBuffer content

## v1.5.0 - 2025-01-26
- Fixed TypeScript compilation error with shell tool oneOf parameter support  
- Enhanced Handlebars error handling with detection of invalid LLM-generated syntax
- Added helpful error messages for common Handlebars pattern mistakes

## v1.4.0 - 2025-01-26
- Improved LLM shell tool compatibility with natural command format support
- Shell tool now accepts both string ("ls -la /") and array (["ls", "-la", "/"]) formats
- Fixed system prompt confusion about model tool-calling capabilities
- Added automatic string-to-array conversion for better first-call success rates

## v1.3.0 - 2025-01-26
- Enhanced demo project with Handlebars templating for navigation and footer
- Added minimal Handlebars component to barebones template
- Improved template organization and maintainability

## v1.2.0 - 2025-01-26
- Fixed mobile streaming disconnection issue in workspace chat panel
- Mobile now properly displays real-time AI responses with tool calls
- Added missing scroll management for mobile chat during streaming
- Aligned mobile and desktop chat rendering behavior

## v1.1.0 - 2025-01-24
- Added Handlebars templating support (.hbs/.handlebars files)
- Templates automatically compile to static HTML on export
- LLM can now create reusable components with partials
- Improved code generation capabilities

## v1.0.0 - 2025-01-23
- Initial public release
- Multi-provider AI support (8 providers)
- Browser-based development environment
- Project management with checkpoints
- Session recovery and persistence