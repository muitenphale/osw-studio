import { ProjectTemplate } from '../../project-templates';
import { PREACT_DOMAIN_PROMPT } from '@/lib/llm/prompts/preact';
import { CANVAS_CSS, CANVAS_HTML } from '../utils';

export const PREACT_STARTER_PROJECT_TEMPLATE: ProjectTemplate = {
  name: 'Preact Starter',
  description: 'Lightweight Preact app with TypeScript and auto-bundling',
  directories: ['/src', '/src/components'],
  files: [
    {
      path: '/index.html',
      content: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Preact App</title>
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
      path: '/src/main.tsx',
      content: `import { render } from "preact";
import App from "./App";

render(<App />, document.getElementById("root")!);
`
    },
    {
      path: '/src/App.tsx',
      content: `/*
 * Root component. Build your UI here.
 *
 * Add components in /src/components/Name.tsx and import them:
 *   import Header from "./components/Header";
 *
 * Import CSS directly:
 *   import "./styles.css";
 *
 * Preact-specific APIs:
 *   import { useState, useEffect } from "preact/hooks";
 *   import { signal } from "@preact/signals";
 */

export default function App() {
  return <></>;
}
`
    },
    {
      path: '/.PROMPT.md',
      content: PREACT_DOMAIN_PROMPT
    }
  ]
};
