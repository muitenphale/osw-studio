import { ProjectTemplate } from '../../project-templates';
import { HANDLEBARS_DOMAIN_PROMPT } from '@/lib/llm/prompts/handlebars';
import { CANVAS_CSS, CANVAS_HTML } from '../utils';

export const HANDLEBARS_STARTER_PROJECT_TEMPLATE: ProjectTemplate = {
  name: 'Handlebars Starter',
  description: 'Minimal starting template with Handlebars partials and data',
  directories: ['/styles', '/scripts', '/templates'],
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

    <!-- Use {{> partial-name}} to include Handlebars partials from /templates/ -->
    <!-- Data from /data.json is available as template variables -->
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
  color: #e4e4e7;
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
      path: '/templates/example.hbs',
      content: `{{!-- Example partial. Include it in HTML with {{> example}} --}}
{{!-- Variables come from /data.json --}}
<div>
    <h1>{{siteName}}</h1>
</div>`
    },
    {
      path: '/data.json',
      content: `{
  "siteName": "My Site"
}`
    },
    {
      path: '/.PROMPT.md',
      content: HANDLEBARS_DOMAIN_PROMPT
    }
  ]
};
