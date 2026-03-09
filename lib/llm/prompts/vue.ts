export const VUE_DOMAIN_PROMPT = `PROJECT TYPE: Vue (auto-bundled)

This project uses Vue 3. Single-file components (.vue) are compiled in the browser — no build tools or npm needed during development.

ARCHITECTURE:
- /index.html — HTML shell with <div id="root"> and <script type="module" src="/bundle.js">
- /src/main.ts — Entry point: createApp(App).mount("#root")
- /src/App.vue — Root component
- /src/components/ — Reusable components (one per file)

WRITING COMPONENTS:
- Create components in /src/components/Name.vue
- Use <script setup> with Composition API (preferred)
- Each .vue file contains <script setup>, <template>, and <style>

COMPOSITION API:
- ref() — reactive primitive:
  const count = ref(0); count.value++;
- reactive() — reactive object:
  const state = reactive({ name: 'World', items: [] });
- computed() — derived values:
  const doubled = computed(() => count.value * 2);
- watch() — side effects:
  watch(count, (newVal) => console.log(newVal));
- onMounted(), onUnmounted() — lifecycle hooks

COMPONENT FORMAT:
\`\`\`vue
<script setup>
import { ref, computed } from 'vue';

const count = ref(0);
const doubled = computed(() => count.value * 2);

function increment() {
  count.value++;
}
</script>

<template>
  <button @click="increment">
    Count: {{ count }} (doubled: {{ doubled }})
  </button>
</template>

<style scoped>
button {
  padding: 0.5rem 1rem;
  font-size: 1.2rem;
}
</style>
\`\`\`

TEMPLATE SYNTAX:
- Text interpolation: {{ expression }}
- Conditionals: v-if="condition", v-else-if, v-else
- Loops: v-for="item in items" :key="item.id"
- Events: @click="handler" or v-on:click="handler"
- Bindings: :value="variable" or v-bind:value="variable"
- Two-way: v-model="variable"
- Dynamic class: :class="{ active: isActive }"
- Show/hide: v-show="isVisible"

IMPORTING NPM PACKAGES:
- Import by package name — resolved via CDN automatically:
  import { ref, computed } from "vue";
  import confetti from "canvas-confetti";
  import { format } from "date-fns";
- Do NOT use require() or CommonJS
- Do NOT create node_modules or package.json

CSS STYLING:
- Use <style scoped> for component-scoped styles (recommended)
- Use <style> without scoped for global styles
- For Tailwind CSS, add to index.html <head>: <script src="https://cdn.tailwindcss.com"></script>

ROUTING (Single Page App):
- Use hash-based routing: window.location.hash
- Example: #/about, #/contact
- Create a simple router component with v-if directives

FILE STRUCTURE EXAMPLE:
/index.html
/src/main.ts
/src/App.vue
/src/components/Header.vue
/src/components/Footer.vue
/src/components/Button.vue
/src/composables/useLocalStorage.ts
/src/utils/helpers.ts

DO NOT:
- Create .hbs / .handlebars files (those are for the HTML/Handlebars pipeline)
- Create /templates/ or /data.json (Handlebars-specific)
- Use Options API (data(), methods, computed properties) — use Composition API
- Use require() or CommonJS modules
- Create build configs (vite.config.ts, vue.config.js, etc.)
- Try to install packages with npm/yarn
- Write JSX/TSX files — use .vue components instead

IMPORTANT:
- The preview rebuilds automatically when any file changes
- Component state is lost on rebuild (expected behavior)
- TypeScript in <script setup lang="ts"> is supported
- All imports resolve at runtime from esm.sh CDN — internet required
- <style scoped> styles are automatically scoped to the component`;
