# Server Features

This guide covers OSW Studio's advanced server features, available in **Server Mode** only.

## Overview

Server Mode unlocks powerful backend capabilities for your published sites, including serverless API endpoints, database management, and secure secrets storage.

**Key Features:**
- **Edge Functions** - REST API endpoints with JavaScript runtime
- **Database** - Per-site SQLite with SQL editor and schema browser
- **Server Functions** - Reusable helper code for edge functions
- **Secrets** - Encrypted storage for API keys and tokens
- **Logs** - Execution history and debugging
- **AI Integration** - AI awareness of server features via `/.server/` folder

## Prerequisites

- OSW Studio running in **Server Mode**
- A published site with `databaseEnabled: true`
- Admin access to the site

## Accessing Server Settings

1. Open the **Admin Dashboard** (`/admin`)
2. Navigate to **Sites** and select your site
3. Click the **Server Settings** button (server icon) next to Site Settings
   - The server icon only appears for published sites with database enabled
   - You can also access it via the "..." dropdown menu → "Server Settings"

The Server Settings modal contains six tabs:
- **Schema** - Browse tables and columns
- **SQL** - Execute raw SQL queries
- **Functions** - Create and manage edge functions (HTTP endpoints)
- **Helpers** - Create and manage server functions (reusable code)
- **Secrets** - Store encrypted API keys and tokens
- **Logs** - View function execution history

---

## Edge Functions

### Creating a Function

1. Go to **Server Settings → Functions**
2. Click **New Function**
3. Configure:
   - **Name**: Lowercase letters, numbers, and hyphens (e.g., `get-users`)
   - **HTTP Method**: GET, POST, PUT, DELETE, or ANY
   - **Description**: Optional description
   - **Timeout**: 1-30 seconds (default: 5s)
   - **Code**: JavaScript function body

4. Click **Create Function**

### Function URL

Each function is accessible at:
```
https://your-server.com/api/sites/{siteId}/functions/{function-name}
```

For example:
```
https://oswstudio.com/api/sites/abc123/functions/get-products
```

### Calling Edge Functions from Published Sites

Published sites automatically route edge function calls! Your frontend JavaScript can call functions using simple paths:

```javascript
// In your published site's JavaScript
const response = await fetch('/submit-contact', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'John', email: 'john@example.com' })
});
const result = await response.json();
```

This works because OSW Studio injects a lightweight interceptor script (~1.5KB) into published HTML files that:
- Detects requests that look like edge function calls (paths without file extensions)
- Routes them to `/api/sites/{siteId}/functions/{path}`
- Works with `fetch()`, `XMLHttpRequest`, and form submissions

**Form submissions** are also intercepted:
```html
<form action="/submit-contact" method="POST">
  <input name="email" type="email" required>
  <button type="submit">Subscribe</button>
</form>
```

The form data is automatically converted to JSON and sent to your edge function.

**Custom event handling:**
```javascript
// Listen for edge function responses
document.addEventListener('edge-function-response', (e) => {
  console.log('Result:', e.detail.result);
});

document.addEventListener('edge-function-error', (e) => {
  console.error('Error:', e.detail.error);
});
```

### Available APIs

Your function code has access to these global objects:

#### `request` Object
```javascript
request.method   // HTTP method (GET, POST, etc.)
request.body     // Parsed JSON body (POST/PUT/PATCH)
request.query    // Query string parameters
request.headers  // Request headers
request.path     // URL path after function name
request.params   // Path parameters (if any)
```

#### `db` Object (Database)
```javascript
// Execute SELECT queries
const users = db.query('SELECT * FROM users WHERE active = ?', [true]);
const user = db.all('SELECT * FROM users LIMIT 10'); // alias for query

// Execute INSERT/UPDATE/DELETE
const result = db.run('INSERT INTO users (name, email) VALUES (?, ?)', ['John', 'john@example.com']);
// result = { changes: 1 }
```

#### `Response` Object
```javascript
// Return JSON
Response.json({ users: [...] });
Response.json({ error: 'Not found' }, 404);

// Return plain text
Response.text('Hello World');
Response.text('Created', 201);

// Return error
Response.error('Something went wrong', 500);
Response.error('Unauthorized', 401);
```

#### `fetch` Function
```javascript
// Make external HTTP requests
const response = await fetch('https://api.example.com/data');
const data = await response.json();
Response.json(data);
```

