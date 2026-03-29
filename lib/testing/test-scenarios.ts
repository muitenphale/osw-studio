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
            background: #2c3e50;
            padding: 1rem;
        }
        nav ul {
            list-style: none;
            display: flex;
            gap: 2rem;
        }
        nav a {
            color: #ecf0f1;
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

  // ─── File Editing (5 tests) ─────────────────────────────────────────
  {
    id: 'write-update',
    name: 'Update text in file',
    category: 'file-editing',
    prompt: "Change the page title from 'Test App' to 'My Application' in index.html.",
    setupFiles: standardSetup,
    assertions: [
      { type: 'file_contains', path: '/index.html', value: 'My Application', description: 'New title present' },
      { type: 'file_not_contains', path: '/index.html', value: '<title>Test App</title>', description: 'Old title removed' },
    ],
  },
  {
    id: 'write-rewrite',
    name: 'Rewrite entire file',
    category: 'file-editing',
    prompt: 'Replace styles.css entirely with a modern CSS reset.',
    setupFiles: standardSetup,
    assertions: [
      { type: 'file_not_contains', path: '/styles.css', value: '.btn:hover', description: 'Original content replaced' },
      { type: 'file_matches', path: '/styles.css', pattern: 'box-sizing|margin:\\s*0|border-box', description: 'Contains CSS reset content' },
    ],
  },
  {
    id: 'write-replace-entity',
    name: 'Replace HTML entity',
    category: 'file-editing',
    prompt: 'Replace the nav element in index.html with a new nav containing a logo and three links: Home, Portfolio, Contact.',
    setupFiles: standardSetup,
    assertions: [
      { type: 'file_matches', path: '/index.html', pattern: 'logo|brand|site-name|site-title', description: 'Has logo/brand element' },
      { type: 'file_matches', path: '/index.html', pattern: 'Portfolio|Contact', description: 'Has new nav links' },
    ],
  },
  {
    id: 'write-multi-op',
    name: 'Multiple edits to same file',
    category: 'file-editing',
    prompt: "In index.html: change the title to 'Portfolio', update the h1 text, and add a footer before the closing body tag.",
    setupFiles: standardSetup,
    assertions: [
      { type: 'file_matches', path: '/index.html', pattern: '<title>.*Portfolio.*<\\/title>', description: 'Title changed to Portfolio' },
      { type: 'file_matches', path: '/index.html', pattern: 'footer', description: 'Footer added' },
    ],
  },
  {
    id: 'write-new-file',
    name: 'Create new file',
    category: 'file-editing',
    prompt: "Create a new /about.html with heading 'About Us' and a paragraph of placeholder text.",
    setupFiles: standardSetup,
    assertions: [
      { type: 'file_exists', path: '/about.html', description: 'about.html created' },
      { type: 'file_matches', path: '/about.html', pattern: 'About Us', description: 'Contains About Us heading' },
    ],
  },

  // ─── File Editing — Targeted Multiline (3 tests) ───────────────────
  {
    id: 'write-targeted-nav',
    name: 'Replace nav with new content',
    category: 'file-editing',
    prompt: "Replace only the nav element in index.html with a new nav that has a logo span 'MySite' and links to Home, Portfolio, Blog, and Contact. Keep the rest of the page exactly as it is.",
    setupFiles: standardSetup,
    assertions: [
      { type: 'file_matches', path: '/index.html', pattern: 'MySite', description: 'Has logo text' },
      { type: 'file_matches', path: '/index.html', pattern: 'Portfolio', description: 'Has Portfolio link' },
      { type: 'file_matches', path: '/index.html', pattern: 'Blog', description: 'Has Blog link' },
      { type: 'file_contains', path: '/index.html', value: '<main', description: 'Main section preserved' },
      { type: 'file_not_contains', path: '/index.html', value: '#services', description: 'Old Services link removed' },
    ],
  },
  {
    id: 'write-targeted-style-block',
    name: 'Replace specific CSS rule block',
    category: 'file-editing',
    prompt: "In styles.css, replace the .btn rule (including the .btn:hover rule) with a new .btn that has padding: 12px 24px, background: #e74c3c, border-radius: 8px, and a hover state that changes background to #c0392b and adds transform: translateY(-2px).",
    setupFiles: standardSetup,
    assertions: [
      { type: 'file_contains', path: '/styles.css', value: '#e74c3c', description: 'New button color' },
      { type: 'file_contains', path: '/styles.css', value: 'border-radius: 8px', description: 'New border-radius' },
      { type: 'file_contains', path: '/styles.css', value: 'translateY', description: 'Has transform on hover' },
      { type: 'file_not_contains', path: '/styles.css', value: '#007bff', description: 'Old color removed' },
      { type: 'file_contains', path: '/styles.css', value: '.container', description: 'Container rule preserved' },
    ],
  },
  {
    id: 'write-targeted-js-handler',
    name: 'Replace JS event handler',
    category: 'file-editing',
    prompt: "In script.js, replace the click event listener with one that adds an 'active' class to the clicked link, removes 'active' from all other links, and smoothly scrolls to the target section.",
    setupFiles: standardSetup,
    assertions: [
      { type: 'file_matches', path: '/script.js', pattern: 'active', description: 'Uses active class' },
      { type: 'file_matches', path: '/script.js', pattern: 'scroll|scrollIntoView|scrollTo', description: 'Has smooth scroll' },
      { type: 'file_matches', path: '/script.js', pattern: 'DOMContentLoaded|addEventListener', description: 'Still has event listener structure' },
    ],
  },

  // ─── File Editing — Entity Replacement (2 tests) ─────────────────
  {
    id: 'write-entity-js-function',
    name: 'Replace JS function by name',
    category: 'file-editing',
    prompt: "In script.js, replace the function renderCards with a new implementation that creates Bootstrap-style cards with image, title, and description. Keep all other code unchanged.",
    setupFiles: {
      '/.PROMPT.md': defaultPromptMd,
      '/index.html': basicHTMLTemplate,
      '/styles.css': basicCSSFile,
      '/script.js': `
const API_URL = 'https://api.example.com';

function renderCards(container, items) {
    container.innerHTML = '';
    items.forEach(item => {
        const div = document.createElement('div');
        div.className = 'card';
        div.innerHTML = '<h3>' + item.title + '</h3><p>' + item.desc + '</p>';
        container.appendChild(div);
    });
}

function initApp() {
    const container = document.getElementById('cards');
    const items = [
        { title: 'Card 1', desc: 'Description 1' },
        { title: 'Card 2', desc: 'Description 2' },
        { title: 'Card 3', desc: 'Description 3' },
    ];
    renderCards(container, items);
}

document.addEventListener('DOMContentLoaded', initApp);`,
    },
    assertions: [
      { type: 'file_matches', path: '/script.js', pattern: 'img|image|src', description: 'New renderCards has image support' },
      { type: 'file_contains', path: '/script.js', value: 'initApp', description: 'initApp function preserved' },
      { type: 'file_contains', path: '/script.js', value: 'API_URL', description: 'API_URL constant preserved' },
      { type: 'file_contains', path: '/script.js', value: 'DOMContentLoaded', description: 'Event listener preserved' },
    ],
  },
  {
    id: 'write-entity-html-header',
    name: 'Replace HTML header section',
    category: 'file-editing',
    prompt: "Replace the entire <header> element in index.html with a new sticky header that has a logo 'Acme Co', nav links (Products, Pricing, Blog, Contact), and a 'Sign Up' CTA button. Keep all other page content unchanged.",
    setupFiles: {
      '/.PROMPT.md': defaultPromptMd,
      '/index.html': `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Acme Corp</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; }
    </style>
</head>
<body>
    <header class="site-header">
        <div class="header-inner">
            <span class="logo">OldBrand</span>
            <nav>
                <ul>
                    <li><a href="#home">Home</a></li>
                    <li><a href="#about">About</a></li>
                    <li><a href="#services">Services</a></li>
                </ul>
            </nav>
            <div class="header-actions">
                <a href="#login" class="login-link">Log In</a>
            </div>
        </div>
    </header>
    <main>
        <section class="hero">
            <h1>Welcome to Acme</h1>
            <p>Building the future, one product at a time.</p>
        </section>
        <section class="features">
            <div class="feature-card">
                <h3>Fast</h3>
                <p>Lightning quick performance.</p>
            </div>
            <div class="feature-card">
                <h3>Secure</h3>
                <p>Enterprise-grade security.</p>
            </div>
            <div class="feature-card">
                <h3>Scalable</h3>
                <p>Grows with your business.</p>
            </div>
        </section>
    </main>
    <footer>
        <p>&copy; 2024 Acme Corp</p>
    </footer>
</body>
</html>`,
      '/styles.css': basicCSSFile,
    },
    assertions: [
      { type: 'file_contains', path: '/index.html', value: 'Acme Co', description: 'Has new logo text' },
      { type: 'file_matches', path: '/index.html', pattern: 'Products', description: 'Has Products link' },
      { type: 'file_matches', path: '/index.html', pattern: 'Pricing', description: 'Has Pricing link' },
      { type: 'file_matches', path: '/index.html', pattern: 'Sign Up', description: 'Has Sign Up CTA' },
      { type: 'file_contains', path: '/index.html', value: 'Welcome to Acme', description: 'Hero section preserved' },
      { type: 'file_contains', path: '/index.html', value: 'feature-card', description: 'Features section preserved' },
      { type: 'file_not_contains', path: '/index.html', value: 'OldBrand', description: 'Old brand removed' },
    ],
  },

  // ─── File Editing Stress Tests (6 tests) ───────────────────────────
  {
    id: 'write-stress-special-chars',
    name: 'Edit file with special characters',
    category: 'file-editing',
    prompt: "Update index.html: change the script tag content to include a template literal that logs `Hello, ${name}! Welcome to \"OSW Studio\" — it's great.` and a regex /\\d+\\.\\d+/g.",
    setupFiles: standardSetup,
    assertions: [
      { type: 'file_contains', path: '/index.html', value: '${name}', description: 'Contains template literal variable' },
      { type: 'file_matches', path: '/index.html', pattern: 'it.s great', description: 'Contains apostrophe text' },
      { type: 'file_matches', path: '/index.html', pattern: '\\\\d', description: 'Contains regex pattern' },
    ],
  },
  {
    id: 'write-stress-multiline',
    name: 'Update multi-line block',
    category: 'file-editing',
    prompt: "Replace the entire nav element in index.html (from <nav to </nav>) with a new nav containing: a logo div with text 'BRAND', and links to Home, Gallery, Portfolio, and Contact. Do not include the old About or Services links.",
    setupFiles: standardSetup,
    assertions: [
      { type: 'file_matches', path: '/index.html', pattern: 'BRAND', description: 'Has brand logo' },
      { type: 'file_matches', path: '/index.html', pattern: 'Portfolio', description: 'Has Portfolio link' },
      { type: 'file_contains', path: '/index.html', value: 'Contact', description: 'Has Contact link' },
      { type: 'file_contains', path: '/index.html', value: 'Gallery', description: 'Has Gallery link' },
      { type: 'file_not_contains', path: '/index.html', value: '#services', description: 'Old Services link removed' },
      { type: 'file_not_contains', path: '/index.html', value: '#about', description: 'Old About link removed' },
    ],
  },
  {
    id: 'write-stress-large-rewrite',
    name: 'Rewrite large file',
    category: 'file-editing',
    prompt: "Rewrite index.html with a complete landing page: a header with logo and nav, a hero section with heading and CTA button, three feature cards in a grid, a testimonials section, and a footer with copyright. Include all CSS inline in a style tag. Make it at least 100 lines.",
    setupFiles: standardSetup,
    assertions: [
      { type: 'file_matches', path: '/index.html', pattern: 'hero|banner', description: 'Has hero section' },
      { type: 'file_matches', path: '/index.html', pattern: 'feature|card', description: 'Has feature cards' },
      { type: 'file_matches', path: '/index.html', pattern: 'testimonial|review|quote', description: 'Has testimonials' },
      { type: 'file_matches', path: '/index.html', pattern: 'footer', description: 'Has footer' },
    ],
  },
  {
    id: 'write-stress-sequential-edits',
    name: 'Sequential edits to same file',
    category: 'file-editing',
    prompt: "Make these changes to index.html in order: 1) Change the title to 'My Portfolio', 2) Add a class 'dark-theme' to the body tag, 3) Add a footer with text 'Built with OSW Studio' before </body>.",
    setupFiles: standardSetup,
    assertions: [
      { type: 'file_contains', path: '/index.html', value: 'My Portfolio', description: 'Title changed' },
      { type: 'file_contains', path: '/index.html', value: 'dark-theme', description: 'Body class added' },
      { type: 'file_contains', path: '/index.html', value: 'Built with OSW Studio', description: 'Footer added' },
    ],
  },
  {
    id: 'write-stress-json-edit',
    name: 'Create and edit JSON file',
    category: 'file-editing',
    prompt: "Create /config.json with a JSON object containing: name (string), version (string \"1.0.0\"), features (array of 3 strings), settings (nested object with theme: \"dark\", language: \"en\", debug: false).",
    setupFiles: standardSetup,
    assertions: [
      { type: 'file_exists', path: '/config.json', description: 'config.json created' },
      { type: 'valid_json', path: '/config.json', description: 'Valid JSON' },
      { type: 'file_contains', path: '/config.json', value: '"version"', description: 'Has version field' },
      { type: 'file_contains', path: '/config.json', value: '"debug"', description: 'Has nested debug setting' },
    ],
  },
  {
    id: 'write-stress-create-css',
    name: 'Create complex CSS file',
    category: 'file-editing',
    prompt: "Create /theme.css with: CSS custom properties on :root (--primary, --secondary, --bg, --text colors), a .container class with max-width, .btn with multiple states (:hover, :active, :disabled), a @media query for mobile, and a @keyframes fadeIn animation.",
    setupFiles: standardSetup,
    assertions: [
      { type: 'file_exists', path: '/theme.css', description: 'theme.css created' },
      { type: 'file_contains', path: '/theme.css', value: '--primary', description: 'Has CSS custom property' },
      { type: 'file_matches', path: '/theme.css', pattern: ':hover', description: 'Has hover state' },
      { type: 'file_matches', path: '/theme.css', pattern: '@media', description: 'Has media query' },
      { type: 'file_matches', path: '/theme.css', pattern: '@keyframes', description: 'Has keyframes animation' },
    ],
  },

  // ─── Status / Task Completion (7 tests) ─────────────────────────────
  {
    id: 'eval-complete-task',
    name: 'Evaluate simple completed task',
    category: 'status',
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
    category: 'status',
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
    category: 'status',
    prompt: 'Create an about.html page, add a link to it from index.html nav, and add matching styles in styles.css.',
    setupFiles: standardSetup,
    timeout: 90000,
    assertions: [
      { type: 'file_exists', path: '/about.html', description: 'about.html created' },
      { type: 'file_matches', path: '/index.html', pattern: 'about', description: 'Nav links to about' },
    ],
  },
  {
    id: 'eval-verify-then-finish',
    name: 'Evaluate task with verification step',
    category: 'status',
    prompt: "Add a 'contact' link to the nav in index.html, then verify it was added correctly by reading the file.",
    setupFiles: standardSetup,
    timeout: 60000,
    assertions: [
      { type: 'file_matches', path: '/index.html', pattern: '[Cc]ontact', description: 'Contact link added to nav' },
      { type: 'tool_used', toolName: 'shell', description: 'Used shell to verify' },
    ],
  },
  {
    id: 'eval-multi-file-create',
    name: 'Evaluate multi-file project scaffold',
    category: 'status',
    prompt: "Create a blog structure: /blog/index.html (list page), /blog/post-1.html (first post with title 'Getting Started'), and /blog/styles.css (blog-specific styles).",
    setupFiles: { '/.PROMPT.md': defaultPromptMd },
    timeout: 90000,
    assertions: [
      { type: 'file_exists', path: '/blog/index.html', description: 'Blog index created' },
      { type: 'file_exists', path: '/blog/post-1.html', description: 'Blog post created' },
      { type: 'file_exists', path: '/blog/styles.css', description: 'Blog styles created' },
      { type: 'file_matches', path: '/blog/post-1.html', pattern: 'Getting Started', description: 'Post has correct title' },
    ],
  },
  {
    id: 'eval-edit-and-confirm',
    name: 'Evaluate edit with confirmation read',
    category: 'status',
    prompt: "Change the nav background color from '#2c3e50' to '#1a1a2e' and all nav link colors from '#ecf0f1' to '#e94560'. After editing, read back the file to verify both changes are present.",
    setupFiles: standardSetup,
    timeout: 60000,
    assertions: [
      { type: 'file_matches_any', paths: ['/index.html', '/styles.css'], pattern: '#1a1a2e', description: 'Nav background color changed' },
      { type: 'file_matches_any', paths: ['/index.html', '/styles.css'], pattern: '#e94560', description: 'Nav link color changed' },
    ],
  },
  {
    id: 'eval-conditional-work',
    name: 'Evaluate task requiring inspection first',
    category: 'status',
    prompt: "Check if index.html has a footer. If not, add one with copyright text '2024 Test App'. If it does, update the footer text.",
    setupFiles: standardSetup,
    timeout: 60000,
    assertions: [
      { type: 'file_matches', path: '/index.html', pattern: 'footer', description: 'Has footer element' },
      { type: 'file_matches', path: '/index.html', pattern: '2024.*Test App|Test App.*2024', description: 'Footer has copyright text' },
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

  // ─── Delegate — Sub-Agent Delegation (5 tests) ──────────────────────
  {
    id: 'delegate-parallel-pages',
    name: 'Delegate two pages matching existing homepage',
    category: 'delegate',
    prompt: "The project has a homepage at /index.html. Create two additional pages that match its style: /about.html with an 'Our Story' h1 and a team section, and /contact.html with a contact form (name, email, message fields). Use delegate task to create both pages in parallel.",
    setupFiles: {
      '/.PROMPT.md': defaultPromptMd,
      '/index.html': `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>Home</title>\n  <style>\n    * { margin: 0; padding: 0; box-sizing: border-box; }\n    body { font-family: 'Georgia', serif; color: #2d3436; background: #fafafa; }\n    nav { background: #2d3436; padding: 1rem 2rem; display: flex; gap: 1.5rem; }\n    nav a { color: #dfe6e9; text-decoration: none; font-size: 0.95rem; }\n    nav a:hover { color: #74b9ff; }\n    .hero { padding: 4rem 2rem; text-align: center; background: linear-gradient(135deg, #dfe6e9, #b2bec3); }\n    .hero h1 { font-size: 2.5rem; margin-bottom: 1rem; }\n    .hero p { font-size: 1.1rem; color: #636e72; max-width: 600px; margin: 0 auto; }\n  </style>\n</head>\n<body>\n  <nav>\n    <a href="/index.html">Home</a>\n    <a href="/about.html">About</a>\n    <a href="/contact.html">Contact</a>\n  </nav>\n  <section class="hero">\n    <h1>Welcome Home</h1>\n    <p>A simple site with consistent styling across all pages.</p>\n  </section>\n</body>\n</html>`,
    },
    timeout: 120000,
    assertions: [
      { type: 'file_exists', path: '/about.html', description: 'About page created' },
      { type: 'file_matches', path: '/about.html', pattern: 'Our Story', description: 'About has heading' },
      { type: 'file_exists', path: '/contact.html', description: 'Contact page created' },
      { type: 'file_matches', path: '/contact.html', pattern: 'form', description: 'Contact has form' },
      { type: 'tool_args_match', toolName: 'shell', pattern: 'delegate.*task', description: 'Used delegate task' },
    ],
  },
  {
    id: 'delegate-explore-then-edit',
    name: 'Explore colors then create design tokens',
    category: 'delegate',
    prompt: "Step 1: Use delegate explore to find all color values (hex codes like #xxx) used across all project files.\nStep 2: After the explore result comes back, use that information to create /design-tokens.css with CSS custom properties (--primary, --secondary, --bg, --text) based on the colors found.\nStep 3: Update styles.css to import and use those CSS variables instead of hardcoded hex values.\nYou must do steps 2 and 3 yourself after the explore delegate returns — the explore agent only reads files, it cannot edit them.",
    setupFiles: standardSetup,
    timeout: 120000,
    assertions: [
      { type: 'file_exists', path: '/design-tokens.css', description: 'Design tokens file created' },
      { type: 'file_matches', path: '/design-tokens.css', pattern: '--primary', description: 'Has primary variable' },
      { type: 'file_matches', path: '/styles.css', pattern: 'var\\(--', description: 'styles.css uses CSS variables' },
      { type: 'tool_args_match', toolName: 'shell', pattern: 'delegate.*explore', description: 'Used delegate explore' },
    ],
  },
  {
    id: 'delegate-plan-then-implement',
    name: 'Plan gallery then implement it',
    category: 'delegate',
    prompt: "Step 1: Use delegate plan to analyze the current project and recommend how to add a responsive image gallery section.\nStep 2: After the plan result comes back, implement the gallery yourself in index.html — add at least 4 placeholder images in a CSS grid that adapts to screen size with a @media query.\nThe plan agent only analyzes — you must write the code yourself in step 2.",
    setupFiles: standardSetup,
    timeout: 120000,
    assertions: [
      { type: 'file_matches', path: '/index.html', pattern: 'gallery|grid', description: 'Has gallery section' },
      { type: 'file_matches', path: '/index.html', pattern: 'img|image', description: 'Has images' },
      { type: 'file_matches_any', paths: ['/index.html', '/styles.css'], pattern: '@media|grid|flex', description: 'Has responsive layout' },
      { type: 'tool_args_match', toolName: 'shell', pattern: 'delegate.*plan', description: 'Used delegate plan' },
    ],
  },
  {
    id: 'delegate-parallel-independent-edits',
    name: 'Three delegate tasks to different files',
    category: 'delegate',
    prompt: "Use a single delegate task command with three prompts to make independent changes in parallel:\n  delegate task \"In /index.html, add a dark mode toggle button inside the nav element\" \"In /styles.css, add a .card class with padding: 1rem, box-shadow: 0 2px 8px rgba(0,0,0,.1), border-radius: 8px, and a :hover state that lifts it up\" \"Create /footer.html with copyright '2024 MyBrand', three social media links, and a newsletter signup form\"",
    setupFiles: standardSetup,
    timeout: 120000,
    assertions: [
      { type: 'file_matches', path: '/index.html', pattern: 'dark.*mode|theme.*toggle|toggle.*dark', description: 'Has dark mode toggle' },
      { type: 'file_matches', path: '/styles.css', pattern: '\\.card', description: 'Has .card class' },
      { type: 'file_matches', path: '/styles.css', pattern: 'box-shadow', description: 'Card has box-shadow' },
      { type: 'file_exists', path: '/footer.html', description: 'Footer partial created' },
      { type: 'file_matches', path: '/footer.html', pattern: 'MyBrand|2024', description: 'Footer has copyright' },
      { type: 'tool_args_match', toolName: 'shell', pattern: 'delegate.*task', description: 'Used delegate task' },
    ],
  },
  {
    id: 'delegate-multi-page-consistent-update',
    name: 'Delegate task per page for consistent nav',
    category: 'delegate',
    prompt: "The project has three HTML pages. Use a single delegate task command with three prompts to add the same navigation bar to each page in parallel:\n  delegate task \"Add a nav bar with logo 'SiteKit' and links to index.html, about.html, contact.html at the top of /index.html body\" \"Add a nav bar with logo 'SiteKit' and links to index.html, about.html, contact.html at the top of /about.html body\" \"Add a nav bar with logo 'SiteKit' and links to index.html, about.html, contact.html at the top of /contact.html body\"",
    setupFiles: {
      '/.PROMPT.md': defaultPromptMd,
      '/index.html': `<!DOCTYPE html><html><head><title>Home</title></head><body><main><h1>Home Page</h1><p>Welcome to our site.</p></main></body></html>`,
      '/about.html': `<!DOCTYPE html><html><head><title>About</title></head><body><main><h1>About Us</h1><p>Learn more about us.</p></main></body></html>`,
      '/contact.html': `<!DOCTYPE html><html><head><title>Contact</title></head><body><main><h1>Contact</h1><p>Get in touch.</p></main></body></html>`,
    },
    timeout: 120000,
    assertions: [
      { type: 'file_matches', path: '/index.html', pattern: 'SiteKit', description: 'Homepage has logo' },
      { type: 'file_matches', path: '/about.html', pattern: 'SiteKit', description: 'About has logo' },
      { type: 'file_matches', path: '/contact.html', pattern: 'SiteKit', description: 'Contact has logo' },
      { type: 'file_matches', path: '/index.html', pattern: 'about\\.html', description: 'Homepage links to about' },
      { type: 'file_matches', path: '/index.html', pattern: 'contact\\.html', description: 'Homepage links to contact' },
      { type: 'tool_args_match', toolName: 'shell', pattern: 'delegate', description: 'Used delegate command' },
    ],
  },
  // ─── Compaction — Context Continuity (2 tests) ────────────────────────
  // These tests generate enough context to trigger compaction (set a low
  // compaction limit like 32K-64K in provider settings to reliably trigger).
  // They verify the model completes the full task despite context resets.
  {
    id: 'compaction-multipage-site',
    name: 'Build 8-page site through compaction',
    category: 'compaction',
    prompt: "Create a complete website for 'Nimbus Analytics' — a cloud data company. Create exactly 8 HTML pages, each with full content (multiple sections, paragraphs, lists). Required pages: /index.html (hero, features grid, testimonials), /about.html (company story, team bios for 6 people, timeline), /services.html (6 service cards with descriptions), /pricing.html (3-tier pricing table), /blog.html (4 article previews with excerpts), /careers.html (company culture section, 4 job listings), /contact.html (contact form, office locations), /faq.html (10+ Q&A items). Also create /styles.css shared across all pages. Every page must link to all other pages in the nav.",
    setupFiles: { '/.PROMPT.md': defaultPromptMd },
    timeout: 300000,
    assertions: [
      { type: 'file_exists', path: '/index.html', description: 'Homepage created' },
      { type: 'file_exists', path: '/about.html', description: 'About page created' },
      { type: 'file_exists', path: '/services.html', description: 'Services page created' },
      { type: 'file_exists', path: '/pricing.html', description: 'Pricing page created' },
      { type: 'file_exists', path: '/blog.html', description: 'Blog page created' },
      { type: 'file_exists', path: '/careers.html', description: 'Careers page created' },
      { type: 'file_exists', path: '/contact.html', description: 'Contact page created' },
      { type: 'file_exists', path: '/faq.html', description: 'FAQ page created' },
      { type: 'file_exists', path: '/styles.css', description: 'Shared stylesheet created' },
      { type: 'file_matches', path: '/faq.html', pattern: 'faq\\.html|contact\\.html', description: 'Late page has nav links (context survived compaction)' },
      { type: 'file_matches', path: '/careers.html', pattern: 'Nimbus', description: 'Brand name preserved through compaction' },
    ],
  },
  {
    id: 'compaction-iterative-expansion',
    name: 'Iteratively expand project through compaction',
    category: 'compaction',
    prompt: "Build a documentation site step by step. Step 1: Create /index.html as a docs landing page for 'Forge CLI' with a sidebar nav listing 5 sections. Step 2: Create /getting-started.html with installation instructions for macOS, Linux, and Windows (full commands and explanations for each OS). Step 3: Create /commands.html documenting 8 CLI commands (forge init, forge build, forge deploy, forge test, forge lint, forge serve, forge config, forge plugin) — each with synopsis, description, flags table, and 2 examples. Step 4: Create /configuration.html explaining the forge.config.json schema with 10+ fields documented. Step 5: Create /plugins.html with a plugin API reference and 3 example plugins with full code. Step 6: Create /styles.css used by all pages. Every page must have consistent nav linking to all other pages and use the shared stylesheet.",
    setupFiles: { '/.PROMPT.md': defaultPromptMd },
    timeout: 300000,
    assertions: [
      { type: 'file_exists', path: '/index.html', description: 'Landing page created' },
      { type: 'file_exists', path: '/getting-started.html', description: 'Getting started created' },
      { type: 'file_exists', path: '/commands.html', description: 'Commands reference created' },
      { type: 'file_exists', path: '/configuration.html', description: 'Configuration docs created' },
      { type: 'file_exists', path: '/plugins.html', description: 'Plugins page created' },
      { type: 'file_exists', path: '/styles.css', description: 'Shared stylesheet created' },
      { type: 'file_matches', path: '/commands.html', pattern: 'forge deploy', description: 'Commands page has deploy docs' },
      { type: 'file_matches', path: '/plugins.html', pattern: 'plugins\\.html|commands\\.html', description: 'Last page has nav links (context survived compaction)' },
      { type: 'file_matches', path: '/configuration.html', pattern: 'Forge|forge', description: 'Brand name preserved through compaction' },
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
    id: 'file-editing',
    name: 'File Editing',
    description: 'File editing: update, rewrite, replace, create',
    scenarioIds: testScenarios.filter(s => s.category === 'file-editing').map(s => s.id),
  },
  {
    id: 'eval',
    name: 'Status',
    description: 'Status: task completion assessment',
    scenarioIds: testScenarios.filter(s => s.category === 'status').map(s => s.id),
  },
  {
    id: 'multi',
    name: 'Multi',
    description: 'Multi-step: combined read, edit, and verify',
    scenarioIds: testScenarios.filter(s => s.category === 'multi-tool').map(s => s.id),
  },
  {
    id: 'delegate',
    name: 'Delegate',
    description: 'Delegate: sub-agent exploration, planning, and parallel task execution',
    scenarioIds: testScenarios.filter(s => s.category === 'delegate').map(s => s.id),
  },
  {
    id: 'compaction',
    name: 'Compaction',
    description: 'Compaction: context continuity through automatic conversation summarization',
    scenarioIds: testScenarios.filter(s => s.category === 'compaction').map(s => s.id),
  },
];
