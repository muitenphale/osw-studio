import { ProjectTemplate } from '../../project-templates';
import { WEBSITE_DOMAIN_PROMPT } from '@/lib/llm/prompts/website';

export const BLOG_PROJECT_TEMPLATE: ProjectTemplate = {
  name: 'Blog with Comments',
  description: 'Blog platform with posts, comments, and content management',
  directories: ['/styles', '/scripts', '/blog', '/templates'],
  files: [
    {
      path: '/data.json',
      content: `{
  "siteName": "My Blog",
  "tagline": "Thoughts, tutorials, and stories.",
  "navigation": [
    { "title": "Home", "url": "/" }
  ],
  "posts": [
    {
      "title": "Hello World",
      "slug": "hello-world",
      "excerpt": "Welcome to my blog! This is the first post to get you started.",
      "author": "Admin",
      "date": "January 15, 2025"
    },
    {
      "title": "Getting Started with OSW Studio",
      "slug": "getting-started",
      "excerpt": "Learn how to build and publish websites using OSW Studio's AI-powered development environment.",
      "author": "Admin",
      "date": "January 10, 2025"
    }
  ]
}`
    },
    {
      path: '/index.html',
      content: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{siteName}}</title>
    <link rel="stylesheet" href="/styles/style.css">
</head>
<body>
    {{> navigation}}

    <main class="container">
        <section class="hero">
            <h2>{{siteName}}</h2>
            <p>{{tagline}}</p>
        </section>

        <section class="posts">
            {{#each posts}}
            <article class="post-card">
                <time>{{date}}</time>
                <h3><a href="/blog/{{slug}}.html">{{title}}</a></h3>
                <p>{{excerpt}}</p>
                <span class="author">by {{author}}</span>
            </article>
            {{/each}}
        </section>
    </main>

    {{> footer}}
</body>
</html>`
    },
    {
      path: '/blog/hello-world.html',
      content: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Hello World - {{siteName}}</title>
    <link rel="stylesheet" href="/styles/style.css">
</head>
<body>
    {{> navigation}}

    <main class="container">
        <article class="post-full">
            <time>January 15, 2025</time>
            <h2>Hello World</h2>
            <div class="post-meta">
                <span class="author">by Admin</span>
            </div>
            <div class="post-body">
                <p>Welcome to my blog! This is a sample post to help you get started.</p>
                <p>In <strong>Server Mode</strong>, comments are stored in a SQLite database and moderated before display. Users can register, log in, and leave comments on any post.</p>
                <p>In <strong>Browser Mode</strong>, comments are stored in your browser's localStorage — great for testing and development.</p>
                <h3>What You Can Do</h3>
                <ul>
                    <li>Create new blog posts as HTML files in the <code>/blog/</code> directory</li>
                    <li>Update the post index in <code>/data.json</code></li>
                    <li>Customize the design in <code>/styles/style.css</code></li>
                    <li>Add dynamic features in Server Mode</li>
                    <li>Export and deploy anywhere</li>
                </ul>
                <p>Each blog post is a standalone HTML file that uses Handlebars partials for the navigation, footer, and comments section — keeping things consistent and easy to maintain.</p>
            </div>
        </article>

        {{> comments}}
    </main>

    {{> footer}}

    <script src="/scripts/main.js"></script>
</body>
</html>`
    },
    {
      path: '/blog/getting-started.html',
      content: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Getting Started with OSW Studio - {{siteName}}</title>
    <link rel="stylesheet" href="/styles/style.css">
</head>
<body>
    {{> navigation}}

    <main class="container">
        <article class="post-full">
            <time>January 10, 2025</time>
            <h2>Getting Started with OSW Studio</h2>
            <div class="post-meta">
                <span class="author">by Admin</span>
            </div>
            <div class="post-body">
                <p>OSW Studio makes it easy to build and publish websites using AI. Here\u2019s how to get started.</p>
                <h3>Step 1: Create a Project</h3>
                <p>Open the Projects tab and click <strong>New Project</strong>. Choose a template or start from scratch.</p>
                <h3>Step 2: Chat with AI</h3>
                <p>Describe what you want to build. The AI will create files, write code, and set up your project structure.</p>
                <h3>Step 3: Preview &amp; Publish</h3>
                <p>Use the live preview to see your changes in real time. In Server Mode, publish your site with one click and your blog is live!</p>
                <h3>Adding New Posts</h3>
                <p>To add a new blog post:</p>
                <ol>
                    <li>Create a new HTML file in the <code>/blog/</code> directory (e.g. <code>/blog/my-new-post.html</code>)</li>
                    <li>Use the same structure as existing posts — include the navigation, comments, and footer partials</li>
                    <li>Add an entry to the <code>posts</code> array in <code>/data.json</code> with the title, slug, excerpt, author, and date</li>
                </ol>
                <p>Or simply ask the AI to create a new post for you!</p>
            </div>
        </article>

        {{> comments}}
    </main>

    {{> footer}}

    <script src="/scripts/main.js"></script>
</body>
</html>`
    },
    {
      path: '/templates/navigation.hbs',
      content: `<header class="site-header">
    <div class="container header-inner">
        <h1 class="logo"><a href="/">{{siteName}}</a></h1>
        <nav>
            {{#each navigation}}
            <a href="{{url}}">{{title}}</a>
            {{/each}}
        </nav>
    </div>
</header>`
    },
    {
      path: '/templates/footer.hbs',
      content: `<footer class="site-footer">
    <div class="container">
        <p>&copy; 2025 {{siteName}}. Built with OSW Studio.</p>
    </div>
</footer>`
    },
    {
      path: '/templates/comments.hbs',
      content: `<section class="comments-section" id="comments-section">
    <button id="show-comments-btn" class="btn btn-outline">Show Comments</button>
    <div id="comments-area" style="display:none;">
        <h3>Comments</h3>
        <div id="comments-list" class="comments-list"></div>
        <div id="auth-area"></div>
    </div>
</section>`
    },
    {
      path: '/styles/style.css',
      content: `/* Blog Styles */
*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: Georgia, 'Times New Roman', serif;
  background: #fafaf9;
  color: #292524;
  line-height: 1.8;
}

.container {
  max-width: 800px;
  margin: 0 auto;
  padding: 0 1.5rem;
}

/* Header */
.site-header {
  background: #ffffff;
  border-bottom: 1px solid #e7e5e4;
  padding: 1rem 0;
}

.header-inner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  max-width: 800px;
  margin: 0 auto;
  padding: 0 1.5rem;
}

.logo {
  font-size: 1.5rem;
  font-weight: 700;
  color: #1c1917;
  font-family: system-ui, sans-serif;
}

.logo a {
  text-decoration: none;
  color: inherit;
}

nav {
  display: flex;
  gap: 1.5rem;
  font-family: system-ui, sans-serif;
}

nav a {
  text-decoration: none;
  color: #78716c;
  font-size: 0.875rem;
  font-weight: 500;
  transition: color 0.2s;
}

nav a:hover,
nav a.active {
  color: #b45309;
}

/* Hero */
.hero {
  text-align: center;
  padding: 3rem 0 2rem;
}

.hero h2 {
  font-size: 2.25rem;
  margin-bottom: 0.5rem;
  color: #1c1917;
}

.hero p {
  color: #78716c;
  font-size: 1.125rem;
}

/* Post Cards */
.posts {
  padding: 1rem 0 4rem;
}

.post-card {
  padding: 2rem 0;
  border-bottom: 1px solid #e7e5e4;
}

.post-card time {
  font-family: system-ui, sans-serif;
  font-size: 0.8125rem;
  color: #a8a29e;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.post-card h3 {
  font-size: 1.5rem;
  margin: 0.5rem 0;
}

.post-card h3 a {
  text-decoration: none;
  color: #1c1917;
  transition: color 0.2s;
}

.post-card h3 a:hover {
  color: #b45309;
}

.post-card p {
  color: #57534e;
  margin-bottom: 0.5rem;
}

.author {
  font-family: system-ui, sans-serif;
  font-size: 0.8125rem;
  color: #a8a29e;
}

/* Full Post */
.post-full {
  padding: 2rem 0;
}

.post-full time {
  font-family: system-ui, sans-serif;
  font-size: 0.8125rem;
  color: #a8a29e;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.post-full h2 {
  font-size: 2rem;
  margin: 0.5rem 0 0.25rem;
}

.post-meta {
  margin-bottom: 2rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid #e7e5e4;
}

.post-body p {
  margin-bottom: 1.25rem;
  color: #44403c;
}

.post-body h3 {
  margin: 2rem 0 1rem;
  font-size: 1.375rem;
}

.post-body ul,
.post-body ol {
  margin-bottom: 1.25rem;
  padding-left: 1.5rem;
}

.post-body li {
  margin-bottom: 0.5rem;
  color: #44403c;
}

.post-body code {
  background: #f5f5f4;
  padding: 0.125rem 0.375rem;
  border-radius: 4px;
  font-size: 0.875rem;
}

/* Comments */
.comments-section {
  border-top: 2px solid #e7e5e4;
  padding: 2rem 0 4rem;
  margin-top: 2rem;
}

.comments-section h3 {
  font-size: 1.375rem;
  margin-bottom: 1.5rem;
  font-family: system-ui, sans-serif;
}

.no-comments {
  text-align: center;
  padding: 2rem;
  color: #a8a29e;
  font-style: italic;
}

.comment {
  padding: 1rem 0;
  border-bottom: 1px solid #f5f5f4;
}

.comment.pending {
  opacity: 0.7;
  font-style: italic;
}

.comment-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.5rem;
  font-family: system-ui, sans-serif;
  font-size: 0.875rem;
}

.comment-author {
  font-weight: 600;
  color: #1c1917;
}

.comment-date {
  color: #a8a29e;
}

.comment-body {
  color: #57534e;
}

.comment-pending-label {
  font-size: 0.75rem;
  color: #b45309;
  margin-left: 0.5rem;
  font-weight: 400;
}

/* Comment Form */
.comment-form {
  margin-top: 2rem;
  padding: 1.5rem;
  background: #ffffff;
  border: 1px solid #e7e5e4;
  border-radius: 8px;
}

.comment-form h4 {
  font-family: system-ui, sans-serif;
  margin-bottom: 1rem;
}

.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  font-family: system-ui, sans-serif;
  font-size: 0.875rem;
  font-weight: 500;
  margin-bottom: 0.375rem;
  color: #44403c;
}

.form-group input,
.form-group textarea {
  width: 100%;
  padding: 0.625rem;
  border: 1px solid #d6d3d1;
  border-radius: 6px;
  font-family: inherit;
  font-size: 0.9375rem;
  line-height: 1.6;
  transition: border-color 0.2s;
}

.form-group input:focus,
.form-group textarea:focus {
  outline: none;
  border-color: #b45309;
}

/* Buttons */
.btn {
  display: inline-block;
  padding: 0.625rem 1.25rem;
  border: none;
  border-radius: 6px;
  font-family: system-ui, sans-serif;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s;
}

.btn-primary {
  background: #b45309;
  color: white;
}

.btn-primary:hover {
  background: #92400e;
}

.btn-outline {
  background: transparent;
  border: 1px solid #d6d3d1;
  color: #57534e;
}

.btn-outline:hover {
  border-color: #b45309;
  color: #b45309;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Auth Bar */
.auth-bar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
  padding: 0.625rem 1rem;
  background: #f5f5f4;
  border-radius: 6px;
  font-family: system-ui, sans-serif;
  font-size: 0.875rem;
  color: #57534e;
}

.auth-bar strong {
  color: #1c1917;
}

.auth-bar a {
  color: #b45309;
  text-decoration: none;
  cursor: pointer;
}

.auth-bar a:hover {
  text-decoration: underline;
}

/* Auth Form (login/register) */
.auth-form {
  margin-top: 2rem;
  padding: 1.5rem;
  background: #ffffff;
  border: 1px solid #e7e5e4;
  border-radius: 8px;
}

.auth-form h4 {
  font-family: system-ui, sans-serif;
  margin-bottom: 1rem;
}

/* Tab Toggle */
.tab-toggle {
  display: flex;
  gap: 0;
  margin-bottom: 1.25rem;
  border: 1px solid #e7e5e4;
  border-radius: 6px;
  overflow: hidden;
}

.tab-toggle button {
  flex: 1;
  padding: 0.5rem 1rem;
  border: none;
  background: #fafaf9;
  font-family: system-ui, sans-serif;
  font-size: 0.875rem;
  font-weight: 500;
  color: #78716c;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
}

.tab-toggle button.active {
  background: #b45309;
  color: white;
}

.tab-toggle button:not(.active):hover {
  background: #f5f5f4;
}

/* Toast */
.toast {
  position: fixed;
  bottom: 1.5rem;
  right: 1.5rem;
  padding: 0.75rem 1.25rem;
  border-radius: 8px;
  color: white;
  font-family: system-ui, sans-serif;
  font-size: 0.875rem;
  font-weight: 500;
  z-index: 1000;
  opacity: 0;
  transform: translateY(10px);
  transition: opacity 0.3s, transform 0.3s;
}

.toast.show {
  opacity: 1;
  transform: translateY(0);
}

.toast-success { background: #16a34a; }
.toast-error { background: #dc2626; }
.toast-info { background: #b45309; }

/* Footer */
.site-footer {
  background: #f5f5f4;
  padding: 2rem 0;
  text-align: center;
  color: #a8a29e;
  font-family: system-ui, sans-serif;
  font-size: 0.875rem;
  margin-top: 4rem;
}
`
    },
    {
      path: '/scripts/main.js',
      content: `// Blog Comments & Auth — works in both Browser Mode and Server Mode
// Server Mode: user auth + moderated comments via edge functions
// Browser Mode: localStorage comments with simple name field (no auth)

let serverMode = false;
let commentsLoaded = false;

// Derive slug from current URL: /blog/hello-world.html → hello-world
function getSlug() {
  const path = window.location.pathname;
  const match = path.match(/\\/blog\\/([^\\/]+)\\.html$/);
  return match ? decodeURIComponent(match[1]) : null;
}

// --- Show Comments (lazy load on button click) ---

async function showComments() {
  if (commentsLoaded) return;
  commentsLoaded = true;

  const btn = document.getElementById('show-comments-btn');
  if (btn) btn.textContent = 'Loading...';

  const area = document.getElementById('comments-area');
  const slug = getSlug();
  if (!slug) return;

  // Detect Server Mode by checking auth-status endpoint
  try {
    const authRes = await fetch('/auth-status');
    if (authRes.ok) {
      const authData = await authRes.json();
      serverMode = true;

      // Fetch comments
      const commentsRes = await fetch('/get-comments?slug=' + encodeURIComponent(slug));
      const commentsData = commentsRes.ok ? await commentsRes.json() : { comments: [] };

      renderComments(commentsData.comments || []);
      renderAuthArea(authData.authenticated ? authData.user : null);
    } else {
      throw new Error('not server mode');
    }
  } catch {
    // Browser Mode — localStorage comments, no auth
    renderComments(getLocalComments(slug));
    renderBrowserCommentForm();
  }

  if (btn) btn.style.display = 'none';
  if (area) area.style.display = 'block';
}

// --- Comments ---

function renderComments(comments) {
  const container = document.getElementById('comments-list');
  if (!container) return;

  if (comments.length === 0) {
    container.innerHTML = '<p class="no-comments">No comments yet. Be the first to share your thoughts!</p>';
    return;
  }

  container.innerHTML = comments.map(function(c) {
    return '<div class="comment' + (c.pending ? ' pending' : '') + '">'
      + '<div class="comment-header">'
      + '<span class="comment-author">' + esc(c.author) + (c.pending ? '<span class="comment-pending-label">(pending moderation)</span>' : '') + '</span>'
      + '<span class="comment-date">' + formatDate(c.created_at) + '</span>'
      + '</div>'
      + '<div class="comment-body">' + esc(c.content) + '</div>'
      + '</div>';
  }).join('');
}

function getLocalComments(slug) {
  try {
    var all = JSON.parse(localStorage.getItem('blog-comments') || '{}');
    return all[slug] || [];
  } catch {
    return [];
  }
}

function saveLocalComment(slug, comment) {
  try {
    var all = JSON.parse(localStorage.getItem('blog-comments') || '{}');
    if (!all[slug]) all[slug] = [];
    all[slug].push(comment);
    localStorage.setItem('blog-comments', JSON.stringify(all));
  } catch {
    // Ignore storage errors
  }
}

// --- Auth Area (Server Mode) ---

function renderAuthArea(user) {
  var container = document.getElementById('auth-area');
  if (!container) return;

  if (user) {
    // Logged in — show auth bar + comment form
    container.innerHTML = '<div class="auth-bar">'
      + 'Logged in as <strong>' + esc(user.displayName) + '</strong> \\u00b7 <a id="logout-link">Logout</a>'
      + '</div>'
      + '<form id="comment-form" class="comment-form">'
      + '<h4>Leave a Comment</h4>'
      + '<div class="form-group">'
      + '<label for="comment-content">Comment *</label>'
      + '<textarea id="comment-content" name="content" required placeholder="Share your thoughts..." rows="4"></textarea>'
      + '</div>'
      + '<button type="submit" class="btn btn-primary">Submit Comment</button>'
      + '</form>';
    document.getElementById('logout-link').addEventListener('click', handleLogout);
    document.getElementById('comment-form').addEventListener('submit', handleCommentSubmit);
  } else {
    // Not logged in — show login/register tabbed form
    container.innerHTML = '<div class="auth-form">'
      + '<div class="tab-toggle">'
      + '<button id="tab-login" class="active">Login</button>'
      + '<button id="tab-register">Register</button>'
      + '</div>'
      + '<form id="login-form">'
      + '<div class="form-group"><label for="login-username">Username</label>'
      + '<input type="text" id="login-username" required placeholder="Your username" autocomplete="username"></div>'
      + '<div class="form-group"><label for="login-password">Password</label>'
      + '<input type="password" id="login-password" required placeholder="Your password" autocomplete="current-password"></div>'
      + '<button type="submit" class="btn btn-primary">Login</button>'
      + '</form>'
      + '<form id="register-form" style="display:none;">'
      + '<div class="form-group"><label for="reg-username">Username (3+ chars)</label>'
      + '<input type="text" id="reg-username" required minlength="3" placeholder="Choose a username" autocomplete="username"></div>'
      + '<div class="form-group"><label for="reg-display">Display Name</label>'
      + '<input type="text" id="reg-display" placeholder="How your name appears on comments"></div>'
      + '<div class="form-group"><label for="reg-password">Password (6+ chars)</label>'
      + '<input type="password" id="reg-password" required minlength="6" placeholder="Choose a password" autocomplete="new-password"></div>'
      + '<button type="submit" class="btn btn-primary">Register</button>'
      + '</form>'
      + '</div>';

    // Tab toggle
    var tabLogin = document.getElementById('tab-login');
    var tabRegister = document.getElementById('tab-register');
    tabLogin.addEventListener('click', function() {
      tabLogin.classList.add('active');
      tabRegister.classList.remove('active');
      document.getElementById('login-form').style.display = '';
      document.getElementById('register-form').style.display = 'none';
    });
    tabRegister.addEventListener('click', function() {
      tabRegister.classList.add('active');
      tabLogin.classList.remove('active');
      document.getElementById('register-form').style.display = '';
      document.getElementById('login-form').style.display = 'none';
    });

    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('register-form').addEventListener('submit', handleRegister);
  }
}

// --- Browser Mode Comment Form ---

function renderBrowserCommentForm() {
  var container = document.getElementById('auth-area');
  if (!container) return;

  container.innerHTML = '<form id="comment-form" class="comment-form">'
    + '<h4>Leave a Comment</h4>'
    + '<div class="form-group"><label for="comment-author">Name *</label>'
    + '<input type="text" id="comment-author" name="author" required placeholder="Your name"></div>'
    + '<div class="form-group"><label for="comment-content">Comment *</label>'
    + '<textarea id="comment-content" name="content" required placeholder="Share your thoughts..." rows="4"></textarea></div>'
    + '<button type="submit" class="btn btn-primary">Submit Comment</button>'
    + '</form>';
  document.getElementById('comment-form').addEventListener('submit', handleBrowserComment);
}

function handleBrowserComment(e) {
  e.preventDefault();
  var slug = getSlug();
  if (!slug) return;

  var author = document.getElementById('comment-author').value.trim();
  var content = document.getElementById('comment-content').value.trim();
  if (!author || !content) { showToast('Please fill in your name and comment.', 'error'); return; }

  var comment = { author: author, content: content, created_at: new Date().toISOString(), pending: false };
  saveLocalComment(slug, comment);
  appendCommentToUI(comment);
  showToast('Comment added!', 'success');
  e.target.reset();
}

// --- Auth Handlers (Server Mode) ---

async function handleLogin(e) {
  e.preventDefault();
  var username = document.getElementById('login-username').value.trim();
  var password = document.getElementById('login-password').value;
  if (!username || !password) return;

  var btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true; btn.textContent = 'Logging in...';

  try {
    var res = await fetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username, password: password }),
    });
    var data = await res.json();
    if (!res.ok) { showToast(data.error || 'Login failed', 'error'); btn.disabled = false; btn.textContent = 'Login'; return; }
    showToast('Logged in!', 'success');
    renderAuthArea(data.user);
  } catch {
    showToast('Login failed. Please try again.', 'error');
    btn.disabled = false; btn.textContent = 'Login';
  }
}

async function handleRegister(e) {
  e.preventDefault();
  var username = document.getElementById('reg-username').value.trim();
  var displayName = document.getElementById('reg-display').value.trim();
  var password = document.getElementById('reg-password').value;
  if (!username || !password) return;

  var btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true; btn.textContent = 'Registering...';

  try {
    var res = await fetch('/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username, password: password, displayName: displayName || undefined }),
    });
    var data = await res.json();
    if (!res.ok) { showToast(data.error || 'Registration failed', 'error'); btn.disabled = false; btn.textContent = 'Register'; return; }
    showToast('Account created!', 'success');
    renderAuthArea(data.user);
  } catch {
    showToast('Registration failed. Please try again.', 'error');
    btn.disabled = false; btn.textContent = 'Register';
  }
}

