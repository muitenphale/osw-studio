# Changelog

## v1.42.0 - 2026-03-08

Multi-framework support — Svelte, Vue, and Preact join React as first-class project runtimes with in-browser SFC compilation, starter templates, and AI domain prompts. Plus publish output cleanup.

- **Svelte 5 Support**: `.svelte` single-file components compiled in-browser via the Svelte 5 compiler loaded from CDN (`esm.sh/svelte@5/compiler`). TypeScript in `<script lang="ts">` blocks is preprocessed — esbuild strips type annotations before the Svelte compiler sees the code, and the `lang="ts"` attribute is removed from the opening tag. CSS uses `css: 'injected'` mode so component styles are bundled automatically. Runes API (`$state()`, `$derived()`, `$effect()`, `$props()`) documented in the domain prompt
- **Vue 3 Support**: `.vue` single-file components compiled in-browser via `@vue/compiler-sfc@3` loaded from CDN. The compiler parses the SFC descriptor, compiles `<script setup>` blocks with inline templates, and injects `<style>` blocks as runtime `<style>` elements via a self-executing function. Bare `import { ... } from 'vue'` statements are rewritten to CDN URLs. Composition API (`ref()`, `reactive()`, `computed()`, `watch()`) documented in the domain prompt
- **Preact Support**: Lightweight React alternative (~3KB) with the same JSX pipeline as React — `jsxImportSource` set to `preact` for automatic JSX transform. Supports Preact signals (`@preact/signals`) for reactive state. Hooks imported from `preact/hooks`. No SFC compilation needed — uses standard `.tsx`/`.jsx` files
- **Runtime Registry**: New centralized `lib/runtimes/registry.ts` replaces scattered if/else chains. Each runtime declares its label, description, bundling config, JSX/SFC settings, source extensions, badge styling, and starter template ID. Helper functions: `getRuntimeConfig()`, `getProjectRuntimes()`, `getRuntimeBadge()`, `isRuntimeBundled()`. Badge colors: React sky-blue, Preact purple, Svelte orange, Vue green, Static gray
- **New Templates**: Three starter templates — Preact (`preact-starter`), Svelte (`svelte-starter`), and Vue (`vue-starter`). Each includes an `index.html` shell with `bundle.js`/`bundle.css` references, a framework-specific entry point (`main.tsx` or `main.ts`), a root component with a counter example, and a `.PROMPT.md` with framework-specific AI instructions
- **Template Registry**: New `lib/vfs/templates/registry.ts` consolidates all built-in template metadata (10 templates across 5 runtimes) into a single registry with `BuiltInTemplateMetadata` interface. Helper functions `getBuiltInTemplate()`, `getBuiltInTemplateIds()`, and `getBuiltInTemplatesForRuntime()` replace the previous ad-hoc template lookups
- **Domain Prompts**: New `getDomainPrompt(runtime)` function in `lib/llm/prompts/index.ts` returns framework-specific AI instructions. Each prompt covers the framework's component model, state management, template syntax, file structure conventions, and CDN import patterns. Used to seed `.PROMPT.md` when creating blank projects
- **VFS Type Support**: `.svelte` and `.vue` added to `SUPPORTED_EXTENSIONS` and `getSpecificMimeType()` — without this, VFS rejects file creation for these extensions. `isBundleableSource()` updated to recognize both extensions for bundle filtering
- **CDN Compiler Loading**: Shared `loadCdnCompiler()` utility with in-memory cache ensures each framework compiler is fetched from esm.sh only once per session. Uses a `new Function('url', 'return import(url)')` wrapper to bypass Next.js bundler interception of dynamic imports
- **esbuild Build Error Piping Fix**: `esbuild.build()` throws an exception on build failures instead of returning errors in the result. Previously this exception propagated up through `bundleProject()` → `runBundleStep()` → `compileProject()`, where it was caught by the preview component — but `commitCompilation()` never ran, so the compile-errors buffer stayed empty and the AI never got feedback. Fix: `bundleProject()` now catches the thrown error, extracts structured errors from `buildError.errors`, and returns them in the `BundleOutput`. Additionally, `compileProject()` wraps its body in `try/finally` so `commitCompilation()` is guaranteed to run even on unexpected exceptions
- **TypeScript IntelliSense**: Updated to be runtime-aware — JSX language service configuration only activates when the runtime has a `jsxImportSource` (React, Preact), not unconditionally for all bundled runtimes
- **Cleaner Published Bundles**: esbuild module boundary comments (`// vfs:/src/App.tsx`, `// ../src/main.tsx`) are stripped from compiled `bundle.js` output. CSS source files under `src/` are excluded from published deployments since they're already compiled into `bundle.css`. `shouldExcludeFromExport()` extended to also exclude `.svelte` and `.vue` source files
- **Conditional Edge Function Interceptor**: The fetch/XHR interceptor script that routes requests to edge function endpoints is now only injected into published HTML when the project actually has enabled edge functions — previously it was injected unconditionally for all deployments
- **Vision Detection from Model Discovery**: Vision/image support detection now checks cached model data from provider APIs (OpenRouter, HuggingFace) before falling back to name-based heuristics. Models like Qwen3.5 that support vision natively without "VL" in the name are now correctly detected, enabling image drop/paste in the chat panel
- **Starter Template Rename**: Framework starter templates renamed to "Starter (React + TypeScript)", "Starter (Preact + TypeScript)", "Starter (Svelte)", "Starter (Vue)" for clarity. Counter examples removed from Svelte and Vue starters — all starters now provide just the minimal correct structure (Hello World)
- **Bug Fix: curl VFS Command Protocol**: `curl localhost:3000` now works without requiring `http://` — the protocol is auto-prepended when missing
- **Bug Fix: LLM "read" Tool Calls**: Models that assume a `read` tool exists (common with tool-use-trained models) no longer get "Unknown tool" errors. `read`, `read_file`, `file_read`, `view`, and `view_file` are automatically routed to `cat` via the shell, eliminating wasted round trips

