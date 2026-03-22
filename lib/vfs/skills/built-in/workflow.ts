/**
 * Workflow - Built-in Skill
 * Project planning and execution workflow for any runtime
 */

export const WORKFLOW_SKILL = String.raw`---
name: workflow
description: Read when starting new projects. Covers the full workflow — reading .PROMPT.md, planning with PLAN.md, execution order, file writing efficiency, and quality checks.
---

# Project Workflow

How to plan and build complete projects efficiently. This covers the full lifecycle from reading the brief to final polish. Runtime-specific guidance (file structure, imports, component patterns) lives in .PROMPT.md — read it before anything else.

## Step 1: Read the Brief

Before writing any code:
${"```"}bash
cat /.PROMPT.md
${"```"}
This tells you the runtime's file structure, component patterns, and import rules. Your entire plan must follow these constraints.

## Step 2: Explore the Project

Understand what exists before creating anything:
${"```"}bash
tree -L 2 /
${"```"}
Check for existing files, templates, and structure. Don't recreate files that already exist.

## Step 3: Create PLAN.md

**Always create ${"```"}/PLAN.md${"```"} before writing code.** This is the project roadmap:

${"```"}markdown
# Project Plan

## Overview
[Brief description of the project and its purpose]

## Pages / Views
- [List all pages/routes with brief descriptions]
- [Include the entry point and navigation flow]

## Tech Choices
- CSS: [Tailwind / Bootstrap / Vanilla / CSS-in-JS — pick ONE]
- Icons: [FontAwesome / Lucide / Heroicons / SVG inline]
- Fonts: [Google Fonts / System stack]
- Images: [Picsum / Unsplash / User-provided]

## Component / Module Plan
- [List reusable components: nav, footer, cards, etc.]
- [Note shared layouts or wrappers]

## Color Palette
- Primary: #___
- Secondary: #___
- Accent: #___
- Neutral: #___ / #___

## Execution Order
1. Set up project scaffolding and shared components
2. Build main page / entry point (visible progress!)
3. Build remaining pages / views
4. Add interactivity and polish
5. Test in preview, fix issues
${"```"}

Adapt the plan to the runtime. A React project has ${"```"}/src/App.tsx${"```"} and components; a Handlebars project has ${"```"}/templates/${"```"} and ${"```"}.html${"```"} pages; a static project has plain ${"```"}.html${"```"} files. Let .PROMPT.md guide the specifics.

## Runtime Orientation

Your project uses a specific runtime. The approach differs:

