# Templates

**Start your projects faster with pre-built templates.**

Templates are ready-to-use website starting points that include complete file structures, styling, and functionality. Use them to skip the initial setup and start customizing right away.

---

## What Are Templates?

Templates are complete website projects that you can use as starting points:

- **Complete structure** - All HTML, CSS, and JavaScript files
- **Professional design** - Ready-to-use layouts and styling
- **Customizable** - Modify anything to match your needs
- **Learning resources** - Study well-structured code

**Think of templates as:**
- Website blueprints you can build upon
- Starter kits that save time
- Examples of best practices
- Shortcuts to professional results

---

## Template Types

Each template has a **runtime** that determines how the project is built and previewed. The runtime badge is shown on each template card.

| Runtime | Description |
|---------|-------------|
| **Static** | Pure HTML, CSS, and JavaScript (ES module imports supported) |
| **Handlebars** | HTML, CSS, and JavaScript with Handlebars templating |
| **React** | Component-based React + TypeScript with automatic bundling |
| **Preact** | Lightweight React alternative (~3KB) with signals support |
| **Svelte** | Svelte 5 with compile-time reactivity and runes |
| **Vue** | Vue 3 with Composition API and SFC support |
| **Python** | Python scripts via Pyodide WASM, running in an interactive Console |
| **Lua** | Lua scripts via wasmoon WASM, running in an interactive Console |

Some templates also include **backend features** — edge functions, database schema, server functions, and secrets. These show a "Backend" badge and require Server Mode for full functionality. In Browser Mode, backend templates create the frontend files normally.

---

## Finding a Template

The template list is grouped by what you're setting out to make, not by which framework a template
happens to use:

- **Runtime starters** - the smallest working setup for a runtime, from plain HTML to Svelte or Python
- **Website** - pages you publish and people read: portfolios, blogs, documentation
- **Workspace** - files you keep working in: notes, research, reference, writing
- **App** - something people use: forms, inboxes, tools with a backend behind them
- **Project Kit** - scaffolds you export and run elsewhere

Runtime starters starts closed. It describes starting points rather than what you are setting out to
make, and it is eight rows that would otherwise sit in front of every section that does. Click any
heading to fold a section away or open it, and that choice is remembered the next time you open the
list. A closed section holding the template you have picked says so.

Search covers names, descriptions, tags and runtimes, so typing `svelte` still finds the Svelte
templates wherever they sit, including inside a folded section, which opens for as long as the
search matches something in it. Every row keeps its runtime badge, and the template you pick is
what sets the project's runtime; you can change it later in project settings.

Sections with nothing in them aren't shown, so you may not see all five.

---

## Built-in Templates

Grouped the way the template list groups them.

### Runtime starters

The smallest working setup for a runtime, from plain HTML to Svelte or Python. This section starts
closed, because these describe a starting point rather than what you are setting out to make.

#### Static Starter

Minimal starting point with basic structure.

**Includes:**
- Single `index.html`
- Basic CSS file
- Empty JavaScript file
- Clean slate for building

**Best for**: Starting from scratch with minimal setup

#### Handlebars Starter

Handlebars-powered website with templating and partials.

**Includes:**
- `index.html` with Handlebars partial includes
- `/templates/` directory for reusable partials
- `data.json` for template data
- `.PROMPT.md` with Handlebars-specific AI instructions

**Best for**: Sites that benefit from reusable components (navigation, footer) and data-driven content

---

#### React Starter

Component-based React app with TypeScript and automatic bundling.

**Includes:**
- `index.html` shell with bundle references
- `src/main.tsx` entry point
- `src/App.tsx` Hello World component
- `.PROMPT.md` with React-specific AI instructions

**Best for**: Starting a React app from scratch with AI, component-driven UIs

#### Preact Starter

Lightweight React alternative with signals for reactive state.

**Includes:**
- `index.html` shell with bundle references
- `src/main.tsx` entry point
- `src/App.tsx` Hello World component
- `.PROMPT.md` with Preact-specific AI instructions

**Best for**: Small, fast apps where bundle size matters. Same API as React but ~3KB

#### Svelte Starter