## v1.41.0 - 2026-03-07

React/TypeScript support via in-browser esbuild-wasm bundling, Server Mode deployment for React projects, runtime badges, and sync dialog UX improvements.

- **React + TypeScript Support**: Projects with `.tsx`/`.ts`/`.jsx` source files are now automatically bundled via esbuild-wasm in the browser. The bundler lazy-loads only when a project contains a recognized entry point (`/src/main.tsx`, `/src/index.tsx`, etc.) — existing HTML/CSS/JS projects never load it. Bare npm imports (e.g. `import { useState } from "react"`) are rewritten to esm.sh CDN URLs and fetched by the browser at runtime — no npm or node_modules needed
- **New Template: React + TypeScript**: Minimal starter — `index.html` shell, `src/main.tsx` entry point, and a bare `App.tsx` with just a Hello World component. Designed as a blank canvas so the AI builds from scratch instead of reworking demo code. Includes `.PROMPT.md` that guides the AI to write TSX components, use CDN imports for npm packages, and follow the `/src/` directory structure
- **New Template: React Demo — Task Tracker**: Interactive task tracker showcasing React components, state, and props — `App.tsx` with `useState`, `TaskForm.tsx` (controlled input + form submit), `TaskItem.tsx` (checkbox toggle, delete), and `App.css`. Ships with 3 sample tasks so users see a working app immediately. Demonstrates component composition, typed props, event handling, and conditional rendering in a compact package
- **esbuild-wasm Integration**: New `lib/preview/esbuild-bundler.ts` module encapsulating all esbuild-wasm interaction — lazy WASM initialization (singleton, browser-cached), VFS resolver plugin with extension probing, and CSS/JSON import support. The bundler produces `/bundle.js` and optionally `/bundle.css` which the existing 3-pass preview pipeline processes unchanged. On Node.js (Server Mode publish), esbuild-wasm auto-initializes without `initialize()` — the browser-only `wasmURL`/`wasmModule` options are skipped
- **Server Mode: React Deployment**: React projects now deploy correctly in Server Mode. Three fixes: (1) `detectBundleEntryPoint()` no longer returns `null` server-side — the `typeof window === 'undefined'` guard that blocked server-side bundling was removed; (2) `esbuild-wasm` added to `serverExternalPackages` in `next.config.ts` so Next.js doesn't bundle it into server chunks (which broke esbuild's internal path resolution); (3) `replaceAssetPathsWithDeploymentPrefix()` now rewrites root-level asset references (`/bundle.js`, `/bundle.css`) — previously only files in known subdirectories (`/styles/`, `/scripts/`, etc.) were prefixed with the deployment path
- **VFS Type Support**: `.ts` and `.tsx` added to `SUPPORTED_EXTENSIONS` (under the `js` category) and `getSpecificMimeType()`. This is the gate-keeper change — without it, VFS rejects `.tsx` file creation entirely. Monaco editor already had ts/tsx syntax highlighting
- **Build Error Feedback**: esbuild errors flow through the existing `pushCompileError()` → `drainCompileErrors()` pipeline so the AI receives build error feedback and can self-correct. `formatCompileErrors()` detects `[esbuild]`-prefixed errors and uses a build-specific message instead of the Handlebars-oriented one
- **ZIP Export for React Projects**: Exported ZIPs include both compiled output (`bundle.js`, `bundle.css`, `index.html`) and raw source files (`.tsx`, `.css`). A `package.json` (with react, vite, typescript deps) and `vite.config.ts` are injected so users can continue development locally with `npm install && npm run dev`
- **Runtime Badges**: Project cards and template cards now show a runtime badge indicating "Static" or "React". On project cards: overlaid on the thumbnail in grid view, next to the title in list view. On template cards: in the tags row alongside the existing "Backend" badge. React badges use a sky/blue color scheme; Static badges use a neutral gray with visible border
- **Template Card: Backend Badge Relocated**: The "Backend" badge on template cards moved from the title row to the tags/footer area for visual consistency with the new runtime badge
- **Sync Dialog: Non-Disruptive Refresh**: After push/pull operations in the Server Sync dialog, the item list no longer flashes. Initial load still shows a full-screen spinner; subsequent refreshes keep the list visible with a semi-transparent overlay spinner. Prevents the jarring content replacement that occurred after every sync operation
- **Bug Fix: Publish Button State**: The publish API response was missing `lastPublishedVersion`, so the deployment card always showed "Publish Deployment" instead of "Republish" after a successful publish. The field is now included in the response
- **TypeScript IntelliSense for React Projects**: New `useTypescriptIntelliSense` hook configures Monaco's TypeScript language service when `runtime === 'react'`. Three concerns: (1) compiler options (`jsx: ReactJSX`, `target: ES2020`, `moduleResolution: NodeJs`, etc.), (2) React 19 type definitions fetched from jsdelivr CDN and cached per session via `Promise.allSettled`, (3) project file sync — all `.ts/.tsx/.js/.jsx` files registered as extra libs for cross-file import resolution, updated on `filesChanged` events (debounced 300ms). `MultiTabEditor` now receives a `runtime` prop and uses the `path` prop on `@monaco-editor/react` to create per-tab models with proper URIs for import resolution. All IntelliSense state cleans up automatically when switching to a static project
- **Bug Fix: Analytics CORS**: Replaced `navigator.sendBeacon()` with `fetch()` + `keepalive: true` in both the telemetry tracker and the deployment analytics script. `sendBeacon` implicitly sends with `credentials: 'include'`, which is incompatible with the server's `Access-Control-Allow-Origin: *` header — causing CORS preflight failures on HF Spaces
- **Project Settings Modal**: The "Backend" button in the workspace header is now "Project" and opens a "Project Settings" modal. A new "General" tab (always accessible, even in browser mode) lets users change the project runtime (Static / React) and preview entry point after creation. The 5 backend tabs (Functions, Helpers, Secrets, Schedules, Schema) remain but are individually gated — in browser mode each shows a "Server Mode Required" message instead of a single lock screen blocking the entire modal. The backend enabled/disabled toggle only appears in Server Mode

