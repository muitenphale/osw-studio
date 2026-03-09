import { ProjectTemplate } from '../../project-templates';
import { PREACT_DOMAIN_PROMPT } from '@/lib/llm/prompts/preact';

export const PREACT_STARTER_PROJECT_TEMPLATE: ProjectTemplate = {
  name: 'Starter (Preact + TypeScript)',
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
</head>
<body>
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
      content: PREACT_DOMAIN_PROMPT
    }
  ]
};
