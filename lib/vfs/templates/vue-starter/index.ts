import { ProjectTemplate } from '../../project-templates';
import { VUE_DOMAIN_PROMPT } from '@/lib/llm/prompts/vue';

export const VUE_STARTER_PROJECT_TEMPLATE: ProjectTemplate = {
  name: 'Starter (Vue)',
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
</head>
<body>
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
      content: `<template>
  <main>
    <h1>Hello World</h1>
  </main>
</template>

<style scoped>
main {
  font-family: sans-serif;
  text-align: center;
  padding: 2rem;
}
</style>
`
    },
    {
      path: '/.PROMPT.md',
      content: VUE_DOMAIN_PROMPT
    }
  ]
};