#### `server` Object (Helper Functions)
```javascript
// Call server functions (helpers) defined in the Helpers tab
const auth = server.validateAuth(request.headers['x-api-key']);
const formatted = server.formatPrice(29.99, 'USD');
const user = server.getUserById(123);
```

See [Server Functions (Helpers)](#server-functions-helpers) for more details.

#### `secrets` Object (Encrypted Secrets)
```javascript
// Get secret value by name
const apiKey = secrets.get('STRIPE_API_KEY');
if (!apiKey) {
  Response.error('Stripe not configured', 500);
  return;
}

// Check if secret exists
if (secrets.has('SENDGRID_KEY')) {
  // Use SendGrid
}

// List all available secret names
const allSecrets = secrets.list(); // ['STRIPE_API_KEY', 'SENDGRID_KEY', ...]
```

See [Secrets](#secrets) for more details.

### Example Functions

#### List Items (GET)
```javascript
// GET /api/sites/{siteId}/functions/list-items
const items = db.query('SELECT * FROM items ORDER BY created_at DESC LIMIT 20');
Response.json({ items });
```

#### Create Item (POST)
```javascript
// POST /api/sites/{siteId}/functions/create-item
if (!request.body.name) {
  Response.error('Name is required', 400);
  return;
}

const result = db.run(
  'INSERT INTO items (name, description) VALUES (?, ?)',
  [request.body.name, request.body.description || '']
);

Response.json({
  id: result.lastInsertRowid,
  message: 'Item created'
}, 201);
```

#### Get Item by ID (GET with path)
```javascript
// GET /api/sites/{siteId}/functions/get-item/123
const id = request.path.split('/')[1];
if (!id) {
  Response.error('ID required', 400);
  return;
}

const item = db.query('SELECT * FROM items WHERE id = ?', [id]);
if (item.length === 0) {
  Response.error('Item not found', 404);
  return;
}

Response.json(item[0]);
```

#### External API Proxy
```javascript
// GET /api/sites/{siteId}/functions/weather?city=London
const city = request.query.city || 'New York';
const apiKey = secrets.get('WEATHER_API_KEY');
if (!apiKey) {
  Response.error('Weather API not configured', 500);
  return;
}

const res = await fetch(
  `https://api.weatherapi.com/v1/current.json?key=${apiKey}&q=${city}`
);
const data = await res.json();

Response.json({
  city: data.location.name,
  temp: data.current.temp_c,
  condition: data.current.condition.text
});
```

### Security Considerations

#### Sandboxed Execution
- Functions run in a Node.js VM sandbox
- Allowed globals: `JSON`, `Date`, `Math`, `Array`, `Object`, `String`, `Number`, `Boolean`, `RegExp`, `Error`, `Map`, `Set`, `Promise`, `Symbol`, `fetch`, `console`
- Utility functions: `parseInt`, `parseFloat`, `isNaN`, `isFinite`, `encodeURIComponent`, `decodeURIComponent`, `encodeURI`, `decodeURI`, `atob`, `btoa`
- No access to: `require`, `process`, `__dirname`, `Buffer`, file system
- `setTimeout`/`setInterval` disabled (prevents infinite loops)

#### Database Protection
System tables are protected and cannot be accessed:
- `site_info`
- `files`
- `file_tree_nodes`
- `pageviews`
- `interactions`
- `sessions`
- `edge_functions`
- `function_logs`
- `server_functions`
- `secrets`

Only user-created tables are accessible via the `db` API.

#### Query Limits
- Maximum 100 database queries per function execution
- Timeout enforced (1-30 seconds, configurable)
- SQL keywords validated to prevent dangerous operations

### Managing Functions

#### Enable/Disable
Click the dropdown menu on a function card and select **Enable** or **Disable**. Disabled functions return 404.

#### Edit
Click **Edit** in the dropdown to modify the function code, method, or timeout.

#### Delete
Click **Delete** in the dropdown. This cannot be undone.

#### Copy URL
Click **Copy URL** below the function card to copy the public endpoint URL.

---

## Server Functions (Helpers)

Server functions are reusable JavaScript helpers that can be called from your edge functions via the `server` object. They enable code reuse across multiple edge functions.

### Creating a Server Function

1. Go to **Server Settings → Helpers**
2. Click **New Helper**
3. Configure:
   - **Name**: Valid JavaScript identifier (camelCase or snake_case, e.g., `validateAuth`, `format_price`)
   - **Description**: Optional description
   - **Code**: JavaScript function body
4. Click **Create Function**

### How Server Functions Work

Server functions receive arguments via an `args` array and have access to `db`, `fetch`, and `console`. They return a value that is passed back to the calling edge function.

```javascript
// Server function "validateAuth"
const [apiKey] = args;
if (!apiKey) {
  return { valid: false, error: 'No API key provided' };
}

const users = db.query('SELECT * FROM users WHERE api_key = ?', [apiKey]);
if (users.length === 0) {
  return { valid: false, error: 'Invalid API key' };
}

return { valid: true, user: users[0] };
```

### Calling from Edge Functions

Server functions are available on the `server` object. Pass arguments as regular function parameters:

```javascript
// Edge function code
const auth = server.validateAuth(request.headers['x-api-key']);
if (!auth.valid) {
  Response.error(auth.error, 401);
  return;
}

// User is authenticated
const products = db.query(
  'SELECT * FROM products WHERE user_id = ?',
  [auth.user.id]
);
Response.json({ products });
```

### Available APIs in Server Functions

| API | Description |
|-----|-------------|
| `args` | Array of arguments passed from edge function |
| `db.query()` | Execute SELECT query |
| `db.run()` | Execute INSERT/UPDATE/DELETE |
| `db.all()` | Alias for query |
| `fetch()` | Make external HTTP requests |
| `console.log()` | Log messages (visible in function logs) |

### Example Server Functions

#### Validate API Key
```javascript
// Name: validateAuth
const [apiKey] = args;
if (!apiKey) return { valid: false };

const users = db.query('SELECT id, name, role FROM users WHERE api_key = ?', [apiKey]);
return users.length > 0 ? { valid: true, user: users[0] } : { valid: false };
```

#### Format Price
```javascript
// Name: formatPrice
const [amount, currency = 'USD'] = args;
const symbols = { USD: '$', EUR: '€', GBP: '£', JPY: '¥' };
const symbol = symbols[currency] || currency + ' ';
return symbol + amount.toFixed(2);
```

#### Get User by ID
```javascript
// Name: getUserById
const [id] = args;
if (!id) return null;

const users = db.query('SELECT * FROM users WHERE id = ?', [id]);
return users.length > 0 ? users[0] : null;
```

#### Check Permission
```javascript
// Name: hasPermission
const [userId, permission] = args;
if (!userId || !permission) return false;

const perms = db.query(
  'SELECT 1 FROM user_permissions WHERE user_id = ? AND permission = ?',
  [userId, permission]
);
return perms.length > 0;
```

### Security Notes

- Server functions run in the same VM context as the parent edge function
- They share the total execution timeout (not additive)
- Recursive calls are possible but limited by timeout
- The `server_functions` table is protected and cannot be queried
- Only enabled server functions are available to edge functions

### Managing Server Functions

- **Enable/Disable**: Toggle from the dropdown menu. Disabled functions are not available to edge functions.
- **Edit**: Click Edit to modify the code or description
- **Delete**: Click Delete to remove (cannot be undone)

---

## Secrets

Secrets provide secure, encrypted storage for sensitive values like API keys, tokens, and passwords. Edge functions can access secrets via the `secrets` object without exposing the actual values in your code.

### Prerequisites

Before using secrets, you must set the `SECRETS_ENCRYPTION_KEY` environment variable:

```bash
# Generate a secure 256-bit key
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Add to your environment
export SECRETS_ENCRYPTION_KEY="your-generated-key-here"
```

### Creating a Secret

1. Go to **Server Settings → Secrets**
2. Click **New Secret**
3. Configure:
   - **Name**: SCREAMING_SNAKE_CASE (e.g., `STRIPE_API_KEY`, `SENDGRID_TOKEN`)
   - **Value**: The secret value (will be encrypted)
   - **Description**: Optional description
4. Click **Create Secret**

### Using Secrets in Edge Functions

The `secrets` object is available in all edge functions:

```javascript
// Get a secret value
const apiKey = secrets.get('STRIPE_API_KEY');

// Check if a secret exists
if (secrets.has('STRIPE_API_KEY')) {
  // Use the secret
}

// List all available secret names (not values)
const names = secrets.list(); // ['STRIPE_API_KEY', 'SENDGRID_TOKEN', ...]
```

### Example: Stripe API Integration

```javascript
// POST /api/sites/{siteId}/functions/create-charge
const stripeKey = secrets.get('STRIPE_API_KEY');
if (!stripeKey) {
  Response.error('Stripe not configured', 500);
  return;
}

const { amount, currency, source } = request.body;
if (!amount || !source) {
  Response.error('Amount and source are required', 400);
  return;
}

const res = await fetch('https://api.stripe.com/v1/charges', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${stripeKey}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  },
  body: new URLSearchParams({
    amount: String(amount),
    currency: currency || 'usd',
    source,
  }),
});

