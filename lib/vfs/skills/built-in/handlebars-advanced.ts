/**
 * Handlebars Advanced - Built-in Skill
 * Advanced Handlebars templating patterns for OSW Studio
 */

export const HANDLEBARS_ADVANCED_SKILL = String.raw`---
name: handlebars-advanced
description: Read when using Handlebars templates, partials, or data.json. Covers helpers, loops, conditionals, and advanced data patterns.
---

# Advanced Handlebars Patterns

## Purpose
Deep dive into Handlebars features available in OSW Studio for building maintainable, data-driven static websites with reusable templates.

## Key Concept: Build-Time Compilation

**CRITICAL**: In OSW Studio, Handlebars templates are compiled automatically when the preview loads. You do NOT write JavaScript code to compile or render templates.

- \`.hbs\` files in \`/templates/\` are auto-registered as partials
- \`data.json\` provides global context for all templates
- NO \`Handlebars.compile()\` or manual registration needed
- Templates compile at BUILD-TIME, not runtime

## Complex Data Structures

### Nested Objects in data.json
\`\`\`json
{
  "site": {
    "title": "My Website",
    "author": {
      "name": "John Doe",
      "email": "john@example.com",
      "social": {
        "twitter": "@johndoe",
        "github": "johndoe"
      }
    }
  },
  "pages": [
    {
      "title": "Home",
      "path": "/",
      "featured": true
    }
  ]
}
\`\`\`

### Accessing Nested Data
\`\`\`handlebars
<h1>{{site.title}}</h1>
<p>By {{site.author.name}}</p>
<a href="https://twitter.com/{{site.author.social.twitter}}">Twitter</a>

{{#each pages}}
  {{#if featured}}
    <a href="{{path}}">{{title}}</a>
  {{/if}}
{{/each}}
\`\`\`

## Conditional Helpers

### Comparison Helpers
\`\`\`handlebars
{{! Equality }}
{{#if (eq status "active")}}
  <span class="badge-active">Active</span>
{{/if}}

{{! Greater than }}
{{#if (gt price 100)}}
  <span class="premium">Premium Product</span>
{{/if}}

{{! Less than or equal }}
{{#if (lte stock 5)}}
  <span class="low-stock">Only {{stock}} left!</span>
{{/if}}
\`\`\`

### Logical Helpers
\`\`\`handlebars
{{! AND logic }}
{{#if (and featured (gt price 50))}}
  <span>Featured Premium Item</span>
{{/if}}

{{! OR logic }}
{{#if (or onSale newArrival)}}
  <span class="badge">Special</span>
{{/if}}

{{! NOT logic }}
{{#if (not soldOut)}}
  <button>Add to Cart</button>
{{/if}}
\`\`\`

## Array Helpers

### Limit Helper
\`\`\`handlebars
{{! Show only first 5 items }}
{{#each (limit products 5)}}
  <div class="product">{{name}}</div>
{{/each}}
\`\`\`

### Repeat Content N Times
\`\`\`handlebars
{{! times, repeat, and for are all equivalent }}
{{#times 3}}
  <div class="item">Item {{add index 1}}</div>
{{/times}}

{{! Use with a data variable }}
{{#repeat count}}
  <span>●</span>
{{/repeat}}

{{! Access index, first, last (same as #each) }}
{{#for 4}}
  <div class="col {{#if first}}first{{/if}} {{#if last}}last{{/if}}">
    Column {{add index 1}}
  </div>
{{/for}}
\`\`\`

### Accessing Array Indices
\`\`\`handlebars
{{#each items}}
  <div class="item-{{@index}}">
    {{! @index is 0-based }}
    Item #{{add @index 1}}: {{this.name}}

    {{#if @first}}
      <span class="badge">First</span>
    {{/if}}

    {{#if @last}}
      <span class="badge">Last</span>
    {{/if}}
  </div>
{{/each}}
\`\`\`

## String Helpers

### Case Transformation
\`\`\`handlebars
<h1>{{uppercase title}}</h1>
<p class="subtitle">{{lowercase tagline}}</p>
\`\`\`

### String Concatenation
\`\`\`handlebars
<p>{{concat firstName " " lastName}}</p>
<a href="{{concat "mailto:" email}}">Contact</a>
\`\`\`

## Math Helpers

\`\`\`handlebars
{{! Calculate discounted price }}
<p>Was: \${{price}}</p>
<p>Now: \${{subtract price discount}}</p>

{{! Display total }}
<p>Subtotal: \${{multiply quantity price}}</p>

{{! Show percentage }}
<p>{{multiply (divide sold total) 100}}% sold</p>
\`\`\`

## Partial Composition

### Basic Partial Usage
\`\`\`handlebars
{{! In index.html }}
{{> header}}
{{> product-card}}
{{> footer}}
\`\`\`

### Passing Data to Partials
\`\`\`handlebars
{{! Inline parameters }}
{{> card title="Featured Product" price=99 featured=true}}

{{! From data context }}
{{#each products}}
  {{> product-card}}  {{! Inherits product data }}
{{/each}}

{{! With explicit context }}
{{#with featuredProduct}}
  {{> card}}  {{! Uses featuredProduct as context }}
{{/with}}
\`\`\`

### Dynamic Partial Selection
\`\`\`handlebars
{{! In data.json }}
{
  "widgets": [
    {"type": "text-widget", "content": "..."},
    {"type": "image-widget", "src": "..."}
  ]
}

{{! In template }}
{{#each widgets}}
  {{> (lookup this 'type')}}
{{/each}}
\`\`\`

## Advanced Patterns

### Filtering and Querying
\`\`\`handlebars
{{! Show only active products in electronics category }}
{{#each products}}
  {{#if (and (eq category "electronics") (eq status "active"))}}
    <div class="product">
      <h3>{{name}}</h3>
      <p>\${{price}}</p>
    </div>
  {{/if}}
{{/each}}
\`\`\`

### Complex Conditionals
\`\`\`handlebars
{{#if (or (and featured (gt rating 4)) (eq badge "bestseller"))}}
  <div class="featured-product">
    {{#if (eq badge "bestseller")}}
      <span class="badge-bestseller">Bestseller</span>
    {{else if featured}}
      <span class="badge-featured">Featured</span>
    {{/if}}
    <h3>{{name}}</h3>
  </div>
{{/if}}
\`\`\`

### Nested Partials with Context
\`\`\`handlebars
{{! templates/page-layout.hbs }}
<html>
  <head><title>{{pageTitle}}</title></head>
  <body>
    {{> header siteTitle=../site.title}}
    {{> content}}
    {{> footer}}
  </body>
</html>

{{! Use ../ to access parent context from nested scope }}
\`\`\`

## Data.json Best Practices

### Organize by Concern
\`\`\`json
{
  "meta": {
    "title": "Site Title",
    "description": "..."
  },
  "navigation": [
    {"label": "Home", "path": "/"}
  ],
  "products": [...],
  "testimonials": [...],
  "settings": {
    "theme": "light",
    "currency": "USD"
  }
}
\`\`\`

### Use Arrays for Repeating Data
\`\`\`json
{
  "features": [
    {
      "icon": "🚀",
      "title": "Fast",
      "description": "Lightning quick performance"
    },
    {
      "icon": "🔒",
      "title": "Secure",
      "description": "Bank-level security"
    }
  ]
}
\`\`\`

## Debugging Templates

### JSON Helper for Inspection
\`\`\`handlebars
{{! View entire data structure }}
<pre>{{json this}}</pre>

{{! View specific object }}
<pre>{{json product}}</pre>
\`\`\`

### Checking Variable Values
\`\`\`handlebars
{{! Use comments to debug }}
{{! Variable value: {{myVariable}} }}

{{#if myVariable}}
  <p>Variable exists: {{myVariable}}</p>
{{else}}
  <p>Variable is undefined/false/null/empty</p>
{{/if}}
\`\`\`

## Common Patterns

### Navigation Menu
\`\`\`json
{
  "navigation": [
    {"label": "Home", "path": "/", "active": true},
    {"label": "About", "path": "/about.html", "active": false}
  ]
}
\`\`\`

\`\`\`handlebars
<nav>
  {{#each navigation}}
    <a href="{{path}}" {{#if active}}class="active"{{/if}}>
      {{label}}
    </a>
  {{/each}}
</nav>
\`\`\`

### Product Grid with Filtering
\`\`\`handlebars
<div class="product-grid">
  {{#each products}}
    {{#if (and (gte price minPrice) (lte price maxPrice))}}
      <div class="product-card">
        <h3>{{name}}</h3>
        <p>\${{price}}</p>
        {{#if (lt stock 10)}}
          <span class="badge-limited">Limited Stock</span>
        {{/if}}
      </div>
    {{/if}}
  {{/each}}
</div>
\`\`\`

## Performance Tips

- Keep \`data.json\` under 100KB for best performance
- Use partials to avoid duplication, not for tiny snippets
- Limit nested loops (max 2-3 levels deep)
- Pre-process complex data transformations outside templates

## Common Mistakes to Avoid

- ❌ Writing JavaScript to compile templates (auto-compiled!)
- ❌ Trying to use template strings or ES6 in Handlebars
- ❌ Forgetting that Handlebars is logic-less (complex logic → data.json)
- ❌ Not escaping HTML when needed (\`{{{triple}}}\` for unescaped)
- ❌ Deeply nested data structures (keep it flat when possible)
`;
