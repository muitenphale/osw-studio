import { ProjectTemplate } from '../../project-templates';
import { HANDLEBARS_DOMAIN_PROMPT } from '@/lib/llm/prompts/handlebars';
import { templateStylesheet } from '../theme';
import { TEMPLATE_STYLE_PROMPT } from '../style-prompt';

export const CONTACT_LANDING_PROJECT_TEMPLATE: ProjectTemplate = {
  name: 'Landing Page with Contact Form',
  description: 'Professional landing page with a working contact form powered by Resend',
  directories: ['/styles', '/scripts'],
  files: [
    {
      path: '/index.html',
      content: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Marram, accessibility audits for small teams</title>
    <meta name="description" content="A two-week accessibility audit of one site or app, with a ranked findings list and a fix written out for each one. Two weeks, £2,400.">
    <link rel="stylesheet" href="/styles/style.css">
</head>
<body>
    <a class="skip-link" href="#enquiry">Skip to the enquiry form</a>

    <div class="head-band">
        <header class="wrap site-head">
            <a class="brand" href="#top">Marram</a>
            <nav class="site-nav">
                <a href="#what">What you get</a>
                <a href="#how">How it works</a>
                <a class="btn btn-line btn-sm" href="#enquiry">Start an audit</a>
            </nav>
        </header>
    </div>

    <main id="top">
        <section class="hero">
            <div class="wrap">
                <p class="label">Accessibility audits &middot; Two weeks &middot; &pound;2,400</p>
                <h1>Find out what your site does to someone using a keyboard</h1>
                <p class="lede">We audit one site or app against WCAG 2.2 AA, by hand and with a screen reader, and send back a ranked list of what is broken with a fix written out for each one.</p>
                <div class="row-set">
                    <a class="btn btn-primary" href="#enquiry">Start an audit</a>
                    <a class="btn btn-quiet" href="#what">What you get</a>
                </div>
            </div>
        </section>

        <section class="band" id="what">
            <div class="wrap">
                <h2>What you get</h2>
                <div class="cards">
                    <div class="card">
                        <h3>A ranked findings list</h3>
                        <p>Ordered by how many people each issue stops, not by how hard it is to fix. Each one names the page, the element and the success criterion it fails.</p>
                    </div>
                    <div class="card">
                        <h3>A fix for each finding</h3>
                        <p>The markup or attribute that resolves it, written against your code rather than a generic example. Where there is a trade-off, we say what it costs.</p>
                    </div>
                    <div class="card">
                        <h3>A re-check when you are done</h3>
                        <p>Send it back within three months and we run the list again at no extra cost, so you find out whether the fixes landed.</p>
                    </div>
                </div>
            </div>
        </section>

        <!--
          An ordered list, and the numbers come from a CSS counter: these really
          are a sequence. The cards above are a catalogue, so they are not
          numbered.
        -->
        <section class="band band-sunken" id="how">
            <div class="wrap">
                <h2>How it works</h2>
                <ol class="steps">
                    <li>
                        <h3>Week one</h3>
                        <p>Keyboard and screen reader pass over the main journeys, plus an automated sweep to catch the rest.</p>
                    </li>
                    <li>
                        <h3>Week two</h3>
                        <p>Writing up findings and fixes, then a call to walk through the list.</p>
                    </li>
                    <li>
                        <h3>After</h3>
                        <p>One re-check within three months, included.</p>
                    </li>
                </ol>
                <p class="muted note">We take two audits a month, so the earliest start is usually three or four weeks out. Larger sites and native apps are quoted separately. We do not sell retainers or accessibility overlays.</p>
            </div>
        </section>

        <section class="band" id="enquiry">
            <div class="wrap">
                <h2>Start an audit</h2>
                <p class="muted">Tell us what you would like looked at. We reply within two working days.</p>

                <form id="contact-form" class="enquiry-form">
                    <label class="field">
                        <span>Name</span>
                        <input type="text" id="contact-name" name="name" required placeholder="Your name">
                    </label>
                    <label class="field">
                        <span>Email</span>
                        <input type="email" id="contact-email" name="email" required placeholder="you@example.com">
                    </label>
                    <label class="field">
                        <span>Site or app</span>
                        <input type="text" id="contact-subject" name="subject" placeholder="The URL you want audited">
                        <span class="hint">Optional, but it saves a round trip.</span>
                    </label>
                    <label class="field">
                        <span>What should we know?</span>
                        <textarea id="contact-message" name="message" required rows="4" placeholder="Roughly how large it is, and anything you already know is broken"></textarea>
                    </label>
                    <div class="row-set">
                        <button type="submit" class="btn btn-primary">Send enquiry</button>
                    </div>
                </form>

                <!--
                  One region for every outcome, so a message never appears in a
                  place the reader is not already looking. It is a live region,
                  which is what makes the result reach a screen reader too.
                -->
                <div class="notice" id="form-status" role="status" aria-live="polite" hidden>
                    <span class="bar"></span>
                    <span id="form-status-text"></span>
                </div>
            </div>
        </section>
    </main>

    <div class="foot-band">
        <footer class="wrap site-foot">
            <span>Marram, accessibility audits</span>
            <span class="mono"><span id="year">2025</span> &middot; Built with OSW Studio</span>
        </footer>
    </div>

    <script src="/scripts/main.js"></script>
</body>
</html>`
    },
    {
      path: '/styles/style.css',
      content: `${templateStylesheet({ hue: 320 })}

/* Everything above is the shared theme, and the accent hue is the only thing
   this page chose. What follows is what a full-width page needs and a component
   set has no rule for: the skip link, the bands, and the form column. */

/* The same gutter .wrap uses, so a band can line its own padding up with it. */
:root {
  --gutter: clamp(1.25rem, 4vw, 2.5rem);
}

html {
  scroll-behavior: smooth;
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

.band .wrap,
.hero .wrap {
  padding-top: 0;
  padding-bottom: 0;
}

/* .site-nav paints every link inside itself, and it out-specifies .btn-line. */
.site-nav a.btn-line {
  color: var(--canvas);
}

.hero h1 {
  margin-top: 0.75rem;
}

.band {
  padding: clamp(3rem, 6vw, 4.5rem) 0;
  border-bottom: 1px solid var(--line);
}

.band-sunken {
  background: var(--base);
}

.band h2 {
  margin-bottom: 1.5rem;
}

.note {
  margin-top: 1.5rem;
  font-size: 0.9375rem;
}

.steps {
  list-style: none;
  counter-reset: step;
  display: grid;
  gap: 1.75rem;
  grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
  margin: 0;
  padding: 0;
}

.steps li {
  counter-increment: step;
  padding-top: 1rem;
  border-top: 2px solid var(--line-strong);
}

.steps li::before {
  content: counter(step, decimal-leading-zero);
  display: block;
  margin-bottom: 0.6rem;
  font-family: var(--mono);
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  color: var(--accent-text);
}

.steps p {
  margin-top: 0.35rem;
  font-size: 0.9375rem;
  color: var(--ink-soft);
}

/* One column, at the width a form is comfortable to fill in. Wider than this
   and the eye loses the left edge on the way back from the end of a field. */
.enquiry-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  max-width: 34rem;
  margin-top: 1.75rem;
}

#form-status {
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
}

@media (prefers-reduced-motion: reduce) {
  html {
    scroll-behavior: auto;
  }
}`
    },
    {
      path: '/scripts/main.js',
      content: `// The form posts to an edge function when there is a server answering, and
// falls back to localStorage when there is not, so the page still demonstrates
// in Browser mode. Every outcome is reported in the one status region under the
// form rather than in a floating message.

var serverMode = false;

function setStatus(message, kind) {
  var box = document.getElementById('form-status');
  var text = document.getElementById('form-status-text');
  if (!box || !text) return;
  text.textContent = message;
  box.className = 'notice' + (kind ? ' notice-' + kind : '');
  box.hidden = false;
}

function clearStatus() {
  var box = document.getElementById('form-status');
  if (box) box.hidden = true;
}

async function handleContactSubmit(e) {
  e.preventDefault();
  clearStatus();

  var name = document.getElementById('contact-name').value.trim();
  var email = document.getElementById('contact-email').value.trim();
  var subject = document.getElementById('contact-subject').value.trim();
  var message = document.getElementById('contact-message').value.trim();

  if (!name || !email || !message) {
    setStatus('Name, email and a message are needed before this can send.', 'stop');
    return;
  }

  var submitBtn = e.target.querySelector('button[type="submit"]');
  var label = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = 'Sending';

  var sent = false;

  if (serverMode) {
    try {
      var res = await fetch('/submit-contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name, email: email, subject: subject, message: message }),
      });
      if (!res.ok) throw new Error('submit failed');
      sent = true;
    } catch (err) {
      setStatus('That did not send. Check your connection and try again.', 'stop');
    }
  } else {
    saveMessageLocally({ name: name, email: email, subject: subject, message: message, date: new Date().toISOString() });
    sent = true;
  }

  submitBtn.disabled = false;
  submitBtn.textContent = label;

  if (sent) {
    e.target.reset();
    setStatus(
      serverMode
        ? 'Sent. We reply within two working days.'
        : 'Saved in this browser. There is no server attached to this page yet, so nobody has received it.',
      serverMode ? 'ok' : null
    );
  }
}

function saveMessageLocally(msg) {
  try {
    var messages = JSON.parse(localStorage.getItem('contact-messages') || '[]');
    messages.push(msg);
    localStorage.setItem('contact-messages', JSON.stringify(messages));
  } catch (err) {
    // Private browsing and full quotas both land here. The status line below
    // still tells the visitor the message went nowhere.
  }
}

async function detectServerMode() {
  try {
    var res = await fetch('/contact-status');
    if (res.ok) serverMode = true;
  } catch (err) {
    // No server answering, so the form stays in its local fallback.
  }
}

document.addEventListener('DOMContentLoaded', function () {
  detectServerMode();

  var year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());

  var form = document.getElementById('contact-form');
  if (form) form.addEventListener('submit', handleContactSubmit);
});
`
    },
    {
      path: '/.PROMPT.md',
      content: `${HANDLEBARS_DOMAIN_PROMPT}

