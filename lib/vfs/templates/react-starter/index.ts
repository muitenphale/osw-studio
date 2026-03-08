import { ProjectTemplate } from '../../project-templates';
import { REACT_DOMAIN_PROMPT } from '@/lib/llm/prompts/react';

export const REACT_STARTER_PROJECT_TEMPLATE: ProjectTemplate = {
  name: 'React + TypeScript',
  description: 'Component-based React app with TypeScript and auto-bundling',
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
</head>
<body>
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
      content: `export default function App() {
  return (
    <div>
      <h1>Hello World</h1>
    </div>
  );
}
`
    },
    {
      path: '/.PROMPT.md',
      content: REACT_DOMAIN_PROMPT
    }
  ]
};
