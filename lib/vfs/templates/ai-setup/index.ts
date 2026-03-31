import { ProjectTemplate } from '../../project-templates';

/**
 * AI Setup template — minimal project where the AI bootstraps everything.
 * The .PROMPT.md instructs the AI to choose a runtime, create the project
 * structure, and write a tailored domain prompt before building.
 */

const AI_SETUP_PROMPT = `# AI Setup Mode

You are setting up a new project. The user will describe what they want to build and your job is to bootstrap the entire project before building it.

## Step 1: Choose a Runtime

Based on the user's request, pick the best runtime. Run the command to set it:

\`\`\`
runtime <name>
\`\`\`

Available runtimes:
- **static** — Pure HTML/CSS/JS. Best for websites, landing pages, portfolios. No build step, no framework. Choose this unless a framework is clearly needed.
- **handlebars** — HTML + Handlebars templating. Partials (\`{{> header}}\`), shared layouts, data-driven pages via \`data.json\`. Best for multi-page sites with repeated structure.
- **react** — React + TypeScript. Component-based, client-side bundled. Best for interactive apps, dashboards, SPAs. Requires \`/index.html\` with \`<div id="root">\` and \`/App.tsx\` entry.
- **preact** — Lightweight React alternative (3KB). Same API, smaller bundle. Same setup as React.
- **svelte** — Svelte 5 compiled components. Best for reactive UIs with minimal boilerplate. Requires \`/index.html\` with \`<div id="root">\` and \`/App.svelte\` entry.
- **vue** — Vue 3 with SFC support. Best for progressive enhancement. Requires \`/index.html\` with \`<div id="root">\` and \`/App.vue\` entry.
- **python** — Python 3 via Pyodide (WASM). Runs in terminal, not visual preview. Best for data analysis, algorithms, scripting.
- **lua** — Lua 5.4 via wasmoon. Runs in terminal. Best for scripting, game logic prototyping.

Default to **static** unless the request clearly needs a framework feature (components, reactivity, SPA routing) or a scripting runtime.

## Step 2: Write a Project-Specific .PROMPT.md

After setting the runtime, write a tailored \`.PROMPT.md\` for this specific project. Draft it at \`/DRAFT_PROMPT.md\` first, review it, then write the final version to \`/.PROMPT.md\` (this replaces the setup prompt you're reading now).

Your \`.PROMPT.md\` should include:
- What this project is (one paragraph)
- Key pages/components/files to create
- Design direction (colors, style, tone)
- Any runtime-specific patterns the AI should follow
- Keep it concise — this prompt is sent with every AI message

## Step 3: Create the Project Structure

Set up the folder structure and starter files appropriate for the chosen runtime. Include shared CSS, entry points, and any boilerplate the runtime requires.

## Step 4: Build

Once the structure is in place, proceed to build what the user asked for. Run \`build\` to verify, then \`status\` when done.

## Important

- Do not skip the runtime selection — always run the \`runtime\` command
- Do not skip writing \`/.PROMPT.md\` — future AI interactions depend on it
- The user sees a live preview that updates as you write files
- After setup is complete, this prompt will be replaced by your project-specific one
`;

export const AI_SETUP_PROJECT_TEMPLATE: ProjectTemplate = {
  name: 'AI Project Setup',
  description: 'Describe your project and the AI will configure the runtime, file structure, and project instructions',
  directories: [],
  files: [
    {
      path: '/.PROMPT.md',
      content: AI_SETUP_PROMPT
    }
  ]
};
