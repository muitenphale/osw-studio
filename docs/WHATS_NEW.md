# What's New

Welcome to OSW Studio! This page highlights the latest features and updates.

**First time here?** Start with the **[Overview](?doc=overview)** or jump straight to **[Getting Started](?doc=getting-started)** to build your first website in 5 minutes.

---

## v1.17.0

### Reasoning Token Support

See what the AI is thinking! Models with reasoning capabilities now display their thought process in a collapsible "reasoning" block in the chat panel.

- **Anthropic extended thinking** - Claude models with thinking enabled
- **DeepSeek Reasoner** - DeepSeek's reasoning model
- **Gemini thinking models** - Gemini 2.5 Flash/Pro with thinking

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

Self-host OSW Studio with PostgreSQL for a complete web publishing platform. Server Mode adds:

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

Full compatibility with Gemini 2.5 Flash, 2.5 Pro, and 3 Pro thinking models via OpenRouter.

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
