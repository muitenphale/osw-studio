# Managing Projects

**Everything you need to know about creating, organizing, and exporting projects.**

---

## Creating Projects

1. Click **Projects** in the sidebar
2. Click **+ New Project**
3. Enter a project name
4. Choose a template:
   - **Website Starter** - Minimal starting point with basic HTML/CSS/JS structure
   - **Example Studios** - Pre-built multi-page portfolio example
   - **Starter (React + TypeScript)** - Minimal React app with auto-bundling
   - **React Demo: Task Tracker** - Interactive task tracker showcasing React components and state
   - **Starter (Preact + TypeScript)** - Lightweight React alternative with signals
   - **Starter (Svelte)** - Svelte 5 app with compile-time reactivity
   - **Starter (Vue)** - Vue 3 app with Composition API
   - **Landing Page with Contact Form** - Contact form with Resend email (Backend)
   - **Blog with Comments** - Blog with auth and moderated comments (Backend)
   - Or select any custom template you've created
5. Optionally add a description
6. Click **Create Project**

All projects start from a template. The built-in templates provide a foundation to build upon.

**[Learn more about templates →](?doc=templates)**

---

## Opening Projects

### From Projects View

1. Click **Projects** in the sidebar
2. Find your project in the grid
3. Click on the project card

### Recent Projects

Your 3 most recent projects appear in the sidebar for quick access.

---

## Project Workspace

When you open a project, you'll see 4 panels:

### Workspace Header

The header contains key controls:
- **Project name** - Click to rename
- **Mode toggle** - Switch between Chat (read-only) and Code (full access) modes
- **Deployment selector** (Server Mode only) - Choose which published deployment's backend context to load

#### Deployment Selector (Server Mode)

In Server Mode, a dropdown appears in the workspace header that lets you select a deployment. When selected:
- The AI gains awareness of that deployment's backend features
- A `/.server/` hidden folder appears with server context files
- You can ask the AI about edge functions, database schema, etc.

See **[Server Mode → Server Context Integration](?doc=server-mode#server-context-integration)** for details.

### Chat (Left-most)

Talk to AI to build and modify your project. The chat panel has two modes:

**Chat Mode** (read-only):
- AI uses read-only shell commands
- Explore and discuss without making changes
- See how the AI understands your project
- Perfect for planning before building

**Code Mode** (full access):
- AI can create, edit, and delete files
- Make actual changes to your project
- Build features and fix bugs

**Pro tip**: If unsure, start with Chat mode to see how the AI views your project. You can also one-shot prompt full multi-page websites, though smaller, focused tasks are generally more consistent.

### File Explorer (2nd)

Browse your project structure:
- Click folders to expand/collapse
- Click files to open in editor
- Right-click for options (rename, delete, etc.)
- Right-click and select **Show Hidden Files** to view hidden folders

#### Hidden Folders

OSW Studio uses hidden folders (starting with `.`) to provide AI context:

| Folder | Icon | Purpose |
|--------|------|---------|
| `/.skills/` | Purple book | Skill documents that teach the AI your preferences |
| `/.server/` | Orange server | Server context (Server Mode only) - database schema, edge functions, etc. |

These folders are **read-only** and **transient** - their contents are generated dynamically to provide context to the AI and are not saved with your project

### Code Editor (3rd)

View and edit code:
- Multiple tabs for different files
- Syntax highlighting
- Save with `Cmd/Ctrl+S`
- Supports HTML, CSS, JavaScript, TypeScript, TSX, JSON, Markdown

### Live Preview (Last)

See your website in real-time:
- Updates automatically when files change
- Click links to navigate
- Test responsive design with resize
- Open in new tab for full testing
- Use the **focus tool** to select specific elements or sections and add them to message context for targeted AI edits

You can open and close panels from their headers and the sidebar on the workspace.

---

## Saving Your Work

### Manual Save

Press `Ctrl+S` (Windows/Linux) or `Cmd+S` (Mac) to save your project.

**Important**: Projects require manual save to persist. While checkpoints are created automatically during AI operations, you must manually save to create a permanent restore point.

### Checkpoints

OSW Studio creates checkpoints automatically after AI makes changes:

- **Starting point** is created when you open a project (if no prior save exists)
- **Auto-checkpoints** are created during AI operations (last 10 kept per project)
- **Manual saves** (Cmd/Ctrl+S) persist across refreshes and are never evicted
- **"Discard Changes"** reverts to the state when you opened the project — your last manual save if one exists, or the Starting Point otherwise

**How to restore:**
1. Open the **Checkpoints Panel** in the workspace
2. Browse starting point, auto-checkpoints, and manual saves
3. Click any checkpoint to restore your project to that state

---

## Exporting Projects

### Export as ZIP

Download your complete website ready to deploy:

1. Click the **Menu** icon (⋮) in the top right
2. Select **Export**
3. Choose **ZIP** (suitable for hosting)
4. Save the ZIP file

The ZIP contains:
- All HTML, CSS, JavaScript files
- Images and assets
- Clean structure ready for hosting

**Deploy it to:**
- Vercel, Netlify, GitHub Pages
- Any static file host
- Your own server

**[Deployment guide →](?doc=deploying-sites)**

### Export as JSON (Backup)

Save your entire project including chat history and checkpoints:

1. Click the **Menu** icon (⋮)
2. Select **Export**
3. Choose **JSON** (backup format)
4. Save the file

Use this to:
- Back up your work
- Transfer projects between computers
- Share projects with others
- Keep complete history

### Import JSON Files

Restore a backed-up project:

1. Click **Projects** in sidebar
2. Click **Import Project**
3. Select your `.json` backup file
4. Project loads with full history

---

## Organizing Projects

### Naming

Give projects clear names:
- ✅ "Portfolio Website"
- ✅ "Client Landing Page - Acme Corp"
- ✅ "Blog v2"
- ❌ "Untitled 1"
- ❌ "New Project"

### Deleting Projects

1. Go to **Projects** view
2. Find the project
3. Click the **Delete** button (trash icon)
4. Confirm deletion

**⚠️ Warning**: Deletion is permanent. Export a backup first if you might need it later.

---

## Tips for Project Management

**💡 Name Projects Clearly**
You'll thank yourself later when you have many projects

**💡 Export Backups Regularly**
Especially before major changes or experiments

**💡 Use Templates**
Don't rebuild the same structure every time

**💡 One Feature at a Time**
Make changes incrementally and test as you go

**💡 Test in Preview**
Always check the live preview before exporting

**💡 Keep Chat History Clean**
Start new conversations when switching to different features

---

## Common Tasks

### Rename a Project

Projects are renamed through the Projects view menu (feature may vary).

### Duplicate a Project

1. Export project as JSON
2. Import it back with a new name
3. Continue working on the copy

### Start Over

1. Delete old project
2. Create new project with same name
3. Or keep old as reference and create new

### Share a Project

1. Export as JSON
2. Share file with others
3. They import it in their OSW Studio

---

**Next Steps:**

- **[Working with AI](?doc=working-with-ai)** - Get better results from AI
- **[Templates](?doc=templates)** - Start projects faster
- **[Deploying Sites](?doc=deploying-sites)** - Put your site online
