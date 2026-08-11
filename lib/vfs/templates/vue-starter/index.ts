import { ProjectTemplate } from '../../project-templates';
import { VUE_DOMAIN_PROMPT } from '@/lib/llm/prompts/vue';
import { CANVAS_CSS, CANVAS_HTML } from '../utils';

export const VUE_STARTER_PROJECT_TEMPLATE: ProjectTemplate = {
  name: 'Vue Starter',
  description: 'Vue 3 app with Composition API and auto-bundling',
  directories: ['/src', '/src/components'],
  files: [
    {
      path: '/index.html',
      content: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Vue App</title>
    <link rel="stylesheet" href="/bundle.css">
    <style>body{margin:0;background:#121212;min-height:100vh} ${CANVAS_CSS} #root{position:relative;z-index:1}</style>
</head>
<body>
    ${CANVAS_HTML}
    <div id="root"></div>
    <script type="module" src="/bundle.js"></script>
</body>
</html>`
    },
    {
      path: '/src/main.ts',
      content: `import { createApp } from "vue";
import App from "./App.vue";

createApp(App).mount("#root");
`
    },
    {
      path: '/src/App.vue',
      content: `<!--
  Root component. Build your UI here.

  Add components in /src/components/Name.vue:
    import Header from "./components/Header.vue";

  Composition API:
    const count = ref(0);
    const doubled = computed(() => count.value * 2);
-->

<script setup>
</script>

<template>
</template>

<style scoped>
</style>
`
    },
    {
      path: '/.PROMPT.md',
      content: VUE_DOMAIN_PROMPT
    }
  ]
};
