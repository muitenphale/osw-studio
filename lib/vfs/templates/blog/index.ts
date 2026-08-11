import { ProjectTemplate } from '../../project-templates';
import { HANDLEBARS_DOMAIN_PROMPT } from '@/lib/llm/prompts/handlebars';
import { templateStylesheet } from '../theme';
import { TEMPLATE_STYLE_PROMPT } from '../style-prompt';

export const BLOG_PROJECT_TEMPLATE: ProjectTemplate = {
  name: 'Blog with Comments',
  description: 'Blog platform with posts, comments, and content management',
  directories: ['/styles', '/scripts', '/blog', '/templates'],
  files: [
    {
      path: '/data.json',
      content: `{
  "siteName": "Plot 14",
  "tagline": "Notes from an allotment in Sheffield. Mostly what went wrong.",
  "navigation": [
    { "title": "Archive", "url": "/" }
  ],
  "posts": [
    {
      "title": "What the frost took, and what it didn't",
      "slug": "hello-world",
      "excerpt": "A late frost on 4 April went through the courgettes and left the brassicas alone. Notes on what that suggests about sowing dates here.",
      "author": "Ruth Adeyemi",
      "date": "12 April 2026"
    },
    {
      "title": "Three years of not digging",
      "slug": "getting-started",
      "excerpt": "The bed I stopped turning in 2023 against the one I kept turning, and what the difference actually looks like now.",
      "author": "Ruth Adeyemi",
      "date": "28 February 2026"
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
    <meta name="description" content="{{tagline}}">
    <link rel="stylesheet" href="/styles/style.css">
</head>
<body>
    <a class="skip-link" href="#archive">Skip to the archive</a>

    {{> navigation}}

    <div class="hero">
        <div class="wrap">
            <h1>{{siteName}}</h1>
            <p class="lede">{{tagline}}</p>
        </div>
    </div>

    <main class="wrap">
        <!--
          An archive, not a row of cards. A blog's index exists so somebody can
          scan what has been written and pick one, so each row is a title with
          one line under it and the date on the right. Cards would give two
          posts the visual weight of a shop front.
        -->
        <ol class="list archive" id="archive">
            {{#each posts}}
            <li class="list-item">
                <div>
                    <h2 class="lead"><a href="/blog/{{slug}}.html">{{title}}</a></h2>
                    <p class="sub">{{excerpt}}</p>
                </div>
                <time class="tag">{{date}}</time>
            </li>
            {{/each}}
        </ol>
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
    <title>What the frost took, and what it didn't - {{siteName}}</title>
    <meta name="description" content="A late frost on 4 April went through the courgettes and left the brassicas alone.">
    <link rel="stylesheet" href="/styles/style.css">
</head>
<body>
    <a class="skip-link" href="#post">Skip to the post</a>

    {{> navigation}}

    <main class="wrap">
        <article id="post">
            <p class="label">12 April 2026 &middot; Ruth Adeyemi</p>
            <h1>What the frost took, and what it didn't</h1>

            <div class="read">
                <p>We had a ground frost on the night of 4 April, which the forecast had at two degrees above. I had put out fourteen courgette plants on the second, hardened off over about a week, and by the morning of the fifth eleven of them were translucent at the growing tip. Those eleven did not come back.</p>

                <p>The brassicas in the next bed over, sown at the same time and no further under cover, were untouched. So were the broad beans, which I expected, and the chard, which I did not.</p>

                <h2>What I think happened</h2>

                <p>The courgettes were in the lowest corner of the plot, which is where cold air ends up on a still night. I have known that corner floods in February and never connected it to frost, but it is the same fact: cold air and water both run downhill and collect in the same place.</p>

                <p>The three that survived were the three nearest the path, which is eighteen inches higher. That is a small enough sample that I would not want to lean on it, but it points the same way as the flooding does.</p>

                <h2>What I am changing</h2>

                <ul>
                    <li>Courgettes go in the top beds from now on, and the bottom corner gets the beans, which do not mind.</li>
                    <li>Nothing tender goes out before the middle of April, whatever the forecast says. The forecast is for the city, and the plot is a hundred feet lower and half a mile from the river.</li>
                    <li>I am keeping four plants back in pots until the end of the month, so a repeat of this does not cost the whole crop.</li>
                </ul>

                <p>Resowing on 6 April, which means courgettes from late July rather than early. That is the actual cost: about three weeks, and the fourteen plants.</p>
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
    <title>Three years of not digging - {{siteName}}</title>
    <meta name="description" content="The bed I stopped turning in 2023 against the one I kept turning, and what the difference looks like now.">
    <link rel="stylesheet" href="/styles/style.css">
</head>
<body>
    <a class="skip-link" href="#post">Skip to the post</a>

    {{> navigation}}

    <main class="wrap">
        <article id="post">
            <p class="label">28 February 2026 &middot; Ruth Adeyemi</p>
            <h1>Three years of not digging</h1>

            <div class="read">
                <p>In autumn 2023 I stopped turning bed three and started putting two inches of compost on top of it every November instead. Bed four, right next to it, I have carried on digging over every winter the way I always did. Same soil, same aspect, same rotation. It was not designed as an experiment but it has turned into a reasonable one.</p>

                <h2>What is different</h2>

                <p>The obvious thing is the water. After heavy rain, bed four sits wet for two or three days and bed three does not. In August, the reverse: bed three stays damp an inch down when bed four has gone to dust. I water bed four about twice as often, which over a summer is a real amount of carrying.</p>

                <p>Weeds are down in bed three, but not to nothing, and I would not claim the dramatic reduction people describe. Bindweed does not care what I do. What has gone is the flush of seedlings that used to come up two weeks after digging, which makes sense: I am no longer bringing seed to the surface.</p>

                <h2>What is not different</h2>

                <p>Yields, as far as I can tell. I do not weigh anything, so treat that as an impression rather than a measurement. The potatoes were better in bed four last year and the leeks were better in bed three the year before, and I would not read anything into either.</p>

                <p>The compost is the part nobody mentions. Two inches over eight square metres is about a third of a cubic metre a year, and I do not make anywhere near that. So the honest version is that I have swapped digging for either buying compost or making a great deal more of it, and this year I bought it.</p>

                <p>I am carrying on with bed three, and bed four is going the same way this autumn, mostly for the watering.</p>
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
      content: `<div class="head-band">
    <header class="wrap site-head">
        <a class="brand" href="/">{{siteName}}</a>
        <nav class="site-nav">
            {{#each navigation}}
            <a href="{{url}}">{{title}}</a>
            {{/each}}
        </nav>
    </header>
</div>`
    },
    {
      path: '/templates/footer.hbs',
      content: `<div class="foot-band">
    <footer class="wrap site-foot">
        <span>{{siteName}}</span>
        <span class="mono">Built with OSW Studio</span>
    </footer>
</div>`
    },
    {
      path: '/templates/comments.hbs',
      content: `<section class="comments" id="comments-section">
    <hr class="keyline">
    <button id="show-comments-btn" class="btn btn-quiet btn-sm" type="button">Show comments</button>
    <div id="comments-area" hidden>
        <h2>Comments</h2>
        <div id="comments-list"></div>
        <div id="auth-area"></div>
        <!--
          One region for every outcome, so a message never appears somewhere the
          reader is not already looking. It is a live region, which is what makes
          the result reach a screen reader too.
        -->
        <div class="notice" id="comment-status" role="status" aria-live="polite" hidden>
            <span class="bar"></span><span id="comment-status-text"></span>
        </div>
    </div>
</section>`
    },
    {
      path: '/styles/style.css',
      content: `${templateStylesheet({ hue: 130, chroma: 0.15, lightness: 0.5 })}

/* Everything above is the shared theme. This is the reading template, so it
   takes the one thing the spec lets a template add: a serif, on the headings
   only. Below that is what a full-width page needs and the components have no
   rule for. */

:root {
  --gutter: clamp(1.25rem, 4vw, 2.5rem);
}

h1, h2, h3 {
  font-family: var(--serif);
  letter-spacing: -0.01em;
}

.skip-link {
  position: absolute;
  left: -9999px;
  background: var(--ink);
  color: var(--canvas);
  border-radius: var(--r-sm);
  padding: 0.75rem 1rem;
  z-index: 200;
}

.skip-link:focus {
  left: 1rem;
  top: 1rem;
}

/* The shared header, hero and footer were drawn inside a card, where the card's
   edge was the gutter. On a full page the band runs edge to edge and the .wrap
   inside it sets the measure, so the band takes the keyline and the component
   keeps only its height. */
.head-band {
  background: var(--canvas);
  border-bottom: 1px solid var(--line);
}

.foot-band {
  border-top: 1px solid var(--line);
}

.wrap.site-head {
  padding: 0.85rem var(--gutter);
  border-bottom: 0;
}

.wrap.site-foot {
  padding: 1.25rem var(--gutter);
  border-top: 0;
}

.hero {
  padding-left: 0;
  padding-right: 0;
}

.hero .wrap {
  padding-top: 0;
  padding-bottom: 0;
}

.hero .lede {
  margin: 0.5rem 0 0;
}

/* An archive row: the title is a real heading, so the page has a structure and
   the serif reaches it, but it is sized by .lead rather than as a page heading.
   The link carries the ink rather than the accent, and the row highlights on
   hover. */
.archive .lead {
  margin: 0;
}
ol.archive {
  margin: 0;
  padding: 0;
  list-style: none;
}

.archive .lead a {
  color: var(--ink);
  text-decoration: none;
}

.archive .list-item:hover .lead a {
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
}

.archive .sub {
  margin-top: 0.2rem;
  max-width: 60ch;
}

article .label {
  display: block;
  margin-bottom: 0.6rem;
}

article h1 {
  margin-bottom: 1.75rem;
}

/* A post's subheads are h2 in the source, and the shared h2 is sized for a page
   heading, which puts them within a hair of the title above them. In the
   reading column they take the size and spacing .read h3 is drawn at; the serif
   is what separates them from the body, not the size. */
.read h2 {
  font-size: 1.0625rem;
  margin: 1.75rem 0 0.5rem;
}

/* Comments */
.comments {
  margin-top: 3.5rem;
  max-width: var(--measure);
}

.comments .keyline {
  margin-bottom: 1.75rem;
}

.comments h2 {
  margin: 1.75rem 0 1rem;
}

.comments h3 {
  margin-bottom: 0.85rem;
}

/* A comment leads with what was said. Who said it and when is the sub line,
   because in a thread the words are what is being read. */
.comment .lead {
  max-width: 58ch;
}

.auth-bar {
  font-size: 0.8125rem;
  margin: 1.5rem 0 0.75rem;
}

.tabs {
  margin: 1.5rem 0 1rem;
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  max-width: 26rem;
}

#comment-status {
  margin-top: 1.25rem;
}

@media (max-width: 640px) {
  /* Flex items shrink below their content by default, so without the nowrap the
     links break mid-label instead of the row breaking between them. */
  .wrap.site-head {
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .site-nav {
    width: 100%;
    flex-wrap: wrap;
    gap: 0.75rem 1rem;
  }

  .site-nav a {
    font-size: 0.8125rem;
    white-space: nowrap;
  }
}`
    },
    {
      path: '/scripts/main.js',
      content: `// Blog comments and auth. Works in both Browser Mode and Server Mode.
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
  if (btn) btn.textContent = 'Loading';

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
    // Browser Mode: localStorage comments, no auth
    renderComments(getLocalComments(slug));
    renderBrowserCommentForm();
  }

  if (btn) btn.hidden = true;
  if (area) area.hidden = false;
}

// --- Comments ---

function el(tag, className, text) {
  var node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderComments(comments) {
  const container = document.getElementById('comments-list');
  if (!container) return;
  container.replaceChildren();

  const list = el('div', 'list');

  if (comments.length === 0) {
    const empty = el('div', 'empty');
    empty.append(el('h3', null, 'No comments yet'), el('p', null, 'Nothing has been said about this post.'));
    list.append(empty);
    container.append(list);
    return;
  }

  // Built as elements rather than a string of HTML: a comment is text somebody
  // typed, and a name carrying a tag would otherwise run in the next visitor's
  // browser.
  comments.forEach(function (c) {
    const row = el('div', 'list-item comment');
    const body = document.createElement('div');
    body.append(
      el('div', 'lead', c.content),
      el('div', 'sub', c.author + ' \u00b7 ' + formatDate(c.created_at))
    );
    row.append(body);
    if (c.pending) row.append(el('span', 'tag tag-warn', 'pending'));
    list.append(row);
  });

  container.append(list);
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
    // Logged in: show the auth bar and the comment form
    container.innerHTML = '<p class="faint auth-bar">'
      + 'Signed in as <span id="auth-name"></span> \\u00b7 <a id="logout-link" href="#">Sign out</a>'
      + '</p>'
      + '<form id="comment-form" class="auth-form">'
      + '<h3>Leave a comment</h3>'
      + '<label class="field">'
      + '<span>Comment</span>'
      + '<textarea id="comment-content" name="content" required placeholder="What did you make of it?" rows="4"></textarea>'
      + '</label>'
      + '<div class="row-set"><button type="submit" class="btn btn-primary">Post comment</button></div>'
      + '</form>';
    document.getElementById('auth-name').textContent = user.displayName;
    document.getElementById('logout-link').addEventListener('click', handleLogout);
    document.getElementById('comment-form').addEventListener('submit', handleCommentSubmit);
  } else {
    // Not logged in: show the login and register tabs
    container.innerHTML = '<div class="auth">'
      + '<div class="row-set tabs">'
      + '<button type="button" id="tab-login" class="filter" aria-pressed="true">Sign in</button>'
      + '<button type="button" id="tab-register" class="filter" aria-pressed="false">Register</button>'
      + '</div>'
      + '<form id="login-form" class="auth-form">'
      + '<label class="field"><span>Username</span>'
      + '<input type="text" id="login-username" required placeholder="Your username" autocomplete="username"></label>'
      + '<label class="field"><span>Password</span>'
      + '<input type="password" id="login-password" required placeholder="Your password" autocomplete="current-password"></label>'
      + '<div class="row-set"><button type="submit" class="btn btn-primary">Sign in</button></div>'
      + '</form>'
      + '<form id="register-form" class="auth-form" hidden>'
      + '<label class="field"><span>Username</span>'
      + '<input type="text" id="reg-username" required minlength="3" placeholder="Choose a username" autocomplete="username">'
      + '<span class="hint">Three characters or more.</span></label>'
      + '<label class="field"><span>Display name</span>'
      + '<input type="text" id="reg-display" placeholder="How your name appears on comments"></label>'
      + '<label class="field"><span>Password</span>'
      + '<input type="password" id="reg-password" required minlength="6" placeholder="Choose a password" autocomplete="new-password">'
      + '<span class="hint">Six characters or more.</span></label>'
      + '<div class="row-set"><button type="submit" class="btn btn-primary">Register</button></div>'
      + '</form>'
      + '</div>';

    // Tab toggle
    var tabLogin = document.getElementById('tab-login');
    var tabRegister = document.getElementById('tab-register');
    tabLogin.addEventListener('click', function() {
      tabLogin.setAttribute('aria-pressed', 'true');
      tabRegister.setAttribute('aria-pressed', 'false');
      document.getElementById('login-form').hidden = false;
      document.getElementById('register-form').hidden = true;
    });
    tabRegister.addEventListener('click', function() {
      tabRegister.setAttribute('aria-pressed', 'true');
      tabLogin.setAttribute('aria-pressed', 'false');
      document.getElementById('register-form').hidden = false;
      document.getElementById('login-form').hidden = true;
    });

    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('register-form').addEventListener('submit', handleRegister);
  }
}

// --- Browser Mode Comment Form ---

function renderBrowserCommentForm() {
  var container = document.getElementById('auth-area');
  if (!container) return;

  container.innerHTML = '<form id="comment-form" class="auth-form">'
    + '<h3>Leave a comment</h3>'
    + '<label class="field"><span>Name</span>'
    + '<input type="text" id="comment-author" name="author" required placeholder="Your name"></label>'
    + '<label class="field"><span>Comment</span>'
    + '<textarea id="comment-content" name="content" required placeholder="What did you make of it?" rows="4"></textarea></label>'
    + '<div class="row-set"><button type="submit" class="btn btn-primary">Post comment</button></div>'
    + '</form>';
  document.getElementById('comment-form').addEventListener('submit', handleBrowserComment);
}

function handleBrowserComment(e) {
  e.preventDefault();
  var slug = getSlug();
  if (!slug) return;

  var author = document.getElementById('comment-author').value.trim();
  var content = document.getElementById('comment-content').value.trim();
  if (!author || !content) { setStatus('Please fill in your name and comment.', 'error'); return; }

  var comment = { author: author, content: content, created_at: new Date().toISOString(), pending: false };
  saveLocalComment(slug, comment);
  appendCommentToUI(comment);
  setStatus('Comment added!', 'success');
  e.target.reset();
}

// --- Auth Handlers (Server Mode) ---

async function handleLogin(e) {
  e.preventDefault();
  var username = document.getElementById('login-username').value.trim();
  var password = document.getElementById('login-password').value;
  if (!username || !password) return;

  var btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true; btn.textContent = 'Signing in';

  try {
    var res = await fetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username, password: password }),
    });
    var data = await res.json();
    if (!res.ok) { setStatus(data.error || 'That sign in did not work.', 'error'); btn.disabled = false; btn.textContent = 'Sign in'; return; }
    setStatus('Logged in!', 'success');
    renderAuthArea(data.user);
  } catch {
    setStatus('Login failed. Please try again.', 'error');
    btn.disabled = false; btn.textContent = 'Sign in';
  }
}

