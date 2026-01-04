/**
 * Functions - Built-in Skill
 * Guide for edge functions (API endpoints) and server functions (helpers)
 */

export const FUNCTIONS_SKILL = String.raw`---
name: server-functions
description: Server Mode - Edge functions (API endpoints) and server functions (helpers).
---

# Edge Functions & Server Functions

## Purpose
Complete guide for creating API endpoints (edge functions) and reusable helpers (server functions).

---

## Edge Functions

API endpoints accessible at ` + "`/api/sites/{siteId}/functions/{name}`" + `

### File Location
` + "```" + `
/.server/edge-functions/{function-name}.json
` + "```" + `

### JSON Format
` + "```" + `json
{
  "name": "function-name",
  "method": "GET|POST|PUT|DELETE|ANY",
  "description": "What this function does",
  "enabled": true,
  "timeoutMs": 5000,
  "code": "// JavaScript code here"
}
` + "```" + `

### Available Objects

**request** - Incoming HTTP request
- ` + "`request.method`" + ` - "GET", "POST", etc.
- ` + "`request.headers`" + ` - Object with headers
- ` + "`request.body`" + ` - Parsed JSON body (POST/PUT)
- ` + "`request.query`" + ` - URL query parameters

**db** - SQLite database access
- ` + "`db.query(sql, params?)`" + ` - Returns array of rows
- ` + "`db.run(sql, params?)`" + ` - Execute INSERT/UPDATE/DELETE, returns { lastInsertRowid, changes }

**Response** - Send responses
- ` + "`Response.json(data)`" + ` - JSON response (200)
- ` + "`Response.text(string)`" + ` - Text response (200)
- ` + "`Response.error(message, status)`" + ` - Error response

**server** - Call server functions
- ` + "`server.functionName(arg1, arg2, ...)`" + `

**secrets** - Access configured secrets
- ` + "`secrets.get('SECRET_NAME')`" + ` - Returns value or undefined
- ` + "`secrets.has('SECRET_NAME')`" + ` - Returns boolean

**fetch** - Make external HTTP requests
**console** - Logging (log, warn, error)

---

## Edge Function Examples

### GET - List Items
` + "```" + `json
{
  "name": "list-products",
  "method": "GET",
  "enabled": true,
  "code": "const products = db.query('SELECT * FROM products WHERE active = 1 ORDER BY name');\nResponse.json({ products, count: products.length });"
}
` + "```" + `

### GET - Single Item with Query Parameter
` + "```" + `json
{
  "name": "get-product",
  "method": "GET",
  "enabled": true,
  "code": "const { id } = request.query;\nif (!id) { Response.error('ID required', 400); return; }\nconst products = db.query('SELECT * FROM products WHERE id = ?', [id]);\nif (products.length === 0) { Response.error('Not found', 404); return; }\nResponse.json(products[0]);"
}
` + "```" + `

### POST - Create Item
` + "```" + `json
{
  "name": "create-product",
  "method": "POST",
  "enabled": true,
  "code": "const { name, price, description } = request.body;\nif (!name || !price) { Response.error('Name and price required', 400); return; }\nconst result = db.run('INSERT INTO products (name, price, description) VALUES (?, ?, ?)', [name, price, description || '']);\nResponse.json({ id: result.lastInsertRowid, name, price });"
}
` + "```" + `

### PUT - Update Item
` + "```" + `json
{
  "name": "update-product",
  "method": "PUT",
  "enabled": true,
  "code": "const { id, name, price } = request.body;\nif (!id) { Response.error('ID required', 400); return; }\nconst result = db.run('UPDATE products SET name = ?, price = ? WHERE id = ?', [name, price, id]);\nif (result.changes === 0) { Response.error('Not found', 404); return; }\nResponse.json({ updated: true });"
}
` + "```" + `

### DELETE - Remove Item
` + "```" + `json
{
  "name": "delete-product",
  "method": "DELETE",
  "enabled": true,
  "code": "const { id } = request.query;\nif (!id) { Response.error('ID required', 400); return; }\nconst result = db.run('DELETE FROM products WHERE id = ?', [id]);\nif (result.changes === 0) { Response.error('Not found', 404); return; }\nResponse.json({ deleted: true });"
}
` + "```" + `

### POST - With External API Call
` + "```" + `json
{
  "name": "send-email",
  "method": "POST",
  "enabled": true,
  "code": "const apiKey = secrets.get('SENDGRID_KEY');\nif (!apiKey) { Response.error('Email not configured', 500); return; }\nconst { to, subject, body } = request.body;\nconst res = await fetch('https://api.sendgrid.com/v3/mail/send', {\n  method: 'POST',\n  headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },\n  body: JSON.stringify({\n    personalizations: [{ to: [{ email: to }] }],\n    from: { email: 'noreply@example.com' },\n    subject,\n    content: [{ type: 'text/plain', value: body }]\n  })\n});\nif (!res.ok) { Response.error('Failed to send', 500); return; }\nResponse.json({ sent: true });"
}
` + "```" + `

---

## Server Functions (Helpers)

Reusable code that can be called from any edge function via ` + "`server.functionName(args)`" + `.

### File Location
` + "```" + `
/.server/server-functions/{function-name}.json
` + "```" + `

### JSON Format
` + "```" + `json
{
  "name": "helperName",
  "description": "What this helper does",
  "enabled": true,
  "code": "const [arg1, arg2] = args; return result;"
}
` + "```" + `

### Available Objects
Server functions have access to:
- ` + "`args`" + ` - Array of arguments passed by caller
- ` + "`db`" + ` - Database access (query, run)
- ` + "`fetch`" + ` - External HTTP requests
- ` + "`console`" + ` - Logging

---

## Server Function Examples

### Validate Auth
` + "```" + `json
{
  "name": "validateAuth",
  "enabled": true,
  "code": "const [apiKey] = args;\nif (!apiKey) return { valid: false, error: 'No API key' };\nconst users = db.query('SELECT * FROM users WHERE api_key = ? AND active = 1', [apiKey]);\nif (users.length === 0) return { valid: false, error: 'Invalid API key' };\nreturn { valid: true, user: users[0] };"
}
` + "```" + `

**Usage in edge function:**
` + "```" + `javascript
const auth = server.validateAuth(request.headers['x-api-key']);
if (!auth.valid) {
  Response.error(auth.error, 401);
  return;
}
// auth.user is now available
` + "```" + `

### Format Currency
` + "```" + `json
{
  "name": "formatPrice",
  "enabled": true,
  "code": "const [amount, currency = '$'] = args;\nreturn currency + Number(amount).toFixed(2);"
}
` + "```" + `

### Paginate Results
` + "```" + `json
{
  "name": "paginate",
  "enabled": true,
  "code": "const [table, page = 1, limit = 10] = args;\nconst offset = (page - 1) * limit;\nconst rows = db.query('SELECT * FROM ' + table + ' LIMIT ? OFFSET ?', [limit, offset]);\nconst total = db.query('SELECT COUNT(*) as count FROM ' + table)[0].count;\nreturn { rows, page, limit, total, pages: Math.ceil(total / limit) };"
}
` + "```" + `

---

## Creating Functions

**IMPORTANT: Use json_patch rewrite operation, NOT echo for creating functions.**

Echo with complex JSON strings causes escaping issues. The json_patch tool handles JSON encoding automatically.

### Create Edge Function (Recommended)
` + "```" + `javascript
// Use json_patch tool with type: "rewrite"
json_patch({
  "file_path": "/.server/edge-functions/list-products.json",
  "operations": [{
    "type": "rewrite",
    "content": JSON.stringify({
      "name": "list-products",
      "method": "GET",
      "enabled": true,
      "code": "const products = db.query('SELECT * FROM products WHERE active = 1');\\nResponse.json({ products });"
    }, null, 2)
  }]
})
` + "```" + `

### Create Server Function (Recommended)
` + "```" + `javascript
// Use json_patch tool with type: "rewrite"
json_patch({
  "file_path": "/.server/server-functions/formatPrice.json",
  "operations": [{
    "type": "rewrite",
    "content": JSON.stringify({
      "name": "formatPrice",
      "enabled": true,
      "code": "const [amount] = args;\\nreturn '$' + Number(amount).toFixed(2);"
    }, null, 2)
  }]
})
` + "```" + `

### Why NOT to use echo
` + "```" + `bash
# AVOID THIS - escaping nightmare
echo '{"name":"test","code":"const x = \"value\";"}' > file.json
# Results in broken JSON due to quote escaping issues
` + "```" + `

---

## Common Mistakes

### Forgetting return after Response
` + "```" + `javascript
// WRONG - code continues executing
if (!id) { Response.error('ID required', 400); }
const item = db.query(...);

// CORRECT
if (!id) { Response.error('ID required', 400); return; }
const item = db.query(...);
` + "```" + `

### Not checking for empty results
` + "```" + `javascript
// WRONG - undefined if not found
const rows = db.query('SELECT * FROM products WHERE id = ?', [id]);
Response.json(rows[0]);

// CORRECT
const rows = db.query('SELECT * FROM products WHERE id = ?', [id]);
if (rows.length === 0) { Response.error('Not found', 404); return; }
Response.json(rows[0]);
` + "```" + `

### Using db.query for mutations
` + "```" + `javascript
// WRONG - no lastInsertRowid
db.query('INSERT INTO products (name) VALUES (?)', ['Test']);

// CORRECT
const result = db.run('INSERT INTO products (name) VALUES (?)', ['Test']);
console.log(result.lastInsertRowid);
` + "```" + `
`;
