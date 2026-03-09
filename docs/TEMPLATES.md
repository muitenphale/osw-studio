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
| **Static** | HTML, CSS, and JavaScript with optional Handlebars templating |
| **React** | Component-based React + TypeScript with automatic bundling |
| **Preact** | Lightweight React alternative (~3KB) with signals support |
| **Svelte** | Svelte 5 with compile-time reactivity and runes |
| **Vue** | Vue 3 with Composition API and SFC support |

Some templates also include **backend features** — edge functions, database schema, server functions, and secrets. These show a "Backend" badge and require Server Mode for full functionality. In Browser Mode, backend templates create the frontend files normally.

---

## Built-in Templates

### Website Starter (Project)

Minimal starting point with basic structure.

**Includes:**
- Single `index.html`
- Basic CSS file
- Empty JavaScript file
- Clean slate for building

**Best for**: Starting from scratch with minimal setup

### Example Studios (Project)

A multi-page agency portfolio showing OSW Studio's capabilities.

**Includes:**
- Multiple HTML pages with Handlebars partials
- `data.json` for site-wide data (site name, navigation, social links)
- Responsive design with modern CSS
- Interactive elements (portfolio gallery, contact form)

**Best for**: Learning how OSW Studio works, understanding Handlebars partials

### Starter (React + TypeScript)

Component-based React app with TypeScript and automatic bundling.

**Includes:**
- `index.html` shell with bundle references
- `src/main.tsx` entry point
- `src/App.tsx` Hello World component
- `.PROMPT.md` with React-specific AI instructions

**Best for**: Starting a React app from scratch with AI, component-driven UIs

### React Demo: Task Tracker (Project)

Interactive task tracker showcasing React components, state management, and typed props.

**Includes:**
- `index.html` shell with bundle references
- `src/main.tsx` entry point
- `src/App.tsx` with `useState` for task management
- `src/TaskForm.tsx` controlled input with form submit
- `src/TaskItem.tsx` checkbox toggle and delete
- `src/App.css` styles

**Best for**: Learning React in OSW Studio, exploring component composition and state

### Starter (Preact + TypeScript)

Lightweight React alternative with signals for reactive state.

**Includes:**
- `index.html` shell with bundle references
- `src/main.tsx` entry point
- `src/App.tsx` Hello World component
- `.PROMPT.md` with Preact-specific AI instructions

**Best for**: Small, fast apps where bundle size matters. Same API as React but ~3KB

### Starter (Svelte)

Svelte 5 app with compile-time reactivity and runes.

**Includes:**
- `index.html` shell with bundle references
- `src/main.ts` entry point
- `src/App.svelte` counter component using `$state()` rune
- `.PROMPT.md` with Svelte-specific AI instructions

**Best for**: Apps that benefit from compile-time optimization, scoped styles, and minimal boilerplate

### Starter (Vue)

Vue 3 app with Composition API and single-file components.

**Includes:**
- `index.html` shell with bundle references
- `src/main.ts` entry point
- `src/App.vue` counter component using `ref()` and `@click`
- `.PROMPT.md` with Vue-specific AI instructions

**Best for**: Progressive apps, gentle learning curve, familiar HTML-like template syntax

### Landing Page with Contact Form (Backend)

Professional landing page with a working contact form powered by Resend email.

**Includes:**
- Single-page design with contact form
- 2 edge functions (`submit-contact`, `list-messages`)
- Database schema for storing messages
- Optional Resend email integration (requires API key)

**Best for**: Business landing pages, lead capture, contact forms

### Blog with Comments (Backend)

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

2. **Export as template**
   - Open the project
   - Click **Menu** (⋮) → **Export**
   - Choose **Template**
   - Fill in template information:
     - Name
     - Description
     - Category
     - Tags
     - Preview image (optional)

3. **Use your template**
   - Find it in the Templates view
   - Create new projects from it
   - Share with others (export as file)

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

**💡 Keep templates simple**
Generic templates are more reusable than highly specific ones

**💡 Document your templates**
Add comments in the code explaining sections and how to customize

**💡 Update your templates**
Improve them over time as you learn better patterns

---

## Templates vs Skills

**Templates** = Starting point for a project
- Complete file structure (HTML/CSS/JS, React, Svelte, Vue, or Preact)
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