Svelte 5 app with compile-time reactivity and runes.

**Includes:**
- `index.html` shell with bundle references
- `src/main.ts` entry point
- `src/App.svelte` counter component using `$state()` rune
- `.PROMPT.md` with Svelte-specific AI instructions

**Best for**: Apps that benefit from compile-time optimization, scoped styles, and minimal boilerplate

#### Vue Starter

Vue 3 app with Composition API and single-file components.

**Includes:**
- `index.html` shell with bundle references
- `src/main.ts` entry point
- `src/App.vue` counter component using `ref()` and `@click`
- `.PROMPT.md` with Vue-specific AI instructions

**Best for**: Progressive apps, gentle learning curve, familiar HTML-like template syntax

#### Python Starter

Python script running in the browser via Pyodide WASM.

**Includes:**
- `main.py` entry point
- `.PROMPT.md` with Python-specific AI instructions
- Runs in interactive Console (not live preview)

**Best for**: Scripts, data processing, algorithms, learning Python

#### Lua Starter

Lua script running in the browser via wasmoon WASM.

**Includes:**
- `main.lua` entry point
- `.PROMPT.md` with Lua-specific AI instructions
- Runs in interactive Console (not live preview)

**Best for**: Scripting, game logic prototyping, learning Lua

---

### Website

Pages you publish and people read.

#### Example Studios

A multi-page agency portfolio showing OSW Studio's capabilities.

**Includes:**
- Multiple HTML pages with Handlebars partials
- `data.json` for site-wide data (site name, navigation, social links)
- Responsive design with modern CSS
- Interactive elements (portfolio gallery, contact form)

**Best for**: Learning how OSW Studio works, understanding Handlebars partials

#### Business Website

One page for one local business: what you do, what it costs, when you are open and where to find you. It arrives filled in as a joinery workshop so you can see a finished site rather than a wireframe, and all of that content is meant to be replaced.

**Includes:**
- Single `index.html` holding every word on the site, so the page renders instantly and reads correctly to search engines
- Sections for services, pricing, opening hours, location and contact, linked from the navigation
- A palette and two typefaces set by six custom properties at the top of the stylesheet
- Prompt suggestions that convert it to a restaurant, a trade, or your own business

Contact is email and phone. Storing what visitors send needs Server Mode, and the page says so rather than offering a form that discards messages.

**Best for**: Local businesses, trades, practices, anyone whose customers want hours and a phone number

#### Portfolio & CV

One page about one person: selected work, a short bio, work history and how to reach you. Follows the system light or dark setting.

**Includes:**
- Single `index.html` with work entries, an about section and a work history list
- A one-column layout that does its work through type and space
- Prompt suggestions for adding a project, giving one its own case study page, and sharpening write-ups that describe responsibilities rather than outcomes

The seed content is invented, and the AI instructions tell the assistant to ask you for real details rather than making them up.

**Best for**: Developers, designers, writers, students, anyone job hunting

#### Blog with Comments (Backend)

Static blog with user authentication and moderated comments.

**Includes:**
- Static HTML blog posts in `/blog/` directory
- Handlebars partials for navigation, footer, and comments section
- `data.json` post index for the home page
- 6 edge functions (comments, auth: register, login, logout, auth-status)
- Database schema for comments, users, and sessions

**File structure:**
```
/data.json                    — Site metadata + posts array
/index.html                   — Blog home (renders post list via Handlebars)
/blog/hello-world.html        — Static blog post with {{> comments}} partial
/blog/getting-started.html    — Static blog post with {{> comments}} partial
/styles/style.css             — All styles
/scripts/main.js              — Comments + auth JS (no post loading)
/templates/navigation.hbs     — Nav partial (uses {{siteName}}, {{navigation}})
/templates/footer.hbs         — Footer partial
/templates/comments.hbs       — Comments section partial (lazy-loaded)
```

**How it works:**
- Blog posts are individual HTML files — no database needed for content
- The home page uses `{{#each posts}}` from `data.json` to list posts
- Post links like `/blog/hello-world.html` are in static HTML, so the static builder correctly rewrites them for published deployments under `/deployments/{id}/`
- Only comments and auth remain dynamic (edge functions)
- In Browser Mode, comments fall back to localStorage