const charge = await res.json();
Response.json({ charge });
```

### Secrets API Reference

| Method | Description |
|--------|-------------|
| `secrets.get(name)` | Get secret value, or `null` if not found |
| `secrets.has(name)` | Check if secret exists (returns boolean) |
| `secrets.list()` | Get array of all secret names (not values) |

### Security Notes

- **Encryption**: Secrets are encrypted using AES-256-GCM with unique IVs per secret
- **Never logged**: Secret values are never written to logs or exposed in API responses
- **Admin-only**: Only authenticated admins can create, view (metadata only), or delete secrets
- **Protected table**: The `secrets` table cannot be queried directly from edge functions
- **Key management**: The master encryption key must be stored securely as an environment variable

### Managing Secrets

- **Edit**: Click Edit in the dropdown to update the value or description (name cannot be changed)
- **Delete**: Click Delete to permanently remove (cannot be undone)
- **No value display**: Secret values are never displayed after creation for security

---

## SQL Editor

The SQL Editor allows direct SQL query execution against your site's database.

### Executing Queries

1. Go to **Server Settings → SQL**
2. Type your SQL query in the editor
3. Click **Execute** or press `Ctrl/Cmd + Enter`
4. View results in the table below

### Query History

The editor maintains a history of your last 20 queries (stored in browser localStorage).

Click **History** to view and re-run previous queries.

### Supported Operations

```sql
-- SELECT queries
SELECT * FROM products WHERE price > 100;
SELECT COUNT(*) FROM orders;

