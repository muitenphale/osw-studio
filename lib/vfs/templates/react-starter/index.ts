import { ProjectTemplate } from '../../project-templates';
import { REACT_DOMAIN_PROMPT } from '@/lib/llm/prompts/react';
import { CANVAS_CSS, CANVAS_HTML } from '../utils';

export const REACT_STARTER_PROJECT_TEMPLATE: ProjectTemplate = {
  name: 'React Starter',
  description: 'Minimal React app with TypeScript and auto-bundling',
  directories: ['/src', '/src/components'],
  files: [
    {
      path: '/index.html',
      content: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>React App</title>
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
      content: `import { createRoot } from "react-dom/client";
import App from "./App";

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
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
 * Import npm packages by name (resolved via CDN):
 *   import { motion } from "framer-motion";
 */

export default function App() {
  return <></>;
}
`
    },
    {
      path: '/.PROMPT.md',
      content: REACT_DOMAIN_PROMPT
    }
  ]
};
