/**
 * Centralized registry for built-in templates
 * This is the single source of truth for all built-in templates in the system
 */

export interface BuiltInTemplateMetadata {
  id: string;
  name: string;
  description: string;
  isBuiltIn: true;
  updatedAt: Date;
  templateType?: 'project' | 'site';
  siteFeatures?: import('../types').SiteTemplateFeatures;
  metadata?: {
    author?: string;
    tags?: string[];
  };
}

/**
 * Registry of all built-in templates
 * Add new templates here to make them available throughout the application
 */
export const BUILT_IN_TEMPLATES: BuiltInTemplateMetadata[] = [
  {
    id: 'blank',
    name: 'Blank',
    description: 'Minimal starting template with basic HTML/CSS/JS structure',
    isBuiltIn: true,
    updatedAt: new Date('2025-01-01T00:00:00Z'),
    metadata: {
      author: 'OSW Studio',
      tags: ['starter', 'basic']
    }
  },
  {
    id: 'demo',
    name: 'Example Studios',
    description: 'Multi-page agency portfolio showcasing modern web development',
    isBuiltIn: true,
    updatedAt: new Date('2025-01-01T00:00:00Z'),
    metadata: {
      author: 'OSW Studio',
      tags: ['portfolio', 'multi-page', 'example']
    }
  },
  {
    id: 'contact-landing',
    name: 'Landing Page with Contact Form',
    description: 'Professional landing page with a working contact form powered by Resend',
    isBuiltIn: true,
    updatedAt: new Date('2025-01-01T00:00:00Z'),
    templateType: 'site',
    siteFeatures: {
      edgeFunctions: [
        {
          name: 'submit-contact',
          method: 'POST',
          code: `const body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body;\nconst { name, email, subject, message } = body;\nif (!name || !email || !message) { Response.json({ error: 'Missing required fields' }, 400); return; }\ndb.run('INSERT INTO messages (name, email, subject, message) VALUES (?, ?, ?, ?)', [name, email, subject || null, message]);\n\n// Optional: send email via Resend if API key is configured\nconst apiKey = secrets.has('RESEND_API_KEY') ? secrets.get('RESEND_API_KEY') : null;\nconst notifyEmail = secrets.has('NOTIFY_EMAIL') ? secrets.get('NOTIFY_EMAIL') : null;\nif (apiKey && notifyEmail) {\n  try {\n    await fetch('https://api.resend.com/emails', {\n      method: 'POST',\n      headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },\n      body: JSON.stringify({\n        from: 'Contact Form <onboarding@resend.dev>',\n        to: [notifyEmail],\n        subject: 'New contact: ' + (subject || 'No subject'),\n        html: '<p><strong>From:</strong> ' + name + ' (' + email + ')</p><p>' + message + '</p>'\n      })\n    });\n  } catch (e) { console.error('Email send failed:', e); }\n}\n\nResponse.json({ success: true });`,
          description: 'Handle contact form submission — saves to DB and optionally emails via Resend',
          enabled: true,
          timeoutMs: 10000,
        },
        {
          name: 'list-messages',
          method: 'GET',
          code: `const messages = db.query('SELECT id, name, email, subject, message, created_at FROM messages ORDER BY created_at DESC LIMIT 50');\nResponse.json({ messages });`,
          description: 'List recent contact form submissions (admin use)',
          enabled: true,
          timeoutMs: 5000,
        },
      ],
      serverFunctions: [],
      secrets: [
        { name: 'RESEND_API_KEY', description: 'Resend API key for sending email notifications (get one at resend.com)' },
        { name: 'NOTIFY_EMAIL', description: 'Email address to receive contact form notifications' },
      ],
      databaseSchema: `CREATE TABLE IF NOT EXISTS messages (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  name TEXT NOT NULL,\n  email TEXT NOT NULL,\n  subject TEXT,\n  message TEXT NOT NULL,\n  created_at DATETIME DEFAULT CURRENT_TIMESTAMP\n);`,
    },
    metadata: {
      author: 'OSW Studio',
      tags: ['landing-page', 'contact-form', 'server-mode'],
    },
  },
  {
    id: 'blog',
    name: 'Blog with Comments',
    description: 'Blog platform with posts, user auth, and moderated comments',
    isBuiltIn: true,
    updatedAt: new Date('2025-01-01T00:00:00Z'),
    templateType: 'site',
    siteFeatures: {
      edgeFunctions: [
        {
          name: 'get-comments',
          method: 'GET',
          code: `const slug = request.query && request.query.slug ? request.query.slug : null;\nif (!slug) { Response.json({ error: 'Missing slug' }, 400); return; }\nconst comments = db.query('SELECT id, author, content, created_at FROM comments WHERE post_slug = ? AND approved = 1 ORDER BY created_at ASC', [slug]);\nResponse.json({ comments });`,
          description: 'Get approved comments for a blog post by slug',
          enabled: true,
          timeoutMs: 5000,
        },
        {
          name: 'add-comment',
          method: 'POST',
          code: `// Requires authenticated session via cookie\nconst cookie = request.headers && request.headers.cookie ? request.headers.cookie : '';\nconst tokenMatch = cookie.match(/blog_session=([^;]+)/);\nif (!tokenMatch) { Response.json({ error: 'Not authenticated' }, 401); return; }\nconst sessions = db.query('SELECT s.*, u.display_name FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.token = ? AND s.expires_at > datetime(\\'now\\')', [tokenMatch[1]]);\nif (sessions.length === 0) { Response.json({ error: 'Invalid or expired session' }, 401); return; }\nconst body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body;\nconst { slug, content } = body;\nif (!slug || !content) { Response.json({ error: 'Missing required fields' }, 400); return; }\ndb.run('INSERT INTO comments (post_slug, author, content, approved) VALUES (?, ?, ?, ?)', [slug, sessions[0].display_name, content, 0]);\nResponse.json({ success: true, message: 'Comment submitted for moderation' });`,
          description: 'Submit a comment (requires authenticated session)',
          enabled: true,
          timeoutMs: 5000,
        },
        {
          name: 'register',
          method: 'POST',
          code: `const body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body;\nconst { username, password, displayName } = body;\nif (!username || username.length < 3) { Response.json({ error: 'Username must be at least 3 characters' }, 400); return; }\nif (!password || password.length < 6) { Response.json({ error: 'Password must be at least 6 characters' }, 400); return; }\nconst display = displayName || username;\nconst existing = db.query('SELECT id FROM users WHERE username = ?', [username.toLowerCase()]);\nif (existing.length > 0) { Response.json({ error: 'Username already taken' }, 409); return; }\nconst salt = crypto.randomUUID();\nconst passwordHash = crypto.sha256(salt + ':' + password);\nconst result = db.run('INSERT INTO users (username, password_hash, salt, display_name) VALUES (?, ?, ?, ?)', [username.toLowerCase(), passwordHash, salt, display]);\nconst userId = result.lastInsertRowid;\nconst token = crypto.randomUUID();\ndb.run('INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, datetime(\\'now\\', \\'+30 days\\'))', [userId, token]);\nResponse.json({ success: true, user: { username: username.toLowerCase(), displayName: display } }, 200, { 'Set-Cookie': 'blog_session=' + token + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000' });`,
          description: 'Register a new user account',
          enabled: true,
          timeoutMs: 5000,
        },
        {
          name: 'login',
          method: 'POST',
          code: `const body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body;\nconst { username, password } = body;\nif (!username || !password) { Response.json({ error: 'Username and password are required' }, 400); return; }\nconst users = db.query('SELECT * FROM users WHERE username = ?', [username.toLowerCase()]);\nif (users.length === 0) { Response.json({ error: 'Invalid credentials' }, 401); return; }\nconst user = users[0];\nconst hash = crypto.sha256(user.salt + ':' + password);\nif (hash !== user.password_hash) { Response.json({ error: 'Invalid credentials' }, 401); return; }\n// Clean up expired sessions for this user\ndb.run('DELETE FROM sessions WHERE user_id = ? AND expires_at < datetime(\\'now\\')', [user.id]);\nconst token = crypto.randomUUID();\ndb.run('INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, datetime(\\'now\\', \\'+30 days\\'))', [user.id, token]);\nResponse.json({ success: true, user: { username: user.username, displayName: user.display_name } }, 200, { 'Set-Cookie': 'blog_session=' + token + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000' });`,
          description: 'Log in with username and password',
          enabled: true,
          timeoutMs: 5000,
        },
        {
          name: 'logout',
          method: 'POST',
          code: `const cookie = request.headers && request.headers.cookie ? request.headers.cookie : '';\nconst tokenMatch = cookie.match(/blog_session=([^;]+)/);\nif (tokenMatch) { db.run('DELETE FROM sessions WHERE token = ?', [tokenMatch[1]]); }\nResponse.json({ success: true }, 200, { 'Set-Cookie': 'blog_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0' });`,
          description: 'Log out and clear session',
          enabled: true,
          timeoutMs: 5000,
        },
        {
          name: 'auth-status',
          method: 'GET',
          code: `const cookie = request.headers && request.headers.cookie ? request.headers.cookie : '';\nconst tokenMatch = cookie.match(/blog_session=([^;]+)/);\nif (!tokenMatch) { Response.json({ authenticated: false }); return; }\nconst sessions = db.query('SELECT s.*, u.username, u.display_name FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.token = ? AND s.expires_at > datetime(\\'now\\')', [tokenMatch[1]]);\nif (sessions.length === 0) { Response.json({ authenticated: false }); return; }\nResponse.json({ authenticated: true, user: { username: sessions[0].username, displayName: sessions[0].display_name } });`,
          description: 'Check authentication status from session cookie',
          enabled: true,
          timeoutMs: 5000,
        },
      ],
      serverFunctions: [],
      secrets: [],
      databaseSchema: `CREATE TABLE IF NOT EXISTS comments (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  post_slug TEXT NOT NULL,\n  author TEXT NOT NULL,\n  content TEXT NOT NULL,\n  approved INTEGER DEFAULT 0,\n  created_at DATETIME DEFAULT CURRENT_TIMESTAMP\n);\n\nCREATE TABLE IF NOT EXISTS users (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  username TEXT NOT NULL UNIQUE,\n  password_hash TEXT NOT NULL,\n  salt TEXT NOT NULL,\n  display_name TEXT NOT NULL,\n  created_at DATETIME DEFAULT CURRENT_TIMESTAMP\n);\n\nCREATE TABLE IF NOT EXISTS sessions (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  user_id INTEGER NOT NULL REFERENCES users(id),\n  token TEXT NOT NULL UNIQUE,\n  expires_at DATETIME NOT NULL,\n  created_at DATETIME DEFAULT CURRENT_TIMESTAMP\n);`,
    },
    metadata: {
      author: 'OSW Studio',
      tags: ['blog', 'comments', 'auth', 'server-mode'],
    },
  },
];

/**
 * Get a built-in template by ID
 */
export function getBuiltInTemplate(id: string): BuiltInTemplateMetadata | undefined {
  return BUILT_IN_TEMPLATES.find(t => t.id === id);
}

/**
 * Get all built-in template IDs
 */
export function getBuiltInTemplateIds(): string[] {
  return BUILT_IN_TEMPLATES.map(t => t.id);
}