-- INSERT
INSERT INTO products (name, price) VALUES ('Widget', 29.99);

-- UPDATE
UPDATE products SET price = 24.99 WHERE id = 1;

-- DELETE
DELETE FROM products WHERE discontinued = 1;

-- CREATE TABLE
CREATE TABLE products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  price REAL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ALTER TABLE
ALTER TABLE products ADD COLUMN stock INTEGER DEFAULT 0;

-- DROP TABLE (use with caution!)
DROP TABLE old_products;
```

### Query Safety

- System tables are accessible (read-only for some operations)
- All queries are executed with full permissions - use caution!
- No automatic transaction management - consider wrapping related operations

---

## Schema Viewer

The Schema Viewer displays your database structure.

### Viewing Tables

1. Go to **Server Settings → Schema**
2. Click on a table name to expand and view columns
3. Each column shows: name, type, nullable, default value, primary key status

### System Tables

Toggle **Show System Tables** to view OSW Studio's internal tables:
- `site_info` - Site metadata
- `files` - File contents
- `file_tree_nodes` - File tree structure
- `pageviews` / `interactions` / `sessions` - Analytics data
- `edge_functions` - Function definitions
- `function_logs` - Execution logs

System tables are marked with a "(system)" label.

---

## Execution Logs

View function execution history in the **Logs** tab.

### Log Information

Each log entry shows:
- **Status**: Success (2xx), redirect (3xx), or error (4xx/5xx)
- **Function**: Function name
- **Method**: HTTP method used
- **Path**: Request path
- **Duration**: Execution time in milliseconds
- **Time**: Timestamp

### Managing Logs

- Click **Refresh** to load latest logs
- Click **Clear** to delete all logs (cannot be undone)
- Logs are limited to the most recent 200 entries

---

## Best Practices

### Function Design

1. **Keep functions focused** - One function per operation
2. **Validate input** - Check `request.body` and `request.query` before use
3. **Handle errors** - Return appropriate HTTP status codes
4. **Use meaningful names** - `create-order` not `func1`

### Database Usage

1. **Use parameterized queries** - Prevents SQL injection
   ```javascript
   // Good
   db.query('SELECT * FROM users WHERE id = ?', [userId]);

   // Bad - SQL injection risk!
   db.query(`SELECT * FROM users WHERE id = ${userId}`);
   ```

2. **Create indexes** for frequently queried columns:
   ```sql
   CREATE INDEX idx_orders_user_id ON orders(user_id);
   ```

3. **Limit result sets** to avoid memory issues:
   ```javascript
   db.query('SELECT * FROM products LIMIT 100');
   ```

### Performance

1. **Set appropriate timeouts** - Don't use 30s if 5s is sufficient
2. **Minimize external requests** - Each `fetch()` adds latency
3. **Cache when possible** - Store API responses in your database

---

## Troubleshooting

### Function Returns 404
- Check that the function is **enabled**
- Verify the function name in the URL is correct
- Ensure the site is published and has database enabled

### Function Returns 500
- Check the **Logs** tab for error details
- Verify your SQL queries are valid
- Ensure external APIs are responding

### Query Execution Failed
- Check SQL syntax
- Verify table and column names
- Look for constraint violations (unique, foreign key)

### Cannot Access Table
- System tables are protected in edge functions
- Use the SQL Editor for system table access

---

## API Reference

### Public Endpoints

| Method | URL | Description |
|--------|-----|-------------|
| * | `/api/sites/{siteId}/functions/{name}` | Invoke edge function |
| * | `/api/sites/{siteId}/functions/{name}/*` | Invoke with path params |

### Admin Endpoints (Requires Authentication)

| Method | URL | Description |
|--------|-----|-------------|
| GET | `/api/admin/sites/{siteId}/functions` | List edge functions |
| POST | `/api/admin/sites/{siteId}/functions` | Create edge function |
| GET | `/api/admin/sites/{siteId}/functions/{id}` | Get edge function |
| PUT | `/api/admin/sites/{siteId}/functions/{id}` | Update edge function |
| DELETE | `/api/admin/sites/{siteId}/functions/{id}` | Delete edge function |
| GET | `/api/admin/sites/{siteId}/server-functions` | List server functions |
| POST | `/api/admin/sites/{siteId}/server-functions` | Create server function |
| GET | `/api/admin/sites/{siteId}/server-functions/{id}` | Get server function |
| PUT | `/api/admin/sites/{siteId}/server-functions/{id}` | Update server function |
| DELETE | `/api/admin/sites/{siteId}/server-functions/{id}` | Delete server function |
| GET | `/api/admin/sites/{siteId}/secrets` | List secrets (metadata only) |
| POST | `/api/admin/sites/{siteId}/secrets` | Create secret |
| GET | `/api/admin/sites/{siteId}/secrets/{id}` | Get secret (metadata only) |
| PUT | `/api/admin/sites/{siteId}/secrets/{id}` | Update secret |
| DELETE | `/api/admin/sites/{siteId}/secrets/{id}` | Delete secret |
| GET | `/api/admin/sites/{siteId}/database/schema` | Get schema |
| POST | `/api/admin/sites/{siteId}/database/query` | Execute SQL |
| GET | `/api/admin/sites/{siteId}/database/logs` | Get logs |
| DELETE | `/api/admin/sites/{siteId}/database/logs` | Clear logs |

---

## AI Integration

> ⚠️ **Experimental Feature**: Server Context Integration is experimental and may change in future versions. Some features may not work as expected.

OSW Studio's AI assistant can understand and work with your server features when you select a site in the workspace.

### How It Works

1. **Select a Site** - Use the site selector dropdown in the workspace header
2. **Server Context Loaded** - OSW Studio fetches the site's server features
3. **AI Awareness** - The AI receives information about available:
   - Edge functions (endpoints, methods)
   - Database schema (tables, columns)
   - Server functions (helpers)
   - Secrets (names only, not values)

### The `/.server/` Folder

When a site is selected, a hidden `/.server/` folder appears in the file explorer containing:

| File | Contents |
|------|----------|
| `edge-functions.json` | List of edge function endpoints |
| `database-schema.json` | Tables, columns, and types |
| `server-functions.json` | Available helper functions |
| `secrets.json` | Secret names (not values) |

These files are **read-only** and **transient** - they reflect the current site's state but are not saved with the project.

### Using AI with Server Features

**Example prompts:**

```
What tables are in the database?
```

```
Create an edge function to list all products
```

```
I need an endpoint that validates API keys using the STRIPE_KEY secret
```

```
Help me design a schema for a blog with posts and comments
```

The AI can:
- Read and explain your current schema
- Suggest edge function implementations
- Reference available secrets by name
- Help design database structures
- Debug function issues

### Viewing Hidden Files

To see the `/.server/` folder:
1. Right-click in the File Explorer
2. Select **Show Hidden Files**
3. Look for the folder with the orange server icon

See also: **[Server Mode → Server Context Integration](?doc=server-mode#server-context-integration)**