**Adding new posts:**
1. Create a new HTML file in `/blog/` (e.g., `/blog/my-post.html`)
2. Include `{{> navigation}}`, `{{> comments}}`, and `{{> footer}}` partials
3. Add an entry to the `posts` array in `/data.json`
4. Or just ask the AI to create a new post!

**Best for**: Personal blogs, content sites with community interaction

---

### Workspace

Files you keep working in. The page is a way to read what is there; the assistant maintains the files.

#### LLM Wiki

A knowledge base the assistant writes and keeps current as you add sources. An implementation of the
LLM Wiki pattern described by [Andrej Karpathy](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f).

Most ways of using an LLM with documents re-read the raw files on every question, so nothing
accumulates: the tenth question knows no more than the first. Here the assistant compiles what it
reads into a wiki and then keeps it current. When a source arrives it writes the source page,
revises the pages that source touches, flags where it contradicts what was already claimed, and logs
what it did. The cross-references and the contradictions are on disk before you ask.

**Three layers:**
- `/raw/` is yours: the sources as they came. The assistant reads them and never edits them
- `/wiki/` is the assistant's: interlinked Markdown it writes and keeps consistent
- `.PROMPT.md` is the schema: the conventions and the workflow, which you and the assistant change together as you learn what suits your subject

**Three operations**, and the prompt suggestions above the message box are exactly these:
- **Ingest**: read a source, write its page, update everything it touches, log it
- **Ask the wiki**: answer from the pages with citations, and file good answers back as new pages instead of losing them to chat history
- **Lint**: find contradictions, stale claims, orphan pages, links to pages that were never written, and gaps two sources mention but nothing covers

**Includes:**
- `wiki/index.md`, the catalogue the sidebar is built from, and `wiki/log.md`, an append-only history
- A seed wiki on street trees and summer heat: a synthesis, three concept pages, three source pages and an open-questions page, with a real contradiction running through them
- A reader with full-text search, tag filters, `[[wiki links]]` you can click, and a "linked from" list at the foot of every page
- Links to pages that do not exist yet are drawn dashed, so what the assistant still owes you is visible

**How it works:** give the assistant a source and ask it to ingest. It writes the pages; you curate
the sources and ask the questions. The page only reads, because a static page cannot write back to
the project, so changes go through the assistant and there is one source of truth.

**Best for**: Researching a subject over weeks, reading a book closely, competitive analysis, due
diligence, anything where knowledge should accumulate rather than scatter

#### Projects & Tasks

A board of what you are working on and what is left, with each project stating what finished looks like.

**Includes:**
- `tasks.json` holding the projects, their objectives and every task
- A board with To do, In progress and Done columns, filtered by project
- Prompt suggestions for adding a project, marking work done, and asking what to do this week

**The page only reads.** There are no checkboxes and no form for adding tasks, because a static page cannot write back to the project: a tick would either vanish on reload or hide in browser storage where the assistant cannot see it, and the board would then disagree with the file. Changes are made by asking.

**Best for**: Personal planning, small projects, anyone who would rather describe a change than fill in a form

---

### App

Something people use.

#### Landing Page with Contact Form (Backend)

Professional landing page with a working contact form powered by Resend email.

**Includes:**
- Single-page design with contact form
- 2 edge functions (`submit-contact`, `contact-status`)
- Database schema for storing messages, readable in the Database panel
- Optional Resend email integration (requires API key)

**Best for**: Business landing pages, lead capture, contact forms

#### Store Locator

A map of your locations beside a searchable list of the same places. Clicking a location moves the map; clicking a marker highlights the list entry.

**Includes:**
- `locations.json` with each location's address, coordinates, opening hours, phone and a note
- A map drawn with Leaflet over OpenStreetMap tiles, with attribution
- Search across name, address and postcode

The map is loaded from the network. Without a connection the list still works and a line appears where the map would be. Coordinates have to be real: the AI instructions tell the assistant to ask for them rather than guess, because a guessed latitude puts a shop in a field convincingly.

