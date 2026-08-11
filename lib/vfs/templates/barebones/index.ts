import { ProjectTemplate } from '../../project-templates';
import { STATIC_DOMAIN_PROMPT } from '@/lib/llm/prompts/static';
import { CANVAS_CSS, CANVAS_HTML } from '../utils';

export const BAREBONES_PROJECT_TEMPLATE: ProjectTemplate = {
  name: 'Static Starter',
  description: 'Minimal starting template with basic HTML/CSS/JS structure',
  directories: ['/styles', '/scripts'],
  files: [
    {
      path: '/index.html',
      content: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>New Project</title>
    <link rel="stylesheet" href="/styles/style.css">
</head>
<body>
    ${CANVAS_HTML}

    <!-- Replace the content below with your own -->
    <header></header>
    <main></main>
    <footer></footer>

    <script src="/scripts/main.js"></script>
</body>
</html>`
    },
    {
      path: '/styles/style.css',
      content: `/*
 * Your project styles start here.
 * Use this file to customize typography, layout, and colors.
 */

body {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  margin: 0;
  background: #121212;
  color: #eaeaea;
  min-height: 100vh;
}

${CANVAS_CSS}

header, main, footer {
  position: relative;
  z-index: 1;
}
`
    },
    {
      path: '/scripts/main.js',
      content: `document.addEventListener('DOMContentLoaded', () => {
  // Add interactivity here
});
`
    },
    {
      path: '/.PROMPT.md',
      content: STATIC_DOMAIN_PROMPT
    }
  ]
};