async function handleRegister(e) {
  e.preventDefault();
  var username = document.getElementById('reg-username').value.trim();
  var displayName = document.getElementById('reg-display').value.trim();
  var password = document.getElementById('reg-password').value;
  if (!username || !password) return;

  var btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true; btn.textContent = 'Registering';

  try {
    var res = await fetch('/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username, password: password, displayName: displayName || undefined }),
    });
    var data = await res.json();
    if (!res.ok) { setStatus(data.error || 'Registration failed', 'error'); btn.disabled = false; btn.textContent = 'Register'; return; }
    setStatus('Account created!', 'success');
    renderAuthArea(data.user);
  } catch {
    setStatus('Registration failed. Please try again.', 'error');
    btn.disabled = false; btn.textContent = 'Register';
  }
}

async function handleLogout() {
  try {
    await fetch('/logout', { method: 'POST' });
  } catch { /* ignore */ }
  setStatus('Logged out.', 'info');
  renderAuthArea(null);
}

// --- Comment submit (Server Mode, authenticated) ---

async function handleCommentSubmit(e) {
  e.preventDefault();
  var slug = getSlug();
  if (!slug) return;

  var contentEl = document.getElementById('comment-content');
  var content = contentEl.value.trim();
  if (!content) { setStatus('Please write a comment.', 'error'); return; }

  var submitBtn = e.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true; submitBtn.textContent = 'Posting';

  try {
    var res = await fetch('/add-comment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: slug, content: content }),
    });
    var data = await res.json();
    if (!res.ok) {
      if (res.status === 401) {
        setStatus('Session expired. Please log in again.', 'error');
        renderAuthArea(null);
        return;
      }
      throw new Error(data.error);
    }
    setStatus('Comment submitted for moderation.', 'success');
    appendCommentToUI({ author: 'You', content: content, created_at: new Date().toISOString(), pending: true });
    contentEl.value = '';
  } catch {
    setStatus('Failed to submit comment. Please try again.', 'error');
  }

  submitBtn.disabled = false; submitBtn.textContent = 'Submit Comment';
}

