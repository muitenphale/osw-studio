/**
 * Server - Built-in Skill (Overview)
 * Brief overview of backend features with references to focused skills
 */

export const SERVER_SKILL = String.raw`---
name: server-overview
description: Server Mode - Quick orientation for features (requires Server Mode deployment).
---

# Server Mode Overview

## Purpose
Quick reference for OSW Studio Server Mode features. For detailed guidance, read the specific skills below.

## Related Skills
- **Server Mode: Functions** - Creating edge functions (API endpoints) and server functions (helpers)
- **Server Mode: Database** - Schema design, db.query/db.run patterns, table structures
- **Server Mode: Secrets** - Managing API keys and sensitive configuration

---

## File Structure

` + "```" + `
/.server/
├── db/
│   └── schema.sql              (read-only, auto-generated)
├── edge-functions/
│   └── {function-name}.json    (one file per endpoint)
├── secrets/
│   └── {SECRET_NAME}.json      (one file per secret)
└── server-functions/
    └── {function-name}.json    (one file per helper)
` + "```" + `

---

## Quick Reference

### Edge Functions
API endpoints — call from client JS with simple paths: ` + "`fetch('/function-name')`" + ` (platform auto-routes)

` + "```" + `json
{
  "name": "list-products",
  "method": "GET",
  "enabled": true,
  "code": "const rows = db.query('SELECT * FROM products');\nResponse.json({ products: rows });"
}
` + "```" + `

### Server Functions (Helpers)
Reusable code called via ` + "`server.functionName(args)`" + `

` + "```" + `json
{
  "name": "formatPrice",
  "enabled": true,
  "code": "const [amount] = args; return '$' + Number(amount).toFixed(2);"
}
` + "```" + `

### Database
Database access is available via:

1. **sqlite3 shell command** (Server Mode only):
` + "```" + `bash
sqlite3 "SELECT * FROM products"
sqlite3 -json "SELECT * FROM users"
` + "```" + `

2. **Edge functions** (all modes):
` + "```" + `javascript
// In edge function code:
const rows = db.query('SELECT * FROM products');
db.run('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, email TEXT UNIQUE)');
` + "```" + `

### Secrets
Create placeholder files, user sets values in Server Settings > Secrets:

` + "```" + `json
{
  "name": "STRIPE_API_KEY",
  "description": "Stripe secret key for payments"
}
` + "```" + `

Access in functions: ` + "`secrets.get('STRIPE_API_KEY')`" + `

---

## Available Objects in Functions

| Object | Purpose |
|--------|---------|
| ` + "`request`" + ` | HTTP request (method, headers, body, query) |
| ` + "`db`" + ` | Database (query, run) |
| ` + "`Response`" + ` | Send responses (json, text, error) |
| ` + "`server`" + ` | Call server functions |
| ` + "`secrets`" + ` | Access secrets (get, has) |
| ` + "`fetch`" + ` | External HTTP requests |
| ` + "`console`" + ` | Logging |

---

## Common Patterns

**Always return after Response:**
` + "```" + `javascript
if (!id) { Response.error('ID required', 400); return; }
` + "```" + `

**Check secrets exist:**
` + "```" + `javascript
const key = secrets.get('API_KEY');
if (!key) { Response.error('Not configured', 500); return; }
` + "```" + `

**Use db.run for mutations:**
` + "```" + `javascript
const result = db.run('INSERT INTO products (name) VALUES (?)', ['Test']);
console.log(result.lastInsertRowid);
` + "```" + `
`;