## v1.40.0 - 2026-03-07

Local inference improvements and code cleanup.

- **New Provider: llama.cpp**: Run GGUF models locally with `llama-server`. OpenAI-compatible at `localhost:8080`, supports streaming, tool use, and vision (via multimodal projector). No API key required — model discovery via `/v1/models`
- **Local Tool Fallback**: When a local model doesn't support native function calling, the tool-use fallback (JSON-based prompting) now applies to all local providers (Ollama, LM Studio, llama.cpp) — previously only triggered for Ollama
- **Default Model Consolidation**: The per-provider default model mapping was duplicated between the API route and config manager with stale values drifting apart (`claude-3-5-haiku` vs `claude-haiku-4-5`, `gemini-1.5-flash` vs `gemini-2.5-flash`). Extracted to a single `getDefaultModel()` in the provider registry
- **Telemetry Version Fix**: `getAppVersion()` was returning a hardcoded fallback string that went stale each release. Now reads directly from `package.json` — single source of truth, no manual bump needed

## v1.39.0 - 2026-03-05

Two new providers (MiniMax, Zhipu AI), Gemini rebuilt from scratch, and streaming parser improvements for thinking/reasoning display.

- **New Provider: MiniMax**: 5 models — M2.5, M2.5 Highspeed (~100 tps), M2.1, M2.1 Highspeed, and M2. All have 200K context, 128K max output, streaming, and tool calling. Built-in reasoning (always-on, no toggle). Pay-as-you-go from $0.30/$1.20 per 1M tokens, or coding plans from $10/mo
- **New Provider: Zhipu AI (GLM)**: 6 models — GLM-5, GLM-4.7, GLM-4.7 Flash (free), GLM-4.6, GLM-4.6V (vision), and GLM-4.6V Flash (vision, free). Up to 200K context. Supports streaming, tool calling, vision, and thinking mode. Pay-as-you-go from $0.60/$2.20 per 1M tokens, or coding plans from $3/mo
- **Streaming: Thinking/Reasoning Display**: The streaming parser now handles three provider-specific reasoning formats — `reasoning_content` field (Zhipu), inline `<think>` tags in content (MiniMax, Ollama thinking models), and `reasoning` field (DeepSeek via OpenRouter). All are routed to the collapsible thinking section instead of appearing as regular assistant text. A state machine handles `<think>` tags split across chunks, and auto-closes unclosed blocks when tool calls arrive
- **Gemini: Full Rebuild**: The Gemini provider was non-functional — the server was sending OpenAI-format requests to Gemini's native API. Rebuilt with a dedicated transformation layer: messages converted to Gemini's `contents`/`parts` structure, system messages extracted to `system_instruction`, vision content mapped to `inline_data`, and streaming routed to the correct `streamGenerateContent?alt=sse` endpoint. Generation, streaming, vision, tool use, and thinking all work correctly now
- **Gemini: Dynamic Model Discovery**: The model selector now queries Gemini's live API instead of returning a hardcoded list. Fallback models updated from retired 1.5-era to current: Gemini 2.5 Flash (1M context, 65K output), 2.5 Pro, and 2.0 Flash
- **Default Model Updates**: Retired model defaults replaced — Gemini 1.5 Flash → 2.5 Flash, Claude 3.5 Haiku → Claude Haiku 4.5
- **Bug Fix: Zhipu/MiniMax Default Model**: `getProviderDefaultModel()` in ConfigManager was missing cases for the new providers, falling through to the default which returned a DeepSeek model ID
- **Bug Fix: Stream End ThinkTag Flush**: If a stream ended while the `<think>` tag parser had buffered a partial tag prefix (e.g. `<th`), that text was silently lost. Now flushed as content or reasoning on stream end
- **Bug Fix: Error Recovery Tool Call**: The stream parser's error recovery guard required at least one finalized tool call before attempting to salvage an in-progress tool call. Removed the guard so the first tool call is also recovered
- **Bug Fix: Ollama Fallback Headers**: Variable shadowing caused the Ollama tool-calling fallback to send an empty headers object instead of the properly built auth headers
- **Dead Code Removal**: Deleted the `LLMClient` class (~590 lines) — the entire class was unused except for two static methods (`validateApiKey`, `getAvailableModels`), which are now standalone exports. Also removed unused `ProviderSettings` type, unused `icon` field on `ProviderConfig`, unused `DEBUG_TOOL_STREAM` variable, and unused `projectId` from stream parser options

