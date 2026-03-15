import { ProjectTemplate } from '../../project-templates';
import { HANDLEBARS_DOMAIN_PROMPT } from '@/lib/llm/prompts/handlebars';

export const HANDLEBARS_STARTER_PROJECT_TEMPLATE: ProjectTemplate = {
  name: 'Starter (Handlebars)',
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
    {{> welcome-card}}

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
  padding: 2rem;
  background: #f9fafb;
  color: #0f172a;
}

h1 {
  font-size: 2.25rem;
  margin-bottom: 0.5rem;
}

p {
  font-size: 1rem;
  line-height: 1.6;
}

.welcome-card {
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
      path: '/templates/welcome-card.hbs',
      content: `<div class="welcome-card">
    <h1>{{title}}</h1>
    <p>{{message}}</p>
</div>`
    },
    {
      path: '/data.json',
      content: `{
  "title": "Welcome",
  "message": "Start building your website!"
}`
    },
    {
      path: '/.PROMPT.md',
      content: HANDLEBARS_DOMAIN_PROMPT
    }
  ]
};