async function handleLogout() {
  try {
    await fetch('/logout', { method: 'POST' });
  } catch { /* ignore */ }
  showToast('Logged out.', 'info');
  renderAuthArea(null);
}

// --- Comment Submit (Server Mode — authenticated) ---

async function handleCommentSubmit(e) {
  e.preventDefault();
  var slug = getSlug();
  if (!slug) return;

  var contentEl = document.getElementById('comment-content');
  var content = contentEl.value.trim();
  if (!content) { showToast('Please write a comment.', 'error'); return; }

  var submitBtn = e.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true; submitBtn.textContent = 'Submitting...';

  try {
    var res = await fetch('/add-comment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: slug, content: content }),
    });
    var data = await res.json();
    if (!res.ok) {
      if (res.status === 401) {
        showToast('Session expired. Please log in again.', 'error');
        renderAuthArea(null);
        return;
      }
      throw new Error(data.error);
    }
    showToast('Comment submitted for moderation.', 'success');
    appendCommentToUI({ author: 'You', content: content, created_at: new Date().toISOString(), pending: true });
    contentEl.value = '';
  } catch {
    showToast('Failed to submit comment. Please try again.', 'error');
  }

  submitBtn.disabled = false; submitBtn.textContent = 'Submit Comment';
}

function appendCommentToUI(comment) {
  var container = document.getElementById('comments-list');
  if (!container) return;

  var noComments = container.querySelector('.no-comments');
  if (noComments) noComments.remove();

  var div = document.createElement('div');
  div.className = 'comment' + (comment.pending ? ' pending' : '');
  div.innerHTML = '<div class="comment-header">'
    + '<span class="comment-author">' + esc(comment.author) + (comment.pending ? '<span class="comment-pending-label">(pending moderation)</span>' : '') + '</span>'
    + '<span class="comment-date">Just now</span>'
    + '</div>'
    + '<div class="comment-body">' + esc(comment.content) + '</div>';
  container.appendChild(div);
}

// --- Utilities ---

function esc(str) {
  var d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    var date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

function showToast(message, type) {
  var toast = document.createElement('div');
  toast.className = 'toast toast-' + (type || 'info');
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(function() { toast.classList.add('show'); });
  setTimeout(function() {
    toast.classList.remove('show');
    setTimeout(function() { toast.remove(); }, 300);
  }, 2500);
}

// --- Init ---

document.addEventListener('DOMContentLoaded', function() {
  var btn = document.getElementById('show-comments-btn');
  if (btn) {
    btn.addEventListener('click', showComments);
  }
});
`
    },
    {
      path: '/.PROMPT.md',
      content: WEBSITE_DOMAIN_PROMPT
    },
  ],
};