## v1.38.0 - 2026-03-04

Shell `curl` command for inspecting compiled preview output, shell robustness improvements, new benchmark scenarios, and dead code cleanup.

- **Shell: `curl` Command**: New `curl localhost/[path]` command lets the AI (and users in the shell) fetch compiled HTML from the preview engine. Handlebars templates are compiled with partials and data.json resolved, so the output reflects what the browser preview shows. Supports `-s` (silent), `-I` (headers only), `-o FILE` (write to file). Path resolution follows preview conventions: `/` → `/index.html`, `/about` → `/about.html`, `/products/` → `/products/index.html`. The VFS Asset Interceptor script is stripped from output to keep it clean. Only localhost URLs are accepted. Plain `curl` is read-only (works in Chat mode); `curl -o` is a write operation (Code mode only). Listed in the system prompt under Shell commands for both modes
- **Shell: `||` Operator**: The shell now supports the `||` (OR/fallback) operator — `cmd1 || cmd2` runs the second command only if the first fails. Complements the existing `&&` (AND/chain) operator
- **Shell: Durable Redirect Stripping**: Replaced the inline regex filter (`/^2>/`) with a dedicated `stripBashRedirects()` function that walks the args array with an index. Handles both fused (`2>/dev/null`) and split (`2>` `/dev/null`) token forms — the split form previously left an orphaned `/dev/null` argument interpreted as a filename. Covers `2>`, `1>`, `&>`, their `>>` append variants, and `2>&1`. Won't false-positive on path arguments like `/2>file.txt`
- **Shell: Auto-Routing for Misrouted Tool Calls**: When the AI calls a shell command (like `cat`, `curl`, `grep`) as a standalone tool instead of routing through the shell tool, the tool registry now auto-detects this and executes the command through the shell. Previously this was a wasted round-trip with an "Unknown tool" error followed by a retry
- **Bug Fix: Token Estimate in Write Healing**: `estimateTokenCount(String(originalLength))` converted a char count like `5000` to the 4-character string `"5000"`, yielding `~1 token` regardless of content size. Replaced with direct `Math.ceil(originalLength / 4)`. The now-unused `estimateTokenCount` function was removed
- **Code Cleanup**: Removed dead `onCostUpdate` callback (25-line closure passed to streaming parser but never invoked), unused imports (`GenerationAPIService`, `GenerationUsage`, `VirtualFile`, `StreamResponse`), write-only `lastCheckpointId` field, vestigial `fileTree` parameter on `buildShellSystemPrompt`, 4 trivial pass-through wrappers in `string-patch.ts`, `generateSummary()` stub, no-op ternaries in `cp`, redundant `as string` casts, and dead `grep -r` flag. Fixed `||` operator re-executing the last command unnecessarily and variable shadowing in `stableStringify`
- **Benchmark: Preview Scenarios**: Three new test scenarios (`shell-curl`, `shell-curl-path`, `shell-curl-pipe`) under the `shell-preview` category validate that the AI can discover and use `curl` to inspect compiled Handlebars output. Setup includes templates with partials and data.json so assertions verify actual compilation, not raw source