**Best for**: Retailers, chains, clinics, anyone with more than one address. Also a good candidate for embedding in an existing site with an iframe

#### Guided Chat

A chat widget where every reply is written in advance and every answer the visitor gives is a button. It looks like a chatbot and behaves like a decision tree, so it needs no model, no API key and no server.

**Includes:**
- `flow.json` holding the entire conversation as steps and choices
- A chat interface with a transcript and a restart button
- A seed flow answering the questions a small business actually gets, with real prices

Nothing is stored and nothing is sent anywhere. Reloading starts over. Capturing what visitors asked would need Server Mode, and telling them it is being recorded.

**Best for**: Answering the same handful of questions on a site, qualifying enquiries, embedding in an existing page

#### AI Assistant (Backend)

A chat page whose answers come from a model, with the API key held in a server function so it never reaches the browser. **Needs Server Mode**, which is the point of the template: a static page cannot keep a secret, because everything it contains is downloaded by every visitor.

**Includes:**
- `ask`, a server function that holds the system prompt and calls the model
- `ai-status`, a probe so the page can tell whether it has a server
- An `AI_API_KEY` secret placeholder, set in the Backend panel
- A chat page that disables itself and explains why when there is no server

Works with any OpenAI-compatible endpoint by changing two constants in the `ask` function. Replies arrive whole rather than streaming. Nothing is stored, there is no rate limiting by default, and a published page with a working key can be used by anyone who finds it: add a limit or keep the deployment private before putting it in public.

**Best for**: A support or FAQ assistant that knows about one business, and for seeing what Server Mode is for

#### To-do List

A personal checklist you add to, tick off and delete, kept in the browser it was written in. The
list is saved to `localStorage` as you change it, so it is still there next time the page opens. It
is not sent anywhere: it will not follow you to another device, and clearing site data clears it.
The page says so at the bottom, and says something different if the browser refuses to save at all,
which is what a private window does.

**Includes:**
- `index.html` shell with bundle references
- `src/main.tsx` entry point
- `src/storage.ts` reading and writing the list, with the key scoped per page
- `src/App.tsx` holding the task array and saving on every change
- `src/components/TaskForm.tsx` controlled input with form submit
- `src/components/TaskItem.tsx` checkbox toggle and delete
- `src/App.css` styles

**Best for**: A checklist of your own, and for reading a small React app end to end: state in one
place, changes travelling down as props, and persistence kept in a module of its own

---

### Project Kit

Scaffolds you export and run elsewhere.

#### Spring Boot REST API

A layered Spring Boot and PostgreSQL service: controller, service, domain, JPA adapter, Flyway migrations, validation, error handling and unit tests, with Docker Compose for the database.

**Includes:**
- A complete Maven project under `src/main/java/`
- Flyway migration and `application.yml`
- Unit tests and a context test
- `AGENTS.md` and `docs/architecture.md`, which travel with the repository
- A project overview page as the preview

**OSWS cannot build or run Java.** There is no Maven, Docker or PostgreSQL here, so nothing in the project has been compiled or tested. The preview is an informational page saying so, and the instructions tell the assistant to never claim it verified anything. Download the project and run it with Maven.

**Best for**: Starting a Spring Boot service with its structure and conventions already decided

---


## Using Templates

### Create Project from Template

1. Click **Projects** in sidebar
2. Click **+ New Project**
3. Select **Use a template**
4. Browse available templates
5. Click on a template to preview
6. Click **Use This Template**
7. Name your project
8. Click **Create**

Your project opens with all template files ready to customize.

**Backend templates in Server Mode:** When you create a project from a backend template, OSW Studio automatically syncs the project to the server, creates a deployment, and provisions all backend features (database tables, edge functions, server functions, secret placeholders). You'll see a summary of what was provisioned.

### Customize the Template

Once your project is created, modify it like any other project:

**Using AI:**
```
Change the color scheme to blue and green
```

```
Replace the hero section with a full-width image banner
```

```
Add a contact form to the contact page
```

**Manually:**
- Edit files directly in the code editor
- Add/remove files as needed
- Update content and styling