| Runtime | Entry point | Components | Styling |
|---------|------------|------------|---------|
| Static | /index.html | Separate .html files | CDN or /styles.css |
| Handlebars | /index.html | /templates/**/*.hbs | CDN or /styles.css |
| React | /src/App.tsx | /src/components/*.tsx | CSS imports or Tailwind |
| Preact | /src/App.tsx | /src/components/*.tsx | CSS imports or Tailwind |
| Svelte | /src/App.svelte | /src/components/*.svelte | Component <style> blocks |
| Vue | /src/App.vue | /src/components/*.vue | Component <style> blocks |
| Python | /main.py | Additional .py files | N/A (terminal) |
| Lua | /main.lua | Additional .lua files | N/A (terminal) |

.PROMPT.md has the full details. The table above is just orientation.

## Tech Stack Tips

### CSS Frameworks — Pick ONE
- **Tailwind CSS**: Utility-first. Static/Handlebars: CDN script tag. React/Svelte/Vue: import via npm.
- **Bootstrap**: Component-rich. CDN for static, npm for framework projects.
- **Vanilla CSS**: Full control, no dependencies. Works everywhere.
- Don't mix frameworks. Stick with one approach.

### Icons
- **FontAwesome**: CDN link for static, npm ${"```"}@fortawesome/${"```"} for frameworks.
- **Lucide**: CDN or ${"```"}lucide-react${"```"} / ${"```"}lucide-svelte${"```"} / ${"```"}lucide-vue-next${"```"} depending on runtime.
- **Inline SVG**: No dependency, works everywhere.

### Placeholder Images
${"```"}
https://picsum.photos/800/600              — random
https://picsum.photos/800/600?random=1     — seeded random
https://picsum.photos/800/600?grayscale    — grayscale
${"```"}

### Fonts
- **Google Fonts**: link tag for static runtimes, ${"```"}@import${"```"} in CSS for framework projects.
- **System stack**: ${"```"}font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;${"```"}

### Color Palettes

Choose accessible color schemes (WCAG AA: 4.5:1 contrast for text):

${"```"}
Professional Blue:  #2563EB / #3B82F6 / accent #F59E0B
Modern Purple:      #7C3AED / #8B5CF6 / accent #10B981
Clean Teal:         #0D9488 / #14B8A6 / accent #F97316
Warm Orange:        #EA580C / #F97316 / accent #0EA5E9
${"```"}

## Visible Progress First

The user sees a live preview that updates as you write files — **you cannot see it**. You are blind to the rendered output. ${"```"}curl localhost/${"```"} returns raw HTML, which tells you nothing about whether a visual project (game, animation, styled layout) renders correctly.

Prioritize output the user can see:

1. **Project scaffolding** — entry point, shared components/layouts
2. **Main page/view** — the first thing users see (homepage, dashboard, main screen)
3. **Remaining pages/views** — secondary content
4. **Polish** — animations, transitions, edge cases

## Phased Execution

### Phase 1: Scaffolding
- Create the directory structure required by the runtime
- Build shared/reusable components (nav, footer, layout wrappers)
- Set up styling (CSS framework choice, global styles, theme)

### Phase 2: Main Page
- Build the entry point / main page completely before moving on
- Include all major sections (hero, features, content, CTA — whatever applies)
- Run ${"```"}build${"```"} to verify compilation — the user sees the result immediately in their preview

### Phase 3: Remaining Pages
- Build each additional page/view in order of importance
- Reuse components and patterns from the main page
- Maintain consistent styling and layout

### Phase 4: Polish
- Responsive behavior — see the ${"```"}responsive${"```"} skill for detailed guidance
- Hover states and transitions
- Accessibility (alt text, aria-labels, focus states)
- Error handling for forms and interactions

## File Structure and Modularity

Split code into small, focused files. A 500-line monolith is hard to edit and easy to break — five 100-line files are each simple to read, write, and update independently.

### One concern per file
- **Components**: one component per file — ${"```"}Nav.tsx${"```"}, ${"```"}Footer.tsx${"```"}, ${"```"}HeroSection.tsx${"```"}, not everything in ${"```"}App.tsx${"```"}
- **Styles**: separate CSS files per page or component, or one shared ${"```"}styles.css${"```"} — not inline styles scattered everywhere
- **Logic**: utility functions, data, and constants in their own files — ${"```"}utils.ts${"```"}, ${"```"}data.ts${"```"}, ${"```"}constants.ts${"```"}
- **Pages**: each page is its own file — ${"```"}about.html${"```"}, ${"```"}contact.html${"```"}, ${"```"}AboutPage.tsx${"```"}

### Why this matters
- Smaller files are **faster to write** — you finish and move on instead of managing a growing blob
- Easier to **edit later** — ${"```"}sed${"```"} on a 100-line file is precise; on a 500-line file it's fragile
- Easier to **debug** — errors point to a specific file, not line 347 of a monolith
- Changes to one component don't risk breaking unrelated code

### Static / Handlebars projects
${"```"}
/index.html              — main page (imports styles.css, app.js)
/about.html              — about page
/styles.css              — shared styles
/js/app.js               — shared interactivity
/js/nav.js               — navigation logic (hamburger, dropdowns)
${"```"}

### Framework projects (React, Preact, Svelte, Vue)
${"```"}
/src/App.tsx              — router / layout shell only
/src/components/Nav.tsx   — navigation component
/src/components/Footer.tsx
/src/components/Hero.tsx
/src/pages/Home.tsx       — home page content
/src/pages/About.tsx      — about page content
/src/styles/global.css    — shared styles
${"```"}

### Python / Lua projects
${"```"}
/main.py                 — entry point, imports modules
/game.py                 — game logic
/rendering.py            — display / output
/utils.py                — helpers
${"```"}

## File Writing Tips

### Write complete files
Don't write partial files and come back later. Write each file fully the first time.

### Use heredocs for large files
${"```"}bash
cat > /path/to/file << 'EOF'
[complete file contents]
EOF
${"```"}

### Verify after writing — use build
${"```"}bash
build    # Check for compilation errors
${"```"}
After writing a batch of files, run ${"```"}build${"```"} to verify they compile. Fix any errors it reports, then run the ${"```"}status${"```"} command when done. Don't run extended diagnostic loops (curl, grep, rg, wc) to verify visual output — you can't see the preview.

### Inspect before editing
${"```"}bash
rg -C 5 'pattern' /file    # Find the section to edit
sed -i 's/old/new/' /file   # Make targeted edits
${"```"}

## Quality Checklist

Before finishing, run ${"```"}build${"```"} to confirm 0 errors, then ensure in your code:

- [ ] All pages/views have working navigation links
- [ ] Shared components (nav, footer) are included on every page
- [ ] Images have alt text
- [ ] Forms have proper labels and basic validation
- [ ] Hover/focus states on interactive elements
- [ ] Consistent color palette and typography throughout

## Common Mistakes

- **Giant monolithic files** — split into small, focused files; a 500-line component is a sign to extract pieces
- **Building pages in random order** — build main page first, then secondary
- **Inconsistent styling** — pick one CSS approach and use it everywhere
- **Leaving placeholder content** — replace all "Lorem ipsum" before finishing
- **Over-verifying** — you can't see the preview; don't run grep/curl/rg/wc to confirm visual output. Run ${"```"}build${"```"}, fix errors, run ${"```"}status${"```"}, done.
- **Ignoring .PROMPT.md** — runtime rules are there for a reason (wrong file structure = broken preview)

## Performance Tips

- Lazy load images below the fold: ${"```"}loading="lazy"${"```"}
- Preconnect to font CDNs for faster loading
- Minimize custom JavaScript — prefer CSS transitions
- Use appropriately sized placeholder images (don't load 4000px images for thumbnails)
- Keep DOM depth reasonable — deep nesting hurts render performance
`;