## v1.37.0 - 2026-02-27

System prompt compression and reorganization of how project context reaches the AI model.

- **System Prompt Compression**: Base system prompt reduced from ~5,000 tokens to ~1,800 tokens (~48% reduction including tool definitions). Chat and code mode prompts no longer duplicate the preamble — shared sections extracted into `buildSharedPreamble(isReadOnly)`. File reading flowchart compressed to a 5-line preference list. Write tool section cut from 8 JSON examples to 3 examples + 7 rules; tool schema description reduced from 30 lines to compact one-liners. Evaluation section reduced from ~450 tokens to 3 lines; tool description updated from "Required before finishing work" to "Not needed for simple tasks". Shell tool description reduced from 40 lines to 3 lines. Server context sqlite3 examples reduced from 7 to 3, "COMMON MISTAKES" block removed, backend feature creation patterns compressed to 1-line-each with a `cat /.server/README.md` pointer. Emoji markers and prescriptive language (MUST/NEVER/CRITICAL) softened to direct instructions
- **Project Context in User Message**: Skills list and project file tree moved from the system prompt to the first user message. LLMs weight user messages more heavily than system prompts — these are project state, not behavioral instructions, so they belong closer to the user's request. The system prompt now contains only behavioral content: tool mechanics, `.PROMPT.md` domain instructions, and server context creation patterns. New `buildProjectContext()` export generates the context string; `buildDynamicContent()` consolidates the duplicated `.PROMPT.md` reading and server context loading that was previously copy-pasted between chat and code mode builders
- **Collapsible Project Context UI**: The injected project context no longer appears as raw text in the user's chat bubble. The orchestrator stores clean `displayContent` (user's actual prompt) and `projectContext` separately in `ui_metadata`. The chat panel renders a collapsed "Project context" indicator (click to expand) above the user message. Follows the same collapsible pattern used by tool calls, reasoning, and synthetic errors
- **File Creation Guidelines → Domain Prompt**: The 55-line "CREATE THESE / DON'T CREATE THESE" block moved from the base system prompt to `WEBSITE_DOMAIN_PROMPT` in `lib/llm/prompts/website.ts`. Base prompt retains only "Prefer editing existing files over creating new ones" — the domain-specific guidance now lives where it belongs
- **Bug Fix: Stream Usage Clobbering Header Cost**: When OpenRouter returned actual cost via the `x-openrouter-usage` header, a subsequent `json.usage` chunk in the SSE stream would overwrite `usageInfo` with a fresh object — silently dropping the `cost` and `isEstimated` fields. Now merges stream usage into the existing object with spread (`...usageInfo`) so header-derived cost data is preserved
- **Bug Fix: Noisy Cost Estimation Warnings**: The `[CostCalculator] Using estimated cost based on normalized tokens for OpenRouter` warning fired on every OpenRouter call where cost wasn't in headers — which is most calls. Downgraded to `debug`. The old message also referenced "Generation API for native token counts," a feature that was designed but never wired up
- **Log Level: VFS readFile**: `VFS: File not found for read` downgraded from `error` to `debug`. A missing file is an expected condition (e.g., write tool checks if a file exists before creating it) — callers decide whether it's a problem
- **Shell: Heredoc Support**: The shell tool now supports heredoc syntax (`cat > /file << 'EOF'\ncontent\nEOF`). The heredoc body is extracted before command parsing and piped as stdin to the command — works with `cat` + redirect for writing large files. Supports bare (`EOF`), single-quoted (`'EOF'`), and double-quoted (`"EOF"`) delimiters. This gives LLMs a reliable fallback when the write tool's JSON encoding struggles with large or quote-heavy content. Shell tool description and system prompt updated to document the syntax
- **Handlebars Error Feedback**: Handlebars template compilation errors from the preview now feed back to the LLM asynchronously. New `compile-errors.ts` accumulator module with begin/push/commit/drain lifecycle — VirtualServer pushes errors during `compileProject()` (both pattern-detected and runtime errors like `options.fn is not a function`), and the orchestrator drains them before the next LLM call with a 300ms wait for the debounced preview compilation to finish, injecting a synthetic user message so the LLM can self-correct. Errors are collated per-compilation: rapid recompiles replace rather than accumulate, so the LLM always sees the latest state. Replaces the earlier synchronous post-write `validateTemplate()` approach, which missed cross-file errors and added latency to every write
- **Write Tool: Double-Encoding Healing**: When the LLM sends `operations` as a stringified JSON string that fails to parse, the write tool now attempts 4 healing strategies before giving up: (1) direct parse, (2) fix literal newlines/tabs and retry, (3) JSON structure repair via `attemptJSONRepair()` for truncated brackets, (4) regex content extraction via `extractPartialContent()` for rewrite operations. Previously this was an immediate hard failure that left the LLM stuck in a retry loop. The final error message now also suggests the heredoc fallback