---

# This project: a landing page with a working contact form

One page that explains a service and takes an enquiry. It is currently filled in as an accessibility
audit studio called Marram so that it reads as a finished site rather than a wireframe. **Every name,
price and claim in it is invented.** Replacing that content is nearly always the first job.

## How this page is put together

One column, read top to bottom: what the service is, what you get, how it runs, then the form. The
price and the shape of the engagement are in the hero rather than three sections down, because that
is what a visitor is trying to find out. Keep them there.

The form is last on purpose. It is short enough to fill in once the page has answered the questions
above it, and every link to it is an anchor, so nothing is hidden behind a scroll.

## Where things are

- \`/index.html\`: every word on the page, including the form.
- \`/styles/style.css\`: the shared template theme, then a short tail of page-level rules. The theme
  is generated, so the only thing to change up there is the accent hue, currently 320.
- \`/scripts/main.js\`: submits the form, and decides where the submission goes.

## Where a submission goes

The page asks \`/contact-status\` on load. If a server answers, it posts to the \`submit-contact\` edge
function, which writes the message to the \`messages\` table and, when \`RESEND_API_KEY\` and
\`NOTIFY_EMAIL\` are set in the Backend panel, forwards it by email. If nothing answers, the page falls
back to \`localStorage\` and says so in the status line under the form, because a message saved in one
browser has not reached anybody. Keep that wording honest rather than showing a plain "Sent".

Two things about the edge function are easy to get wrong:

- **Pass \`fetch\` an object body, never \`JSON.stringify(...)\`.** The runtime serialises the body
  itself, so a string arrives double-encoded and the receiving API rejects it.
- **Nothing reads the \`messages\` table back out over HTTP.** An endpoint that lists submissions is
  an endpoint that hands anyone who guesses the URL a list of names, addresses and messages. Read
  them through the Backend panel instead.

## Reporting the outcome

Every result, including validation, goes to the one \`#form-status\` region under the form. It is a
live region, so a screen reader announces it without moving focus. Adding a floating toast alongside
it means two places to look and one of them disappears on a timer.

## Changing the service

Change all of it: the title and meta description, the brand, the hero heading and lede, the three
cards, the steps, the form labels, and the accent hue if the business has a colour of its own. The
form field names (\`name\`, \`email\`, \`subject\`, \`message\`) are what the edge function and the
database column names expect, so renaming one means changing the function and the schema too.

${TEMPLATE_STYLE_PROMPT}
`
    },
  ],
  backendFeatures: {
    edgeFunctions: [
      {
        name: 'submit-contact',
        method: 'POST',
        code: `const body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body;\nconst { name, email, subject, message } = body;\nif (!name || !email || !message) { Response.json({ error: 'Missing required fields' }, 400); return; }\ndb.run('INSERT INTO messages (name, email, subject, message) VALUES (?, ?, ?, ?)', [name, email, subject || null, message]);\n\n// Optional: send email via Resend if API key is configured\nconst apiKey = secrets.has('RESEND_API_KEY') ? secrets.get('RESEND_API_KEY') : null;\nconst notifyEmail = secrets.has('NOTIFY_EMAIL') ? secrets.get('NOTIFY_EMAIL') : null;\nif (apiKey && notifyEmail) {\n  try {\n    await fetch('https://api.resend.com/emails', {\n      method: 'POST',\n      headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },\n      // Passed as an object, not a string: the edge runtime serialises the body itself,\n      // so handing it JSON.stringify(...) sends a quoted string that Resend rejects.\n      body: {\n        from: 'Contact Form <onboarding@resend.dev>',\n        to: [notifyEmail],\n        subject: 'New contact: ' + (subject || 'No subject'),\n        html: '<p><strong>From:</strong> ' + name + ' (' + email + ')</p><p>' + message + '</p>'\n      }\n    });\n  } catch (e) { console.error('Email send failed:', e); }\n}\n\nResponse.json({ success: true });`,
        description: 'Stores a contact form submission, and emails it on if Resend is configured',
        enabled: true,
        timeoutMs: 10000,
      },
      {
        // Only tells the page a server is there to submit to. It replaced a `list-messages`
        // endpoint that returned the 50 most recent submissions, with names, addresses and
        // message bodies, to anyone who requested the URL. Its only caller was this probe, which
        // discarded the response, so the data was exposed for nothing.
        name: 'contact-status',
        method: 'GET',
        code: `Response.json({ ok: true });`,
        description: 'Reports that the contact form has a server to submit to',
        enabled: true,
        timeoutMs: 5000,
      },
    ],
    secrets: [
      { name: 'RESEND_API_KEY', description: 'Resend API key for sending email notifications (get one at resend.com)' },
      { name: 'NOTIFY_EMAIL', description: 'Email address to receive contact form notifications' },
    ],
    databaseSchema: `CREATE TABLE IF NOT EXISTS messages (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  name TEXT NOT NULL,\n  email TEXT NOT NULL,\n  subject TEXT,\n  message TEXT NOT NULL,\n  created_at DATETIME DEFAULT CURRENT_TIMESTAMP\n);`,
    },
};
