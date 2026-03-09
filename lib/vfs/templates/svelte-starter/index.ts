import { ProjectTemplate } from '../../project-templates';
import { SVELTE_DOMAIN_PROMPT } from '@/lib/llm/prompts/svelte';

export const SVELTE_STARTER_PROJECT_TEMPLATE: ProjectTemplate = {
  name: 'Starter (Svelte)',
  description: 'Svelte 5 app with runes and auto-bundling',
  directories: ['/src', '/src/components'],
  files: [
    {
      path: '/index.html',
      content: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Svelte App</title>
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
      content: `import { mount } from "svelte";
import App from "./App.svelte";

mount(App, { target: document.getElementById("root")! });
`
    },
    {
      path: '/src/App.svelte',
      content: `<main>
  <h1>Hello World</h1>
</main>

<style>
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
      content: SVELTE_DOMAIN_PROMPT
    }
  ]
};
