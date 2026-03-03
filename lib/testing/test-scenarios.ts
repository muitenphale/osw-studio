import { TestScenario, TestTrack } from './types';

const basicHTMLTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Test App</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
        }
        nav {
            background: #333;
            color: white;
            padding: 1rem;
        }
        nav ul {
            list-style: none;
            display: flex;
            gap: 2rem;
        }
        nav a {
            color: white;
            text-decoration: none;
        }
        main {
            padding: 2rem;
        }
    </style>
</head>
<body>
    <nav class="main-nav">
        <ul class="nav-list">
            <li><a href="#home">Home</a></li>
            <li><a href="#about">About</a></li>
            <li><a href="#services">Services</a></li>
            <li><a href="#contact">Contact</a></li>
        </ul>
    </nav>
    <main class="content">
        <h1 class="page-title">Welcome to Test App</h1>
        <p>This is a test application for validating code generation.</p>
    </main>
    <script>
    </script>
</body>
</html>`;

const basicCSSFile = `/* Additional styles */
.container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 20px;
}

.btn {
    display: inline-block;
    padding: 10px 20px;
    background: #007bff;
    color: white;
    text-decoration: none;
    border-radius: 5px;
    border: none;
    cursor: pointer;
}

.btn:hover {
    background: #0056b3;
}`;

const basicJSFile = `
document.addEventListener('DOMContentLoaded', function() {

    const navLinks = document.querySelectorAll('nav a');
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
        });
    });
});`;

const defaultPromptMd = `You are building a website. Use HTML, CSS, and JavaScript.`;

// Setup with Handlebars templates for curl/preview testing
const handlebarsSetup: Record<string, string> = {
  '/.PROMPT.md': defaultPromptMd,
  '/index.html': `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>{{site_title}}</title></head>
<body>
{{> header}}
<main><h1>{{page_heading}}</h1><p>Welcome to our site.</p></main>
</body>
</html>`,
  '/about.html': `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>About - {{site_title}}</title></head>
