# Frequently Asked Questions

---

## General

### What is OSW Studio?

OSW Studio (Open Source Web Studio) is a browser-based AI development environment where you describe what you want and an AI agent writes the code. It supports multiple project runtimes — Static websites (HTML/CSS/JS), React, Preact, Svelte, and Vue — all compiled in the browser with no build tools needed.

### Is OSW Studio free?

The application itself is **free and open source** (MIT license). However:
- **BYOK (Bring Your Own Key)**: You provide your own AI API keys
- **API costs**: You pay providers directly for AI usage (typically $0.01-$0.10 per request)
- **Local models**: Ollama and LM Studio are completely free (run on your machine)

### What can I build with OSW Studio?

**You can build**:
- Landing pages and marketing sites
- Portfolios and personal websites
- Blogs and content sites
- Prototypes and demos
- Documentation sites
- Static web applications (front-end only)

**With Server Mode, you can also build:**
- Sites with backend edge functions (REST APIs)
- SQLite databases for dynamic content
- User authentication and comments
- Contact forms with email notifications

**You cannot build:**
- Node.js/Python/PHP backends (only edge functions in Server Mode)
- Real-time applications requiring WebSocket servers

### Do I need an API key?

- **Cloud providers** (OpenAI, Anthropic, etc.): Yes, get key from provider
- **HuggingFace**: Free tier with $0.10/month credits — create a token at [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens) with "Inference Providers" permission. On HF Spaces, OAuth sign-in is also available (no token needed).
- **ChatGPT subscription** (Plus/Pro): No API key needed — authenticate with your ChatGPT session via the Codex CLI. See [Getting Started](?doc=getting-started) for setup.
- **Local providers** (Ollama, LM Studio): No, run models locally for free

### Is my data private?