## v1.36.0 - 2026-02-26

Comprehensive benchmark overhaul with assertion-based validation, tool usage analytics, and self-evaluation tracking. Plus `wc` command for the shell.

- **Benchmark Rename**: "Model Tester" renamed to "OSWS Benchmark" across all UI — header, sidebar, project manager button, and info banners reworded to benchmark framing
- **Benchmark: Assertion System**: New programmatic assertion framework replaces the old validation approach. 11 assertion types: `file_exists`, `file_not_exists`, `file_contains`, `file_not_contains`, `file_matches`, `valid_json`, `tool_used`, `tool_args_match`, `output_matches`, `tool_output_matches`, and `judge` (LLM-evaluated). Test pass/fail is now determined by assertions, not just the model's self-evaluation
- **Benchmark: Tool Usage Analytics**: Top-level stats card shows total/successful/failed/invalid tool calls with a per-tool breakdown table (shell, write, evaluation). Invalid tool calls (model hallucinating tools like `read` or `cat` as standalone tools) counted separately
- **Benchmark: Cost & Token Tracking**: Stats cards show running totals for cost (USD), prompt tokens, completion tokens, and total tokens alongside pass rate, timing, and tool stats
- **Benchmark: Self-Evaluation Accuracy**: Tracks whether the model's `goal_achieved` self-assessment matches the assertion-determined result. Displayed as "Self-eval accuracy: X/Y" in track reports and exports — surfaces calibration issues where the model thinks it succeeded but assertions say otherwise
- **Benchmark: Tool Call Details**: Completed tests show an itemized list of every tool call — tool name, success/failure status, and argument preview. Failed tests show specific assertion failure details (e.g. "New title present — still contains Test App") instead of a generic message
- **Benchmark: Live Tool Output**: Generation output stream shows specific tool arguments in real-time (e.g. `[tool] shell — cat /index.html`) instead of the generic `[tool] shell ...`
- **Benchmark: Track Reports & Export**: Track reports include total cost, total tokens, per-tool breakdown, assertion pass rates, and self-eval accuracy. JSON and Markdown exports include the same
- **Shell: `wc` Command**: New `wc` command for counting lines, words, and characters. Supports `-l`, `-w`, `-c` flags and works with stdin via pipes — `find / -type f | wc -l` now works. Documented in system prompt for both Chat and Code modes

