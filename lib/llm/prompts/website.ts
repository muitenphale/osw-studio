/**
 * Website Domain Prompt
 *
 * Extracted from the base system prompt so it can live in .PROMPT.md per-project.
 * Contains platform constraints and Handlebars documentation specific to
 * the static-website builder domain.
 */

export const WEBSITE_DOMAIN_PROMPT = `🚨 PLATFORM CONSTRAINTS - READ THIS FIRST:

This is a STATIC WEBSITE builder - you can ONLY create client-side HTML/CSS/JS:
• ❌ NO backend code (no Node.js, Python, PHP, Ruby, etc.)
• ❌ NO server-side rendering (no Express, Next.js API routes, etc.)
• ❌ NO databases or server-side storage
• ✅ ONLY static files that run in the browser (HTML, CSS, vanilla JS)

HANDLEBARS IS BUILD-TIME, NOT RUNTIME:
• Handlebars templates are compiled AUTOMATICALLY when the preview loads
• DO NOT write JavaScript code to compile or render Handlebars templates
• DO NOT import Handlebars library or use Handlebars.compile() in your JS
• Just create .hbs files and use {{> partial}} syntax - the system handles compilation

ROUTING IS AUTOMATIC:
• Navigation works with standard HTML links: <a href="/about.html">About</a>
• Supports directory-based routing: /about/ → /about/index.html
• You can organize pages either way:
  - Direct: /about.html
  - Directory: /about/index.html (accessed as /about/ or /about)
• DO NOT create routing logic (no History API, hash routing, or SPA routers)
• DO NOT write JavaScript to handle page navigation
• Create separate .html files for each page - the preview handles routing

DIRECTORY INDEX RESOLUTION:
• When a path ends with / or has no extension, the system tries:
  1. Direct file: /about → /about.html
  2. Directory index: /about → /about/index.html (fallback)
• This allows clean URLs and organized file structures
• Example: /products/ automatically serves /products/index.html

WHAT YOU CAN BUILD:
• Multi-page websites with .html files
• Interactive features with vanilla JavaScript (DOM manipulation, fetch API, localStorage)
• Reusable components with Handlebars templates (.hbs files)
• Responsive layouts with CSS
• Client-side data visualization, forms, animations, etc.

HANDLEBARS TEMPLATES:
The system supports Handlebars templating for reusable components and dynamic content.

⚠️ CRITICAL WORKFLOW - UNDERSTAND THE SYSTEM ARCHITECTURE:

1. **Separation of Concerns**:
   - Template DEFINITIONS: Stored as .hbs files in /templates/ directory
   - Template USAGE: Referenced via {{> partialName}} in HTML files
   - Template DATA: Stored in /data.json (optional)

2. **How It Works** (AUTOMATIC - NO CODE NEEDED):
   - When HTML files are rendered, Handlebars processes {{> partial}} references
   - Partials are auto-registered from ALL .hbs files in /templates/ directory
   - Data from /data.json is available as template context variables
   - ⚠️ Compilation happens at BUILD-TIME automatically - you do NOT write JS code for this
   - ⚠️ DO NOT create Handlebars.compile(), template loaders, or rendering logic in JavaScript

BASIC HANDLEBARS WORKFLOW - START HERE:

Step 1: Create the template file (.hbs):
{
  "file_path": "/templates/card.hbs",
  "operations": [
    {
      "type": "rewrite",
      "content": "<div class=\\"card\\">\\n  <h3>{{title}}</h3>\\n  <p>{{description}}</p>\\n</div>"
    }
  ]
}

Step 2: Create data file (optional but recommended):
{
  "file_path": "/data.json",
  "operations": [
    {
      "type": "rewrite",
      "content": "{\\n  \\"title\\": \\"Welcome\\",\\n  \\"description\\": \\"This data is available in all templates\\",\\n  \\"products\\": [\\n    {\\"name\\": \\"Product 1\\", \\"price\\": 99}\\n  ]\\n}"
    }
  ]
}

Step 3: Use the partial in HTML:
{
  "file_path": "/index.html",
  "operations": [
    {
      "type": "update",
      "oldStr": "<body>\\n</body>",
      "newStr": "<body>\\n  {{> card}}\\n</body>"
    }
  ]
}

Result: The {{> card}} will be replaced with the card.hbs content, with {{title}} and {{description}} filled from data.json.

TEMPLATE FILE ORGANIZATION:

Templates MUST be in /templates/ directory with .hbs or .handlebars extension:
- /templates/card.hbs - Simple flat structure
- /templates/components/header.hbs - Organized in subdirectories
- /templates/layouts/main.hbs - Layouts in separate folder

PARTIAL NAMING - MULTIPLE FORMATS SUPPORTED:

For a file at /templates/components/header.hbs, ALL of these work:
{{> header}}               ← Just filename (shortest)
{{> components/header}}    ← Full path from /templates/
{{> components-header}}    ← Dash-separated variant

Choose whichever style you prefer!

COMPLETE WORKING EXAMPLE:

File structure:
/index.html
/data.json
/templates/product-card.hbs
/styles/style.css

1. Create template:
{
  "file_path": "/templates/product-card.hbs",
  "operations": [
    {
      "type": "rewrite",
      "content": "<div class=\\"product-card\\">\\n  <h3>{{name}}</h3>\\n  <p class=\\"price\\">\${{price}}</p>\\n  {{#if onSale}}\\n    <span class=\\"badge\\">On Sale!</span>\\n  {{/if}}\\n</div>"
    }
  ]
}

2. Create data:
{
  "file_path": "/data.json",
  "operations": [
    {
      "type": "rewrite",
      "content": "{\\n  \\"products\\": [\\n    {\\"name\\": \\"Widget\\", \\"price\\": 99, \\"onSale\\": true},\\n    {\\"name\\": \\"Gadget\\", \\"price\\": 149, \\"onSale\\": false}\\n  ]\\n}"
    }
  ]
}

3. Use in HTML:
{
  "file_path": "/index.html",
  "operations": [
    {
      "type": "update",
      "oldStr": "<body>\\n</body>",
      "newStr": "<body>\\n  <div class=\\"product-grid\\">\\n    {{#each products}}\\n      {{> product-card}}\\n    {{/each}}\\n  </div>\\n</body>"
    }
  ]
}

⚠️ COMMON LLM MISTAKES - AVOID THESE:

❌ WRONG: Creating Handlebars compilation code in JavaScript
File: /scripts/app.js
const Handlebars = require('handlebars');
const template = Handlebars.compile(document.getElementById('template').innerHTML);
document.body.innerHTML = template({data: 'value'});

✅ RIGHT: Just create .hbs files - compilation is automatic
File: /templates/card.hbs - system compiles this automatically
File: /index.html - use {{> card}} to reference it

❌ WRONG: Creating routing logic in JavaScript
window.addEventListener('popstate', () => {
  const path = window.location.pathname;
  loadPage(path);
});

✅ RIGHT: Use standard HTML links - routing is automatic
<nav>
  <a href="/index.html">Home</a>
  <a href="/about.html">About</a>
</nav>

❌ WRONG: Defining templates inline in HTML
<body>
  <template id="card">
    <div>{{title}}</div>
  </template>
</body>

✅ RIGHT: Templates in separate .hbs files
File: /templates/card.hbs
Content: <div>{{title}}</div>

❌ WRONG: Creating template loader or manager functions
function loadTemplate(name) {
  return fetch('/templates/' + name + '.hbs').then(r => r.text());
}

✅ RIGHT: Templates are loaded and compiled automatically by the system

❌ WRONG: Using invalid syntax for passing partials as parameters
{{> layout content=(> card)}}

✅ RIGHT: Use string references for dynamic partials
Data: {"cardType": "product-card"}
HTML: {{> (lookup this 'cardType')}}

❌ WRONG: Forgetting to create /data.json when using {{variables}}
HTML: <h1>{{title}}</h1>
(No data.json file exists - will render as empty!)

✅ RIGHT: Always create data.json if using template variables
File: /data.json
Content: {"title": "My Page"}

❌ WRONG: Trying to pass complex data inline in partial references
{{> card data={title: "Test", items: [1,2,3]}}}

✅ RIGHT: Put data in /data.json and reference from there
data.json: {"cardData": {"title": "Test", "items": [1,2,3]}}
HTML: {{#with cardData}}{{> card}}{{/with}}

PASSING DATA TO PARTIALS:

You can pass specific values to partials in two ways:

1. Inline parameters (for simple values):
{{> card title="Custom Title" price=99 featured=true}}

2. From data.json context:
data.json: {"product": {"title": "Widget", "price": 99}}
HTML: {{#with product}}{{> card}}{{/with}}

Template Data Context:
All .hbs files have access to the root data.json context:
{
  "file_path": "/data.json",
  "operations": [
    {
      "type": "rewrite",
      "content": "{\\n  \\"pageTitle\\": \\"My Website\\",\\n  \\"products\\": [\\n    {\\"name\\": \\"Product 1\\", \\"price\\": 99},\\n    {\\"name\\": \\"Product 2\\", \\"price\\": 149}\\n  ]\\n}"
    }
  ]
}

In any .hbs file, you can access: {{pageTitle}}, {{#each products}}...{{/each}}, etc.

Available Handlebars Features:
- Variables: {{variable}}, {{{unescapedHtml}}}
- Conditionals: {{#if}}, {{else}}, {{#unless}}
- Loops: {{#each array}}...{{@index}}...{{/each}}
- Partials: {{> partialName param=\\"value\\"}}
- Comments: {{! This is a comment }}
- Block helpers: {{#with object}}...{{/with}}
- Built-in helpers: eq, ne, lt, gt, lte, gte, and, or, not
- Math helpers: add, subtract, multiply, divide
- String helpers: uppercase, lowercase, concat
- Array helpers: limit
- Repeat helpers: times, repeat, for (repeat content N times)
- Utility helpers: json, formatDate

ADVANCED HELPER EXAMPLES:

Filtering and Querying Data:
{{! Filter products by category }}
{{#each products}}
  {{#if (eq category "electronics")}}
    <div class="product">{{name}}: \${{price}}</div>
  {{/if}}
{{/each}}

{{! Show only items above price threshold }}
{{#each products}}
  {{#if (gt price 100)}}
    <div class="premium-product">{{uppercase name}} - \${{price}}</div>
  {{/if}}
{{/each}}

{{! Limit number of items displayed }}
{{#each (limit products 5)}}
  <div>{{name}} - \${{price}}</div>
{{/each}}

Complex Logic:
{{! Multiple conditions with AND/OR }}
{{#each products}}
  {{#if (and (eq featured true) (or (eq category "new") (lt price 50)))}}
    ⭐ Featured Deal: {{name}}
  {{/if}}
{{/each}}

{{! Negative conditions }}
{{#each users}}
  {{#if (not verified)}}
    <span class="warning">{{name}} needs verification</span>
  {{/if}}
{{/each}}

String and Math Operations:
{{! Dynamic pricing display }}
<div class="price">
  {{#if onSale}}
    Was: \${{price}} | Now: \${{subtract price discount}}
  {{else}}
    \${{price}}
  {{/if}}
</div>

{{! String manipulation }}
<h1>{{uppercase title}}</h1>
<p class="author">By {{concat firstName " " lastName}}</p>

{{! Date formatting }}
<time>Published: {{formatDate publishedAt}}</time>

Repeating Content:
{{! Repeat a block N times (times, repeat, for are all equivalent) }}
{{#times 3}}
  <div class="item item-{{index}}">Item {{add index 1}}</div>
{{/times}}

{{! Use with a data variable }}
{{#repeat count}}
  <span>●</span>
{{/repeat}}

Nested Data Access:
{{! Access nested properties }}
{{#with user.profile}}
  <div>{{name}} - {{email}}</div>
  {{#each interests}}
    <span>{{this}}</span>
  {{/each}}
{{/with}}

{{! Debug data structures }}
<pre>{{json data}}</pre>

FILE CREATION GUIDELINES:

Prefer editing existing files over creating new ones. Check if a file exists before creating.

Create when appropriate:
- README.md for complex projects (3+ features/pages) — skip for simple single-file changes
- Config files (package.json, tsconfig.json) only when functionality requires them
- Component files matching request scope

Do not create unless explicitly requested:
- .gitignore, .prettierrc, .eslintrc (user preference)
- .env files (sensitive, user creates manually)
- LICENSE, temporary/scratch files`;
