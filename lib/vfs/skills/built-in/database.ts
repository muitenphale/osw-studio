/**
 * Database - Built-in Skill
 * Guide for SQLite database operations via edge functions
 */

export const DATABASE_SKILL = String.raw`---
name: server-database
description: Server Mode - SQLite database operations for published deployments.
---

# Database Operations

## Purpose
Guide for SQLite database access via edge functions.

---

## Database Access Methods

### Option 1: sqlite3 Shell Command (Server Mode Only)

In Server Mode with a published deployment selected, use the ` + "`sqlite3`" + ` shell command for quick queries:

` + "```" + `bash
# Query data
sqlite3 "SELECT * FROM products"

# JSON output
sqlite3 -json "SELECT * FROM users WHERE active = 1"

# Create table
sqlite3 "CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY, name TEXT)"

# Insert data
sqlite3 "INSERT INTO products (name) VALUES ('Test Product')"
` + "```" + `

**Note:** sqlite3 requires Server Mode with a deployment context. In Browser Mode, use edge functions instead.

### Option 2: Edge Functions (All Modes)

Edge functions provide database access via the ` + "`db`" + ` object:
- ` + "`db.query(sql, params)`" + ` - SELECT queries, returns array of rows
- ` + "`db.run(sql, params)`" + ` - INSERT/UPDATE/DELETE, returns { lastInsertRowid, changes }

---

## IMPORTANT: schema.sql is Read-Only

The file ` + "`/.server/db/schema.sql`" + ` is **auto-generated and read-only**. You cannot modify it directly.

To create or modify tables, use one of these methods:
1. **sqlite3 shell command** (Server Mode): ` + "`sqlite3 \"CREATE TABLE IF NOT EXISTS ...\"`" + `
2. **Edge function db.run()**: ` + "`db.run('CREATE TABLE IF NOT EXISTS ...')`" + `

---

## Creating Tables

### Quick Method: sqlite3 Command (Server Mode)

` + "```" + `bash
# Create a single table
sqlite3 "CREATE TABLE IF NOT EXISTS contact_submissions (id INTEGER PRIMARY KEY, name TEXT, email TEXT, message TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)"

# Verify it was created
sqlite3 "SELECT name FROM sqlite_master WHERE type='table'"
` + "```" + `

### Edge Function Method

Tables can also be created using ` + "`db.run()`" + ` in edge functions with ` + "`CREATE TABLE IF NOT EXISTS`" + `.

### Example: Initialize Database Tables

Create an edge function to set up your schema:

` + "```" + `javascript
// write to create /.server/edge-functions/init-db.json
write({
  "file_path": "/.server/edge-functions/init-db.json",
  "operations": [{
    "type": "rewrite",
    "content": JSON.stringify({
      "name": "init-db",
      "method": "POST",
      "enabled": true,
      "code": [
        "// Create tables if they don't exist",
        "db.run(\`CREATE TABLE IF NOT EXISTS products (",
        "  id INTEGER PRIMARY KEY AUTOINCREMENT,",
        "  name TEXT NOT NULL,",
        "  price REAL NOT NULL DEFAULT 0,",
        "  description TEXT,",
        "  active INTEGER DEFAULT 1,",
        "  created_at TEXT DEFAULT CURRENT_TIMESTAMP",
        ")\`);",
        "",
        "db.run(\`CREATE TABLE IF NOT EXISTS users (",
        "  id INTEGER PRIMARY KEY AUTOINCREMENT,",
        "  email TEXT NOT NULL UNIQUE,",
        "  name TEXT,",
        "  created_at TEXT DEFAULT CURRENT_TIMESTAMP",
        ")\`);",
        "",
        "Response.json({ success: true, message: 'Database initialized' });"
      ].join("\\n")
    }, null, 2)
  }]
})
` + "```" + `

**Important**: After publishing the deployment, call the init endpoint to create tables:
` + "`POST /api/deployments/{deploymentId}/functions/init-db`" + `

---

## Common Table Schemas

### Products Table
` + "```" + `sql
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  price REAL NOT NULL DEFAULT 0,
  description TEXT,
  category TEXT DEFAULT 'general',
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
)
` + "```" + `

### Users Table
` + "```" + `sql
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  role TEXT DEFAULT 'user',
  api_key TEXT UNIQUE,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
)
` + "```" + `

### Orders with Foreign Keys
` + "```" + `sql
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  total REAL NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
)
` + "```" + `

### Contact Form Submissions
` + "```" + `sql
CREATE TABLE IF NOT EXISTS contact_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  message TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
)
` + "```" + `

---

## Query Patterns in Edge Functions

### SELECT Queries

` + "```" + `javascript
// Get all active products
const products = db.query('SELECT * FROM products WHERE active = 1');
Response.json({ products });

// Get single item by ID
const { id } = request.query;
const rows = db.query('SELECT * FROM products WHERE id = ?', [id]);
if (rows.length === 0) {
  Response.error('Not found', 404);
  return;
}
Response.json(rows[0]);

// With ordering and limit
const recent = db.query('SELECT * FROM orders ORDER BY created_at DESC LIMIT 10');

// With JOINs
const ordersWithUsers = db.query(\`
  SELECT o.*, u.email, u.name as customer_name
  FROM orders o
  JOIN users u ON o.user_id = u.id
  WHERE o.status = ?
\`, ['pending']);
` + "```" + `

### INSERT Operations

` + "```" + `javascript
const { name, price, description } = request.body;
if (!name || !price) {
  Response.error('Name and price required', 400);
  return;
}

const result = db.run(
  'INSERT INTO products (name, price, description) VALUES (?, ?, ?)',
  [name, price, description || null]
);

Response.json({
  id: result.lastInsertRowid,
  name,
  price
});
` + "```" + `

### UPDATE Operations

` + "```" + `javascript
const { id, name, price } = request.body;
if (!id) {
  Response.error('ID required', 400);
  return;
}

const result = db.run(
  'UPDATE products SET name = ?, price = ? WHERE id = ?',
  [name, price, id]
);

if (result.changes === 0) {
  Response.error('Not found', 404);
  return;
}

Response.json({ updated: true });
` + "```" + `

### DELETE Operations

` + "```" + `javascript
const { id } = request.query;
if (!id) {
  Response.error('ID required', 400);
  return;
}

const result = db.run('DELETE FROM products WHERE id = ?', [id]);
if (result.changes === 0) {
  Response.error('Not found', 404);
  return;
}

Response.json({ deleted: true });
` + "```" + `

---

## Complete Edge Function Example

` + "```" + `javascript
// Create a CRUD endpoint for products
write({
  "file_path": "/.server/edge-functions/products.json",
  "operations": [{
    "type": "rewrite",
    "content": JSON.stringify({
      "name": "products",
      "method": "ANY",
      "enabled": true,
      "code": [
        "// Ensure table exists",
        "db.run(\`CREATE TABLE IF NOT EXISTS products (",
        "  id INTEGER PRIMARY KEY AUTOINCREMENT,",
        "  name TEXT NOT NULL,",
        "  price REAL NOT NULL DEFAULT 0,",
        "  created_at TEXT DEFAULT CURRENT_TIMESTAMP",
        ")\`);",
        "",
        "if (request.method === 'GET') {",
        "  const { id } = request.query;",
        "  if (id) {",
        "    const rows = db.query('SELECT * FROM products WHERE id = ?', [id]);",
        "    if (rows.length === 0) { Response.error('Not found', 404); return; }",
        "    Response.json(rows[0]);",
        "  } else {",
        "    const products = db.query('SELECT * FROM products ORDER BY created_at DESC');",
        "    Response.json({ products });",
        "  }",
        "} else if (request.method === 'POST') {",
        "  const { name, price } = request.body;",
        "  if (!name || !price) { Response.error('Name and price required', 400); return; }",
        "  const result = db.run('INSERT INTO products (name, price) VALUES (?, ?)', [name, price]);",
        "  Response.json({ id: result.lastInsertRowid, name, price });",
        "} else if (request.method === 'DELETE') {",
        "  const { id } = request.query;",
        "  if (!id) { Response.error('ID required', 400); return; }",
        "  db.run('DELETE FROM products WHERE id = ?', [id]);",
        "  Response.json({ deleted: true });",
        "} else {",
        "  Response.error('Method not allowed', 405);",
        "}"
      ].join("\\n")
    }, null, 2)
  }]
})
` + "```" + `

---

## Inline Table Creation Pattern

The recommended pattern is to include ` + "`CREATE TABLE IF NOT EXISTS`" + ` at the start of edge functions that need database access:

` + "```" + `javascript
// Always runs first - idempotent, no error if table exists
db.run(\`CREATE TABLE IF NOT EXISTS my_table (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  data TEXT
)\`);

// Then do your actual operation
const rows = db.query('SELECT * FROM my_table');
Response.json({ rows });
` + "```" + `

This ensures the table exists before any operation, without requiring a separate initialization step.

---

## SQLite Data Types

| Type | Description |
|------|-------------|
| ` + "`INTEGER`" + ` | Whole numbers |
| ` + "`REAL`" + ` | Floating point |
| ` + "`TEXT`" + ` | Strings |
| ` + "`BLOB`" + ` | Binary data |
| ` + "`NULL`" + ` | Null value |

---

## Protected Tables

System tables cannot be modified:
- ` + "`_files`" + ` - Published deployment files
- ` + "`_settings`" + ` - Deployment configuration
- ` + "`_analytics`" + ` - Analytics data
- ` + "`_edge_functions`" + ` - Edge function definitions
- ` + "`_server_functions`" + ` - Server function definitions
- ` + "`_secrets`" + ` - Secret metadata
`;