## v1.35.0 - 2026-02-25

Decoupled the AI system prompt from website-only output, added per-project `.PROMPT.md` for domain instructions, made the preview entry point configurable, and improved the AI shell tooling.

- **System Prompt Separation**: The monolithic system prompt is now split into a base prompt (tool mechanics, stays in code) and a domain prompt (website knowledge, lives in `.PROMPT.md` per-project). The base prompt no longer contains any website-specific instructions — platform constraints, Handlebars docs, and routing rules all moved out
- **`.PROMPT.md` Loading**: Both Code and Chat mode prompts now read `/.PROMPT.md` from the project's VFS at conversation start. If the file exists, its content is appended as domain instructions; if not, the AI operates with the base prompt only
- **Templates Include `.PROMPT.md`**: All 4 built-in templates (Barebones, Example Studios, Landing Page, Blog) now ship with `/.PROMPT.md` containing the website domain prompt — new projects get full website instructions out of the box
- **Missing `.PROMPT.md` Notification**: Existing projects without a `.PROMPT.md` file show a subtle amber banner at the bottom of the file explorer — click "Add" to create the default website prompt, or "Dismiss" to hide (persisted per-project in localStorage)
- **Configurable Entry Point**: New `previewEntryPoint` project setting — right-click any file in the explorer and choose "Set as Entry Point" to change which file the preview loads first. Defaults to `/index.html` when unset
- **File Explorer Indicators**: Entry point file shows a green Home icon with "(entry)" badge; `.PROMPT.md` shows an amber ScrollText icon with "(AI prompt)" badge
- **Template Rename: "Blank" → "Website Starter"**: The Blank template has been renamed to "Website Starter" to better describe its purpose. Internal ID (`blank`) is unchanged.
- **Tool Rename: `json_patch` → `write`**: The file editing tool presented to LLMs is now named `write` instead of `json_patch`. This is a pure identifier rename — all parameters, operation types (update, rewrite, replace_entity), and internal behavior are unchanged. The rename improves tool selection behavior by using a universally understood name that LLMs naturally gravitate toward, reducing wasted generation cost from incorrect tool choices.
- **Shell Pipes**: Commands can now be chained with `|` — stdout from the left command becomes stdin for the right. Supports multi-stage pipes: `cat /file.txt | grep pattern | head -n 5`. Commands that accept stdin: cat, head, tail, grep, rg, sed.
- **Generic Redirects**: All commands now support `>` (overwrite) and `>>` (append) to write stdout to a file. Previously only `echo` supported `>`. Now `grep -n div /index.html > /results.txt` and `sed 's/old/new/' /f.txt > /out.txt` work as expected.
- **sed Command**: New `sed` command for text substitution. Supports `s/pattern/replacement/[g]` syntax, `-i` for in-place editing, `-e` for multiple expressions, and stdin via pipes. Delimiters: `/`, `|`, `#`, `@`.
- **Repeat Helpers**: Added `{{#times N}}`, `{{#repeat N}}`, and `{{#for N}}` block helpers — all equivalent, repeat content N times with `index`, `first`, `last` context variables. Fixes persistent LLM-generated `{{#for}}` errors (e.g., star ratings). Documented in website prompt and handlebars-advanced skill.
- **Tool Call Analytics**: Expanded `tool_call` telemetry events with safe, whitelisted operation details — shell events now include the command name, pipe/redirect flags; write events include file extension and operation types; evaluation events include goal/continue status. All values are whitelisted to prevent accidental capture of file contents or user code.

