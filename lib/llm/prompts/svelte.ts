export const SVELTE_DOMAIN_PROMPT = `PROJECT TYPE: Svelte (auto-bundled)

This project uses Svelte 5. Single-file components (.svelte) are compiled in the browser — no build tools or npm needed during development.

ARCHITECTURE:
- /index.html — HTML shell with <div id="root"> and <script type="module" src="/bundle.js">
- /src/main.ts — Entry point: mount(App, { target: document.getElementById("root")! })
- /src/App.svelte — Root component
- /src/components/ — Reusable components (one per file)

WRITING COMPONENTS:
- Create components in /src/components/Name.svelte
- Use Svelte 5 runes for reactivity
- Each .svelte file contains <script>, template HTML, and <style>

SVELTE 5 RUNES:
- $state() — reactive state declaration:
  let count = $state(0);
- $derived() — computed values:
  let doubled = $derived(count * 2);
- $effect() — side effects:
  $effect(() => { console.log(count); });
- $props() — component props:
  let { name, age = 25 } = $props();
- $bindable() — two-way binding props:
  let { value = $bindable() } = $props();

COMPONENT FORMAT:
\`\`\`svelte
<script>
  // TypeScript supported with lang="ts"
  let count = $state(0);
  let doubled = $derived(count * 2);

  function increment() {
    count++;
  }
</script>

<button onclick={increment}>
  Count: {count} (doubled: {doubled})
</button>

<style>
  button {
    padding: 0.5rem 1rem;
    font-size: 1.2rem;
  }
</style>
\`\`\`

TEMPLATE SYNTAX:
- Text interpolation: {expression}
- Conditionals: {#if condition}...{:else if}...{:else}...{/if}
- Loops: {#each items as item, index (item.id)}...{/each}
- Events: onclick={handler} (NOT on:click)
- Bindings: bind:value={variable}
- Two-way: bind:this={element}
- Class directive: class:active={isActive}

IMPORTING NPM PACKAGES:
- Import by package name — resolved via CDN automatically:
  import { writable } from "svelte/store";
  import confetti from "canvas-confetti";
  import { format } from "date-fns";
- Do NOT use require() or CommonJS
- Do NOT create node_modules or package.json

CSS STYLING:
- Styles in <style> blocks are scoped to the component by default
- For global styles, use :global() selector or a separate .css file
- For Tailwind CSS, add to index.html <head>: <script src="https://cdn.tailwindcss.com"></script>

ROUTING (Single Page App):
- Use hash-based routing: window.location.hash
- Example: #/about, #/contact
- Create a simple router component with {#if} blocks

FILE STRUCTURE EXAMPLE:
/index.html
/src/main.ts
/src/App.svelte
/src/components/Header.svelte
/src/components/Footer.svelte
/src/components/Button.svelte
/src/utils/helpers.ts

DO NOT:
- Create .hbs / .handlebars files (those are for the HTML/Handlebars pipeline)
- Create /templates/ or /data.json (Handlebars-specific)
- Use old Svelte syntax (export let, $: reactive, on:event) — use Svelte 5 runes
- Use require() or CommonJS modules
- Create build configs (vite.config.ts, svelte.config.js, etc.)
- Try to install packages with npm/yarn
- Write JSX/TSX files — use .svelte components instead

IMPORTANT:
- The preview rebuilds automatically when any file changes
- Component state is lost on rebuild (expected behavior)
- TypeScript in <script lang="ts"> is supported
- All imports resolve at runtime from esm.sh CDN — internet required
- Styles in <style> blocks are automatically scoped`;