<body>
{{> header}}
<main><h1>About Us</h1><p>We build great things.</p></main>
</body>
</html>`,
  '/templates/header.hbs': `<header><nav class="main-nav">Site Navigation</nav></header>`,
  '/data.json': `{"site_title": "Curl Test Site", "page_heading": "Welcome Home"}`,
  '/styles.css': `body { font-family: sans-serif; }`,
};

// Standard setup: HTML + CSS + JS + .PROMPT.md
const standardSetup: Record<string, string> = {
  '/.PROMPT.md': defaultPromptMd,
  '/index.html': basicHTMLTemplate,
  '/styles.css': basicCSSFile,
  '/script.js': basicJSFile,
};

export const testScenarios: TestScenario[] = [
  // ─── Shell — Reading (3 tests) ──────────────────────────────────────
  {
    id: 'shell-cat',
    name: 'Read file and extract value',
    category: 'shell-read',
    prompt: 'Read index.html and tell me the page title.',
    setupFiles: standardSetup,
    assertions: [
      { type: 'tool_used', toolName: 'shell', description: 'Used shell tool' },
      { type: 'output_matches', pattern: 'Test App', description: 'Output contains page title' },
    ],
  },
  {
    id: 'shell-head-tail',
    name: 'Read partial file with head',
    category: 'shell-read',
    prompt: 'Show me only the first 10 lines of index.html using head. What is the charset?',
    setupFiles: standardSetup,
    assertions: [
      { type: 'tool_args_match', toolName: 'shell', pattern: 'head', description: 'Used head command' },
      { type: 'output_matches', pattern: 'UTF-8', description: 'Found charset from first 10 lines' },
    ],
  },
  {
    id: 'shell-ls-tree',
    name: 'List files with ls/tree',
    category: 'shell-read',
    prompt: 'List all files in the project using tree, then tell me how many files there are.',
    setupFiles: standardSetup,
    assertions: [
      { type: 'tool_args_match', toolName: 'shell', pattern: 'tree|ls', description: 'Used tree or ls' },
      { type: 'output_matches', pattern: '4|four', description: 'Counted files correctly' },
    ],
  },

  // ─── Shell — Writing (3 tests) ──────────────────────────────────────
  {
    id: 'shell-mkdir-touch',
    name: 'Create directories and files',
    category: 'shell-write',
    prompt: "Create a directory called 'components' with three empty files: header.html, footer.html, sidebar.html.",
    setupFiles: standardSetup,
    assertions: [
      { type: 'file_exists', path: '/components/header.html', description: 'header.html created' },
      { type: 'file_exists', path: '/components/footer.html', description: 'footer.html created' },
      { type: 'file_exists', path: '/components/sidebar.html', description: 'sidebar.html created' },
    ],
  },
  {
    id: 'shell-cp-mv',
    name: 'Copy and rename files',
    category: 'shell-write',
    prompt: 'Copy styles.css to styles-backup.css, then rename script.js to app.js.',
    setupFiles: standardSetup,
    assertions: [
      { type: 'file_exists', path: '/styles-backup.css', description: 'styles-backup.css created' },
      { type: 'file_exists', path: '/app.js', description: 'app.js exists (renamed)' },
      { type: 'file_not_exists', path: '/script.js', description: 'script.js removed after rename' },
    ],
  },
  {
    id: 'shell-echo-redirect',
    name: 'Create file with echo redirect',
    category: 'shell-write',
    prompt: "Create a new file /data.json with a JSON object containing name 'Test' and version 1 using echo and redirect.",
    setupFiles: standardSetup,
    assertions: [
      { type: 'file_exists', path: '/data.json', description: 'data.json created' },
      { type: 'valid_json', path: '/data.json', description: 'data.json is valid JSON' },
      { type: 'file_matches', path: '/data.json', pattern: '[Tt]est', description: 'Contains "Test" name' },
    ],
  },

  // ─── Shell — Search (3 tests) ───────────────────────────────────────
  {
    id: 'shell-grep',
    name: 'Search with grep',
    category: 'shell-search',
    prompt: "Use grep to find all lines in index.html that contain 'class' and show line numbers.",
    setupFiles: standardSetup,
    assertions: [
      { type: 'tool_args_match', toolName: 'shell', pattern: 'grep.*-n.*class|grep.*class.*-n', description: 'Used grep with -n flag' },
      { type: 'tool_output_matches', toolName: 'shell', pattern: 'class', description: 'Tool output contains class matches' },
    ],
  },
  {
    id: 'shell-rg',
    name: 'Search across files with rg',
    category: 'shell-search',
    prompt: "Search across all files for the word 'function' using rg.",
    setupFiles: standardSetup,
    assertions: [
      { type: 'tool_args_match', toolName: 'shell', pattern: 'rg.*function', description: 'Used rg to search for function' },
      { type: 'tool_output_matches', toolName: 'shell', pattern: 'function', description: 'Tool output contains function matches' },
    ],
  },
  {
    id: 'shell-find',
    name: 'Find files by extension',
    category: 'shell-search',
    prompt: 'Find all .css files in the project.',
    setupFiles: standardSetup,
    assertions: [
      { type: 'tool_args_match', toolName: 'shell', pattern: 'find.*\\.css', description: 'Used find for .css files' },
      { type: 'tool_output_matches', toolName: 'shell', pattern: 'styles\\.css', description: 'Tool output contains styles.css' },
    ],
  },

  // ─── Shell — Text Processing (4 tests) ──────────────────────────────
  {
    id: 'shell-sed-inline',
    name: 'In-place substitution with sed',
    category: 'shell-text',
    prompt: "Use sed to change all occurrences of '#007bff' to '#e74c3c' in styles.css.",
    setupFiles: standardSetup,
    assertions: [
      { type: 'file_not_contains', path: '/styles.css', value: '#007bff', description: 'Old color removed' },
      { type: 'file_contains', path: '/styles.css', value: '#e74c3c', description: 'New color applied' },
    ],
  },
  {
    id: 'shell-sed-pipe',
    name: 'Pipe cat through sed to new file',
    category: 'shell-text',
    prompt: "Read index.html with cat, pipe through sed to replace 'Test App' with 'My App', redirect to /output.html.",
    setupFiles: standardSetup,
    assertions: [
      { type: 'file_exists', path: '/output.html', description: 'output.html created' },
      { type: 'file_contains', path: '/output.html', value: 'My App', description: 'Contains replaced text' },
    ],
  },
  {
    id: 'shell-pipe-chain',
    name: 'Multi-stage pipe chain',
    category: 'shell-text',
    prompt: "Cat index.html, pipe through grep to find lines with 'nav', pipe through head for first 3 matches.",
    setupFiles: standardSetup,
    assertions: [
      { type: 'tool_args_match', toolName: 'shell', pattern: 'cat.*\\|.*grep.*\\|.*head|cat.*nav.*pipe', description: 'Used pipe chain' },
      { type: 'tool_output_matches', toolName: 'shell', pattern: 'nav', description: 'Tool output contains nav matches' },
    ],
  },
  {
    id: 'shell-chained-cmds',
    name: 'Chained commands with &&',
    category: 'shell-text',
    prompt: "Create a 'pages' directory, create about.html and contact.html inside it, list contents — single command with &&.",
    setupFiles: standardSetup,
    assertions: [
      { type: 'file_exists', path: '/pages/about.html', description: 'about.html created in pages/' },
      { type: 'file_exists', path: '/pages/contact.html', description: 'contact.html created in pages/' },
    ],
  },

  // ─── Shell — Preview with curl (3 tests) ──────────────────────────
  {
    id: 'shell-curl',
    name: 'Inspect compiled homepage',
    category: 'shell-preview',
    prompt: 'Check what the compiled homepage looks like in the browser and tell me what the page title is.',
    setupFiles: handlebarsSetup,
    assertions: [
      { type: 'tool_args_match', toolName: 'shell', pattern: 'curl.*localhost', description: 'Used curl to inspect compiled output' },
      { type: 'output_matches', pattern: 'Curl Test Site', description: 'Output contains compiled page title from data.json' },
    ],
  },
  {
    id: 'shell-curl-path',
    name: 'Inspect compiled subpage',
    category: 'shell-preview',
    prompt: 'Inspect the compiled about page and verify the header partial is being rendered correctly.',
    setupFiles: handlebarsSetup,
    assertions: [
      { type: 'tool_args_match', toolName: 'shell', pattern: 'curl.*localhost', description: 'Used curl to inspect compiled page' },
      { type: 'output_matches', pattern: 'Site Navigation|header|nav', description: 'Output shows compiled partial content' },
    ],
  },
  {
    id: 'shell-curl-pipe',
    name: 'Inspect compiled output and search',
    category: 'shell-preview',
    prompt: "Look at the compiled homepage output and find which lines contain navigation elements.",
    setupFiles: handlebarsSetup,
    assertions: [
      { type: 'tool_args_match', toolName: 'shell', pattern: 'curl.*localhost', description: 'Used curl to fetch compiled output' },
      { type: 'tool_output_matches', toolName: 'shell', pattern: 'nav', description: 'Output contains nav matches' },
    ],
  },

  // ─── Write Tool (5 tests) ───────────────────────────────────────────
  {
    id: 'write-update',
    name: 'Update text in file',
    category: 'write-tool',
    prompt: "Change the page title from 'Test App' to 'My Application' in index.html.",
    setupFiles: standardSetup,
    assertions: [
      { type: 'tool_used', toolName: 'write', description: 'Used write tool' },
      { type: 'file_contains', path: '/index.html', value: 'My Application', description: 'New title present' },
      { type: 'file_not_contains', path: '/index.html', value: '<title>Test App</title>', description: 'Old title removed' },
    ],
  },
  {
    id: 'write-rewrite',
    name: 'Rewrite entire file',
    category: 'write-tool',
    prompt: 'Replace styles.css entirely with a modern CSS reset.',
    setupFiles: standardSetup,
    assertions: [
      { type: 'tool_used', toolName: 'write', description: 'Used write tool' },
      { type: 'file_not_contains', path: '/styles.css', value: '.btn:hover', description: 'Original content replaced' },
      { type: 'file_matches', path: '/styles.css', pattern: 'box-sizing|margin:\\s*0|border-box', description: 'Contains CSS reset content' },
    ],
  },
  {
    id: 'write-replace-entity',
    name: 'Replace HTML entity',
    category: 'write-tool',
    prompt: 'Replace the nav element in index.html with a new nav containing a logo and three links: Home, Portfolio, Contact.',
    setupFiles: standardSetup,
    assertions: [
      { type: 'tool_used', toolName: 'write', description: 'Used write tool' },
      { type: 'file_matches', path: '/index.html', pattern: 'logo|brand|site-name|site-title', description: 'Has logo/brand element' },
      { type: 'file_matches', path: '/index.html', pattern: 'Portfolio|Contact', description: 'Has new nav links' },
    ],
  },
  {
    id: 'write-multi-op',
    name: 'Multiple write operations',
    category: 'write-tool',
    prompt: "In index.html: change the title to 'Portfolio', update the h1 text, and add a footer before the closing body tag.",
    setupFiles: standardSetup,
    assertions: [
      { type: 'tool_used', toolName: 'write', description: 'Used write tool' },
      { type: 'file_matches', path: '/index.html', pattern: '<title>.*Portfolio.*<\\/title>', description: 'Title changed to Portfolio' },
      { type: 'file_matches', path: '/index.html', pattern: 'footer', description: 'Footer added' },
    ],
  },
  {
    id: 'write-new-file',
    name: 'Create new file with write',
    category: 'write-tool',
    prompt: "Create a new /about.html with heading 'About Us' and a paragraph of placeholder text.",
    setupFiles: standardSetup,
    assertions: [
      { type: 'tool_used', toolName: 'write', description: 'Used write tool' },
      { type: 'file_exists', path: '/about.html', description: 'about.html created' },
      { type: 'file_matches', path: '/about.html', pattern: 'About Us', description: 'Contains About Us heading' },
    ],
  },

  // ─── Evaluation Tool (3 tests) ──────────────────────────────────────
  {
    id: 'eval-complete-task',
    name: 'Evaluate simple completed task',
    category: 'evaluation',
    prompt: "Change the h1 text to 'Hello World' in index.html.",
    setupFiles: standardSetup,
    timeout: 60000,
    assertions: [
      { type: 'file_matches', path: '/index.html', pattern: 'Hello World', description: 'h1 changed to Hello World' },
    ],
  },
  {
    id: 'eval-missing-work',
    name: 'Evaluate multi-element creation',
    category: 'evaluation',
    prompt: 'Create index.html with a nav, hero section, and footer.',
    setupFiles: { '/.PROMPT.md': defaultPromptMd },
    timeout: 60000,
    assertions: [
      { type: 'file_matches', path: '/index.html', pattern: 'nav', description: 'Has nav element' },
      { type: 'file_matches', path: '/index.html', pattern: 'hero|banner', description: 'Has hero/banner section' },
      { type: 'file_matches', path: '/index.html', pattern: 'footer', description: 'Has footer element' },
    ],
  },
  {
    id: 'eval-multi-step',
    name: 'Evaluate multi-file task completion',
    category: 'evaluation',
    prompt: 'Create an about.html page, add a link to it from index.html nav, and add matching styles in styles.css.',
    setupFiles: standardSetup,
    timeout: 90000,
    assertions: [
      { type: 'file_exists', path: '/about.html', description: 'about.html created' },
      { type: 'file_matches', path: '/index.html', pattern: 'about', description: 'Nav links to about' },
    ],
  },

  // ─── Multi-Tool (5 tests) ───────────────────────────────────────────
  {
    id: 'multi-read-then-edit',
    name: 'Read then edit file',
    category: 'multi-tool',
    prompt: 'Read styles.css, then add a .card class with box shadow and border radius.',
    setupFiles: standardSetup,
    timeout: 60000,
    assertions: [
      { type: 'file_matches', path: '/styles.css', pattern: '\\.card', description: 'Has .card class' },
      { type: 'file_matches', path: '/styles.css', pattern: 'box-shadow', description: 'Has box-shadow' },
    ],
  },
  {
    id: 'multi-search-replace',
    name: 'Search then replace values',
    category: 'multi-tool',
    prompt: "Find all files containing 'color' with rg, then change the color values in styles.css to use CSS variables.",
    setupFiles: standardSetup,
    timeout: 60000,
    assertions: [
      { type: 'file_matches', path: '/styles.css', pattern: 'var\\(--', description: 'Uses CSS variables' },
    ],
  },
  {
    id: 'multi-scaffold-project',
    name: 'Scaffold project structure',
    category: 'multi-tool',
    prompt: 'Create /pages/ with index.html and about.html, /assets/ with main.css, and write content in each file.',
    setupFiles: { '/.PROMPT.md': defaultPromptMd },
    timeout: 60000,
    assertions: [
      { type: 'file_exists', path: '/pages/index.html', description: 'pages/index.html created' },
      { type: 'file_exists', path: '/pages/about.html', description: 'pages/about.html created' },
      { type: 'file_exists', path: '/assets/main.css', description: 'assets/main.css created' },
    ],
  },
  {
    id: 'multi-refactor-split',
    name: 'Refactor inline styles to file',
    category: 'multi-tool',
    prompt: 'Read index.html, extract the inline CSS into styles.css, and replace the style tag with a link tag.',
    setupFiles: {
      '/.PROMPT.md': defaultPromptMd,
      '/index.html': basicHTMLTemplate,
    },
    timeout: 60000,
    assertions: [
      { type: 'file_contains', path: '/index.html', value: '<link', description: 'Has link tag' },
      { type: 'file_not_contains', path: '/index.html', value: '<style>', description: 'Inline style tag removed' },
      { type: 'file_exists', path: '/styles.css', description: 'styles.css created' },
    ],
  },
  {
    id: 'multi-complex-pipeline',
    name: 'Discover files and generate sitemap',
    category: 'multi-tool',
    prompt: 'Create sitemap.xml listing all HTML files in the project — use find to discover them, then write the XML.',
    setupFiles: standardSetup,
    timeout: 60000,
    assertions: [
      { type: 'file_exists', path: '/sitemap.xml', description: 'sitemap.xml created' },
      { type: 'file_matches', path: '/sitemap.xml', pattern: 'index\\.html', description: 'Sitemap lists index.html' },
    ],
  },
];

// ─── Test Tracks ─────────────────────────────────────────────────────
export const testTracks: TestTrack[] = [
  {
    id: 'shell',
    name: 'Shell',
    description: 'Shell commands: read, write, search, text processing, preview',
    scenarioIds: testScenarios.filter(s => s.category.startsWith('shell-')).map(s => s.id),
  },
  {
    id: 'write',
    name: 'Write',
    description: 'Write tool: update, rewrite, replace, create',
    scenarioIds: testScenarios.filter(s => s.category === 'write-tool').map(s => s.id),
  },
  {
    id: 'eval',
    name: 'Eval',
    description: 'Evaluation tool: task completion assessment',
    scenarioIds: testScenarios.filter(s => s.category === 'evaluation').map(s => s.id),
  },
  {
    id: 'multi',
    name: 'Multi',
    description: 'Multi-tool: combined shell, write, and evaluation',
    scenarioIds: testScenarios.filter(s => s.category === 'multi-tool').map(s => s.id),
  },
];