## v1.34.0 - 2026-02-22

Major architectural restructure: backend features are now **project-scoped** and "Sites" have been renamed to **"Deployments"** throughout.

- **Sites → Deployments**: The "Site" concept is now "Deployment" everywhere — UI, API routes (`/api/sites/*` → `/api/deployments/*`), URL paths (`/sites/{id}/` → `/deployments/{id}/`), and admin views. Existing databases migrate automatically
- **Project-Scoped Backend**: Edge functions, server functions, secrets, and scheduled functions are now managed at the project level instead of per-deployment. On publish, features are extracted into the deployment's runtime — so one project can power multiple deployments
- **Per-Project Database**: Each project can have its own SQLite database for user-defined tables. Template schemas are applied on project creation; on publish, schema + data are extracted to the deployment runtime
- **Split Deployment Databases**: The old unified database is now split into `runtime.sqlite` (functions, secrets, user tables) and `analytics.sqlite` (pageviews, sessions) per deployment. Automatic migration on first access
- **"Server Features" → "Backend"**: The umbrella term renamed to "Backend" in all UI labels, toolbar buttons, template badges, and docs
- **Project Backend Panel**: New tabbed modal for managing backend features at the project level — edge functions, server functions, secrets, scheduled functions, and a rewritten schema editor with Tables, SQL, and DDL tabs
- **Deployment Selector**: New dropdown in the workspace header to choose which deployment's runtime context the AI should be aware of
- **Project Swap**: When repointing a deployment to a different project, a conflict analysis dialog shows added/removed/changed features so you can review before confirming
- **Template Unification**: Removed the separate "Site template" type — all templates now use a single format with an optional `backendFeatures` field. Older `.oswt` files with the legacy `serverFeatures` key still import correctly
- **Security**: Sync API no longer returns secret values in GET responses; deployment ID format validated before database path interpolation

**Upgrading (Server Mode):** Back up your `data/` and `sites/` directories before updating. This release runs automatic migrations that rename `sites/` to `deployments/` and split unified databases into `runtime.sqlite` + `analytics.sqlite`. Browser Mode users are unaffected.

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
- **Server Context Integration** (Experimental): AI awareness of site backend features
  - Site Selector dropdown in workspace header to choose site context
  - `/.server/` hidden folder with transient files containing server context
  - AI receives edge functions, database schema, server functions, and secret names
  - Hidden folder icons: purple book for `/.skills/`, orange server for `/.server/`
- **AI Read-Write Access to Backend Features**:
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