function appendCommentToUI(comment) {
  var container = document.getElementById('comments-list');
  if (!container) return;

  // The empty state and the list are alternatives, so a first comment replaces
  // the one with the other rather than landing underneath it.
  var empty = container.querySelector('.empty');
  if (empty) empty.closest('.list').replaceChildren();

  var list = container.querySelector('.list');
  if (!list) {
    list = el('div', 'list');
    container.append(list);
  }

  var row = el('div', 'list-item comment');
  var body = document.createElement('div');
  body.append(
    el('div', 'lead', comment.content),
    el('div', 'sub', comment.author + ' \u00b7 Just now')
  );
  row.append(body);
  if (comment.pending) row.append(el('span', 'tag tag-warn', 'pending'));
  list.append(row);
}

// --- Utilities ---

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    var date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

// Every outcome lands in the one region under the comments rather than in a
// message that floats over the page and leaves on a timer.
var STATUS_TONE = { error: ' notice-stop', success: ' notice-ok' };

function setStatus(message, type) {
  var box = document.getElementById('comment-status');
  var text = document.getElementById('comment-status-text');
  if (!box || !text) return;
  text.textContent = message;
  box.className = 'notice' + (STATUS_TONE[type] || '');
  box.hidden = false;
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
      content: `${HANDLEBARS_DOMAIN_PROMPT}

---

# This project: a blog with comments

Posts are standalone HTML files that pull the navigation, footer and comments in as Handlebars
partials, so those stay in step across every post. \`/data.json\` carries the post list the index
renders from.

The seed content is an allotment blog by an invented person called Ruth Adeyemi. **Every post, date
and name in it is made up.** It is written out properly rather than left as lorem so the template
demonstrates what a post should look like: a specific thing that happened, what it cost, and what
changed as a result.

## How this blog is put together

- **The index is an archive, not a row of cards.** Dates hang in a rail on the left and each post is
  a title with one line under it, so a reader can scan what exists and pick one. Two posts as cards
  would give a small blog the visual weight of a shop front.
- **The post page is built for reading**: the date and byline sit in the same rail, and the body is
  held to 62ch with an open line-height. That measure is the design. Do not widen it.
- **One typeface throughout.** Reading is signalled by measure, size and leading, not by a serif.

## Where things are

- \`/data.json\`: the site title and the list of posts the index page shows.
- \`/blog/*.html\`: one file per post. Adding a post means adding the file **and** the entry in
  \`data.json\`, or it will not be listed.
- \`/templates/*.hbs\`: navigation, footer and comments. Edit these rather than repeating markup.
- \`/styles/style.css\`: the shared template theme, then a short tail of page rules. The theme is
  generated, so the only thing to change up there is the accent hue, currently 130. The tail is where
  the serif on headings comes from.
- \`/scripts/main.js\`: comments and sign-in.

## Where a comment goes

In Server Mode, the page posts to the \`add-comment\` edge function, which requires a session cookie
and stores the comment **unapproved**. Nothing appears publicly until it is approved in the database,
which is deliberate: an open comment box on a published site fills with spam. \`get-comments\` only
ever returns approved rows.

Without a server, comments go to \`localStorage\`. They are visible only in the browser that wrote
them and nobody else will ever see them. Say that plainly rather than implying a static copy of this
blog collects comments.

## Writing posts

- **Write the post, not an outline of a post.** A heading followed by one sentence is a placeholder.
- **The excerpt in \`data.json\` is what the index shows**, so it should say what the post is about
  rather than tease it. It is not a teaser and should not end in an ellipsis.
- **Say what actually happened, with numbers.** The seed posts commit to dates, counts and outcomes,
  including the ones that went badly. A post that only makes claims is not worth reading.
- **The date in \`data.json\` and the date in the post file are two separate strings.** Change one and
  you have to change the other, or the archive disagrees with the post.

${TEMPLATE_STYLE_PROMPT}
`
    },
  ],
  backendFeatures: {
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
    databaseSchema: `CREATE TABLE IF NOT EXISTS comments (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  post_slug TEXT NOT NULL,\n  author TEXT NOT NULL,\n  content TEXT NOT NULL,\n  approved INTEGER DEFAULT 0,\n  created_at DATETIME DEFAULT CURRENT_TIMESTAMP\n);\n\nCREATE TABLE IF NOT EXISTS users (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  username TEXT NOT NULL UNIQUE,\n  password_hash TEXT NOT NULL,\n  salt TEXT NOT NULL,\n  display_name TEXT NOT NULL,\n  created_at DATETIME DEFAULT CURRENT_TIMESTAMP\n);\n\nCREATE TABLE IF NOT EXISTS sessions (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  user_id INTEGER NOT NULL REFERENCES users(id),\n  token TEXT NOT NULL UNIQUE,\n  expires_at DATETIME NOT NULL,\n  created_at DATETIME DEFAULT CURRENT_TIMESTAMP\n);`,
    },
};