**Browser Mode** (default):
- All data stays in your browser (IndexedDB)
- Code never sent to OSW Studio servers (we don't have servers!)
- Only sent to AI provider when you generate

**Server Mode** (optional):
- Data stored locally on your server
- You control the infrastructure

**AI Providers**:
- Your code is sent to AI provider when generating
- Check provider's privacy policy
- Use local models (Ollama/LM Studio) for complete privacy

**Token storage**:
- API keys are stored in localStorage (browser-only, never sent to OSW Studio)
- ChatGPT session: the refresh token is in an HttpOnly cookie so JS can't read it; only a short-lived access token (~1 hour) stays in localStorage

---

## Features

### What's the difference between Chat and Code mode?

**Chat Mode** (read-only):
- AI can read your code
- Ask questions, get explanations
- Plan features
- AI **cannot** edit files

**Code Mode** (full editing):
- AI can create, edit, delete files
- Implement features
- Fix bugs
- Full project modifications

**When to use**: Chat for planning, Code for implementation

### How do checkpoints work?

**Starting point**:
- Created automatically when you open a project (if no prior save exists)
- "Discard Changes" reverts to the state when you opened the project — your last manual save if one exists, or the Starting Point otherwise

**Auto-checkpoints**:
- Created after every AI operation
- Last 10 kept per project (50 global limit across all projects)
- Only auto-checkpoints are evicted — manual saves and the Starting Point are protected

**Manual save** (Cmd/Ctrl+S):
- Permanent save that persists across refreshes
- All saves are kept in the **Checkpoints Panel** so you can browse and restore any of them

**Best practice**: Save often, especially before major changes

### Can I work offline?

**Yes, partially**:
- ✅ Edit files in Monaco editor
- ✅ Browse file explorer
- ✅ View live preview
- ❌ AI generation (requires internet + API)

**Fully offline with local models**:
- Install Ollama or LM Studio
- Download models
- No internet needed for AI

### Can I collaborate with others?

**Not directly**, OSW Studio is single-user. However:
- Export projects as .osws and share files
- Use Server Mode with shared database (advanced)
- Export ZIP and collaborate via git

### How much does AI generation cost?

**Varies by provider and model**:
- **GPT-4o-mini**: ~$0.02-0.05 per request
- **Claude 3.5 Haiku**: ~$0.01-0.03 per request
- **GPT-4o**: ~$0.10-0.30 per request
- **Claude 3.5 Sonnet**: ~$0.05-0.15 per request
- **Ollama/LM Studio**: Free (local)

**Cost tracking**: View in project cards and settings (accurate with OpenRouter only)

---

## Technical

### What file types are supported?

**Text** (5MB limit):
- HTML, CSS, JavaScript, JSON
- TypeScript, TSX, JSX
- Svelte (.svelte), Vue (.vue)
- Markdown, TXT, XML, SVG
- Handlebars (.hbs)

**Binary** (10MB images, 50MB video):
- Images: PNG, JPG, GIF, WebP
- Video: MP4, WebM

### How big can projects be?

**Browser Mode**: ~50MB total (IndexedDB quota)
**Server Mode**: Database-dependent (usually much larger)

**Recommendation**: Keep projects focused, compress images

### Does it support TypeScript?

Yes — create a project with any bundled runtime (React, Preact, Svelte, or Vue). `.tsx`, `.ts`, `.jsx`, `.svelte`, and `.vue` files are bundled automatically in the browser via esbuild. For static projects, you can write plain JavaScript or include TypeScript via external tooling.

### Can I install npm packages?

In **React, Preact, Svelte, and Vue projects**, you can `import` npm packages by name (e.g., `import { motion } from "framer-motion"`) and they're fetched from a CDN at runtime — no `npm install` needed.

In **static projects**, use CDN links or `<script>` tags:
- CDN links (e.g., unpkg.com, cdnjs.com)
- Include libraries via `<script>` tags
- Vanilla JavaScript works great

**Example**:
```html
<!-- Add React from CDN -->
<script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
```

### How does Handlebars work?

**Build-time templating**:
- Write `.hbs` files in `/templates/` as reusable partials
- Include them in HTML files with `{{> partialName}}`
- Define data in `/data.json` — it's automatically loaded as template context
- Export and publish compile partials into static `.html`
- Not runtime (no Handlebars.js included in output)

**Example**:
```handlebars
{{!-- /templates/header.hbs --}}
<header><h1>{{siteName}}</h1></header>

{{!-- /data.json --}}
{ "siteName": "My Site" }

{{!-- /index.html --}}
{{> header}}
<main>Content</main>
```

**Export** → `index.html` with header compiled in and `siteName` rendered

**Used by**: Example Studios template, Blog template (navigation, footer, comments partials)

---

## Deployment

### Where can I deploy my projects?

**Static Hosts** (Recommended):
- Vercel
- Netlify
- GitHub Pages
- Cloudflare Pages
- AWS S3 + CloudFront

**How**: Export → ZIP → Upload to host

### Do I need a server?

**No!** OSW Studio builds static sites that run on:
- Any web server
- CDN (content delivery network)
- Static hosting services
- Even file:// protocol (local)

### How do I setup SSL/HTTPS?

Most static hosts provide free SSL:
- **Vercel**: Automatic
- **Netlify**: Automatic
- **GitHub Pages**: Automatic
- **Cloudflare Pages**: Automatic

**Note**: Hosting providers typically include custom domain support with automatic SSL provisioning.

### What about SEO?

**OSW Studio supports**:
- Meta tags (title, description, keywords)
- Open Graph (social sharing)
- Sitemap.xml (Server Mode only)
- Robots.txt (Server Mode only)
- Semantic HTML

**You should**:
- Use descriptive titles/descriptions
- Alt text on images
- Clean URL structure
- Fast loading times

---

## Server Mode

### What's the difference between Browser and Server Mode?

**Browser Mode** (default):
- Pure client-side
- IndexedDB storage
- No authentication
- No site publishing

**Server Mode** (optional):
- Local database (no external database needed)
- Admin authentication
- Site publishing system
- Next.js routing

**See**: [Server Mode Guide](?doc=server-mode)

### When should I use Server Mode?

**Use Server Mode if**:
- You want server-side persistence
- Need site publishing features
- Building production systems
- Multi-device access

**Stick with Browser Mode if**:
- Personal use
- Quick prototyping
- Privacy-focused
- Don't need publishing features

### How do I enable Server Mode?

1. Set environment variables:
```bash
NEXT_PUBLIC_SERVER_MODE=true
SESSION_SECRET=...
ADMIN_PASSWORD=...
```
2. Run `npm install && npm start`

**See**: [Server Mode Guide](?doc=server-mode) for complete setup

### Can I run periodic/background tasks?

Yes! **Scheduled Functions** let you run edge functions on a cron schedule. Use them for database cleanup, report generation, API syncing, or any recurring task.

1. Create an edge function with the logic you want to run
2. Go to **Server Settings → Schedules**
3. Create a schedule with a cron expression (e.g., `0 8 * * *` for daily at 8am)
4. Link it to your edge function and optionally pass config data

**See**: [Backend → Scheduled Functions](?doc=backend-features#scheduled-functions-cron-jobs)

---

## Troubleshooting

### Why isn't the AI responding?

**Common causes**:
1. **Invalid API key**: Check settings
2. **Rate limit**: Wait 1 minute, retry
3. **Model unavailable**: Try different model
4. **Network issue**: Check internet connection

**See**: [Troubleshooting Guide](?doc=troubleshooting)

### Files not saving?

1. Check browser console (F12) for errors
2. Try Cmd/Ctrl+S explicitly
3. Check IndexedDB quota (may be full)
4. Export project as backup

### Preview not updating?

1. Click ↻ refresh button
2. Hard refresh preview (right-click → Inspect → Hard Reload)
3. Save file first (Cmd/Ctrl+S)

### Lost my project?

**If you saved**:
- Projects persist in IndexedDB
- Check other browser profiles
- Import .osws backup if you have one

**If you didn't save**:
- In-memory checkpoints cleared on refresh
- Unfortunately, can't recover unsaved work
- **Lesson**: Save often!

---

## Skills & Templates

### What are Skills?

AI guidance documents injected into the system prompt. They teach the AI how to approach specific tasks.

**Built-in**: OSW Workflow, Handlebars Advanced, Accessibility

**See**: [Skills Guide](?doc=skills)

### What are Templates?

Reusable project starting points with files, structure, and metadata.

**Built-in Templates**: Website Starter (minimal), Example Studios (multi-page portfolio), Starter (React + TypeScript), React Demo: Task Tracker, Starter (Preact + TypeScript), Starter (Svelte), Starter (Vue), Landing Page with Contact Form (backend), Blog with Comments (backend)

**See**: [Templates Guide](?doc=templates)

### Can I create custom Skills?

Yes! Skills are markdown files with YAML frontmatter:
1. Go to Skills view
2. Click "+ New Skill"
3. Write instructions
4. Save and enable

### Can I create custom Templates?

Yes! Export any project as template:
1. Right-click project
2. "Export as Template"
3. Fill metadata
4. Download .oswt file
5. Import into any OSW Studio instance

---

## Getting Help

### Where can I get support?

1. **Documentation**: Check relevant guide first
2. **GitHub Issues**: [Report bugs or request features](https://github.com/o-stahl/osw-studio/issues)
3. **Community**: Check GitHub Discussions

### How do I report a bug?

1. Go to [GitHub Issues](https://github.com/o-stahl/osw-studio/issues)
2. Search existing issues
3. If new, create issue with:
   - Clear description
   - Steps to reproduce
   - Expected vs actual behavior
   - Browser/OS version
   - Error messages (F12 → Console)

### Can I contribute?

Yes! OSW Studio is open source. Visit the [GitHub repository](https://github.com/o-stahl/osw-studio) for:
- Code contributions
- Documentation improvements
- Bug reports
- Feature requests

---

## Next Steps

- [Getting Started](?doc=getting-started) - Create your first project
- [Working with AI](?doc=working-with-ai) - Get better results
- [Troubleshooting](?doc=troubleshooting) - Common issues
- [Server Mode](?doc=server-mode) - Advanced features