---

## Creating Your Own Templates

Turn any project into a reusable template.

### When to Create Templates

Create templates for:
- Website structures you build often
- Client starter kits
- Personal boilerplate code
- Team standards

### How to Create a Template

1. **Build your project**
   - Create a complete, working website
   - Include all files and assets
   - Test thoroughly

2. **Create a template**
   - Open the project
   - Click **Menu** (⋮) → **Create a Template**
   - Fill in template information:
     - Name
     - Description
     - Category
     - Tags
     - Preview image (optional)
   - The template is saved to your instance's template library

3. **Use your template**
   - Find it in the Templates view
   - Create new projects from it
   - Export to `.oswt` from the Templates view to share with others

###What Makes a Good Template

**✅ Include:**
- Clear, organized file structure
- Commented code for guidance
- Responsive design
- Common pages (home, about, contact)
- Reusable components

**❌ Avoid:**
- Personal/client-specific content
- Hardcoded data that should be dynamic
- Overly complex structures
- Unnecessary files

---

## Managing Templates

### Browse Templates

1. Click **Templates** in sidebar
2. View available templates
3. Filter by category or search
4. Click to preview

### Delete Templates

1. Go to Templates view
2. Find the template
3. Click **Delete** (trash icon)
4. Confirm deletion

**Note**: Built-in templates can't be deleted.

---

## Importing & Exporting Templates

### Export a Template

Share your templates with others:

1. Go to **Templates** view
2. Find your template
3. Click **Export** (download icon)
4. Save the template file (`.oswt`)

### Export a Deployment as Template

In Server Mode, export a published deployment with its backend features:

1. Go to **Deployments** view
2. Click the dropdown menu on a deployment card
3. Select **Export as Template**
4. Backend features (edge functions, database schema, server functions, secrets) are automatically included

### Import a Template

Use templates from others:

1. Click **Templates** in sidebar
2. Click **Import Template**
3. Select template file
4. Template appears in your library

---

## Template Tips

**💡 Start with a template**
Even if you'll heavily customize it, starting from a template is faster than from scratch

**💡 Create templates for repetition**
Building similar sites for clients? Create a template once, reuse forever

**💡 Specific is fine**
A template narrow enough to describe in one line is easier to find and easier to start from than a
general one you have to adapt. Make it as specific as the job you actually do repeatedly

**💡 Document your templates**
Add comments in the code explaining sections and how to customize

**💡 Update your templates**
Improve them over time as you learn better patterns

---

## Templates vs Skills

**Templates** = Starting point for a project
- Complete file structure for any runtime (Static, Handlebars, React, Preact, Svelte, Vue, Python, Lua)
- Some templates include backend features (edge functions, database schema, secrets)
- Backend features are provisioned automatically in Server Mode

**Skills** = Instructions for AI
- Markdown documents
- Teach AI your preferences
- Guide AI's behavior

Use templates to start projects. Use skills to improve how AI builds them.

**[Learn about Skills →](?doc=skills)**

---

## Common Questions

**Q: Can I modify templates after creating a project?**
A: Yes! Once you create a project from a template, it's yours to modify completely.

**Q: Do I need to credit template authors?**
A: Check the template's license. Most templates you create are yours to use freely.

**Q: Can I sell websites built from templates?**
A: Built-in templates are yours to use commercially. For imported templates, check their license.

**Q: How many templates can I have?**
A: No limit. Create as many as you need.

**Q: What happens if I use a backend template in Browser Mode?**
A: The frontend files are created normally. Backend features (edge functions, database, etc.) require Server Mode — you'll see a notification about this.

**Q: How do blog posts work in the Blog template?**
A: Blog posts are static HTML files in the `/blog/` directory. The home page lists them from `data.json`. Add new posts by creating HTML files and updating `data.json`, or ask the AI to do it.

---

**Next Steps:**

- **[Getting Started](?doc=getting-started)** - Create your first project
- **[Skills](?doc=skills)** - Teach AI your preferences
- **[Projects](?doc=projects)** - Manage your work

---

**Want to create templates?** Build a great project, then export it as a template for future use!
