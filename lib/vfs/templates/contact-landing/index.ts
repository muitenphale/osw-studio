import { ProjectTemplate } from '../../project-templates';
import { WEBSITE_DOMAIN_PROMPT } from '@/lib/llm/prompts/website';

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
    <title>My Website</title>
    <link rel="stylesheet" href="/styles/style.css">
</head>
<body>
    <!-- Navigation -->
    <header class="site-header">
        <div class="container header-inner">
            <a href="#" class="logo">MyBrand</a>
            <nav>
                <a href="#features">Features</a>
                <a href="#about">About</a>
                <a href="#contact">Contact</a>
            </nav>
        </div>
    </header>

    <!-- Hero Section -->
    <section class="hero">
        <div class="container">
            <h1>Build Something Amazing</h1>
            <p>A modern landing page template with a working contact form. In Server Mode, messages are saved to a database and forwarded via email.</p>
            <a href="#contact" class="btn btn-primary btn-lg">Get in Touch</a>
        </div>
    </section>

    <!-- Features Section -->
    <section class="features" id="features">
        <div class="container">
            <h2>Features</h2>
            <div class="feature-grid">
                <div class="feature-card">
                    <div class="feature-icon">&#x26A1;</div>
                    <h3>Fast &amp; Lightweight</h3>
                    <p>Pure HTML, CSS, and JavaScript. No frameworks, no build steps. Just clean, fast code.</p>
                </div>
                <div class="feature-card">
                    <div class="feature-icon">&#x1F4E7;</div>
                    <h3>Working Contact Form</h3>
                    <p>Messages are stored in a database and can be forwarded to your email via Resend.</p>
                </div>
                <div class="feature-card">
                    <div class="feature-icon">&#x1F310;</div>
                    <h3>Ready to Deploy</h3>
                    <p>Publish directly from OSW Studio in Server Mode, or export and host anywhere.</p>
                </div>
            </div>
        </div>
    </section>

    <!-- About Section -->
    <section class="about" id="about">
        <div class="container">
            <h2>About</h2>
            <p>This is a starter template for a landing page with a fully functional contact form. Customize the content, colors, and layout to match your brand.</p>
            <p>In <strong>Server Mode</strong>, the contact form saves submissions to a SQLite database and optionally sends email notifications using <a href="https://resend.com" target="_blank" rel="noopener">Resend</a>. In <strong>Browser Mode</strong>, submissions are saved locally in your browser.</p>
        </div>
    </section>

    <!-- Contact Section -->
    <section class="contact" id="contact">
        <div class="container">
            <h2>Contact Us</h2>
            <p class="section-subtitle">Have a question or want to work together? Send us a message.</p>
            <form id="contact-form" class="contact-form">
                <div class="form-row">
                    <div class="form-group">
                        <label for="contact-name">Name *</label>
                        <input type="text" id="contact-name" name="name" required placeholder="Your name">
                    </div>
                    <div class="form-group">
                        <label for="contact-email">Email *</label>
                        <input type="email" id="contact-email" name="email" required placeholder="you@example.com">
                    </div>
                </div>
                <div class="form-group">
                    <label for="contact-subject">Subject</label>
                    <input type="text" id="contact-subject" name="subject" placeholder="What is this about?">
                </div>
                <div class="form-group">
                    <label for="contact-message">Message *</label>
                    <textarea id="contact-message" name="message" required placeholder="Your message..." rows="5"></textarea>
                </div>
                <button type="submit" class="btn btn-primary">Send Message</button>
            </form>
        </div>
    </section>

    <!-- Footer -->
    <footer class="site-footer">
        <div class="container">
            <p>&copy; 2025 MyBrand. Built with OSW Studio.</p>
        </div>
    </footer>

    <script src="/scripts/main.js"></script>
</body>
</html>`
    },
    {
      path: '/styles/style.css',
      content: `/* Landing Page Styles */
*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: #ffffff;
  color: #1e293b;
  line-height: 1.6;
}

.container {
  max-width: 1100px;
  margin: 0 auto;
  padding: 0 1.5rem;
}

/* Header */
.site-header {
  background: #ffffff;
  border-bottom: 1px solid #e2e8f0;
  padding: 1rem 0;
  position: sticky;
  top: 0;
  z-index: 100;
}

.header-inner {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.logo {
  font-size: 1.25rem;
  font-weight: 700;
  color: #0f172a;
  text-decoration: none;
}

nav {
  display: flex;
  gap: 1.5rem;
}

nav a {
  text-decoration: none;
  color: #64748b;
  font-size: 0.875rem;
  font-weight: 500;
  transition: color 0.2s;
}

nav a:hover {
  color: #2563eb;
}

/* Hero */
.hero {
  text-align: center;
  padding: 6rem 0 5rem;
  background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
}

.hero h1 {
  font-size: 3rem;
  font-weight: 800;
  color: #0f172a;
  margin-bottom: 1rem;
  line-height: 1.2;
}

.hero p {
  font-size: 1.125rem;
  color: #64748b;
  max-width: 600px;
  margin: 0 auto 2rem;
}

/* Features */
.features {
  padding: 5rem 0;
}

.features h2,
.about h2,
.contact h2 {
  text-align: center;
  font-size: 2rem;
  font-weight: 700;
  margin-bottom: 1rem;
  color: #0f172a;
}

.feature-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 2rem;
  margin-top: 3rem;
}

.feature-card {
  text-align: center;
  padding: 2rem;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  transition: box-shadow 0.2s;
}

.feature-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
}

.feature-icon {
  font-size: 2.5rem;
  margin-bottom: 1rem;
}

.feature-card h3 {
  font-size: 1.125rem;
  margin-bottom: 0.5rem;
  color: #0f172a;
}

.feature-card p {
  color: #64748b;
  font-size: 0.9375rem;
}

/* About */
.about {
  padding: 5rem 0;
  background: #f8fafc;
}

.about p {
  max-width: 700px;
  margin: 0 auto 1rem;
  text-align: center;
  color: #475569;
}

.about a {
  color: #2563eb;
  text-decoration: none;
}

.about a:hover {
  text-decoration: underline;
}

/* Contact */
.contact {
  padding: 5rem 0;
}

.section-subtitle {
  text-align: center;
  color: #64748b;
  margin-bottom: 2.5rem;
}

.contact-form {
  max-width: 600px;
  margin: 0 auto;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

@media (max-width: 640px) {
  .form-row {
    grid-template-columns: 1fr;
  }
  .hero h1 {
    font-size: 2rem;
  }
}

.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  font-size: 0.875rem;
  font-weight: 500;
  margin-bottom: 0.375rem;
  color: #334155;
}

.form-group input,
.form-group textarea {
  width: 100%;
  padding: 0.625rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-family: inherit;
  font-size: 0.9375rem;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.form-group input:focus,
.form-group textarea:focus {
  outline: none;
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
}

/* Buttons */
.btn {
  display: inline-block;
  padding: 0.625rem 1.5rem;
  border: none;
  border-radius: 8px;
  font-size: 0.9375rem;
  font-weight: 600;
  cursor: pointer;
  text-decoration: none;
  transition: background 0.2s, transform 0.1s;
}

.btn:active {
  transform: scale(0.98);
}

.btn-primary {
  background: #2563eb;
  color: white;
}

.btn-primary:hover {
  background: #1d4ed8;
}

.btn-lg {
  padding: 0.875rem 2.5rem;
  font-size: 1rem;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Success Message */
.form-success {
  text-align: center;
  padding: 2rem;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 12px;
}

.form-success h3 {
  color: #16a34a;
  font-size: 1.25rem;
  margin-bottom: 0.5rem;
}

.form-success p {
  color: #475569;
}

/* Toast */
.toast {
  position: fixed;
  bottom: 1.5rem;
  right: 1.5rem;
  padding: 0.75rem 1.25rem;
  border-radius: 8px;
  color: white;
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
.toast-info { background: #2563eb; }

/* Footer */
.site-footer {
  background: #f1f5f9;
  padding: 2rem 0;
  text-align: center;
  color: #64748b;
  font-size: 0.875rem;
}
`
    },
    {
      path: '/scripts/main.js',
      content: `// Landing Page with Contact Form
// In Server Mode, submissions are saved to the database and optionally emailed via Resend.
// In Browser Mode, submissions are saved to localStorage.

let serverMode = false;

async function handleContactSubmit(e) {
  e.preventDefault();

  const nameEl = document.getElementById('contact-name');
  const emailEl = document.getElementById('contact-email');
  const subjectEl = document.getElementById('contact-subject');
  const messageEl = document.getElementById('contact-message');

  const name = nameEl.value.trim();
  const email = emailEl.value.trim();
  const subject = subjectEl.value.trim();
  const message = messageEl.value.trim();

  if (!name || !email || !message) {
    showToast('Please fill in all required fields.', 'error');
    return;
  }

  const submitBtn = e.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Sending...';

  let success = false;

  if (serverMode) {
    try {
      const res = await fetch('/submit-contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, subject, message }),
      });
      if (!res.ok) throw new Error();
      success = true;
    } catch {
      showToast('Failed to send message. Please try again.', 'error');
    }
  } else {
    // Browser Mode — save locally
    saveMessageLocally({ name, email, subject, message, date: new Date().toISOString() });
    success = true;
  }

  submitBtn.disabled = false;
  submitBtn.textContent = 'Send Message';

  if (success) {
    showFormSuccess();
    e.target.reset();
  }
}

function saveMessageLocally(msg) {
  try {
    const messages = JSON.parse(localStorage.getItem('contact-messages') || '[]');
    messages.push(msg);
    localStorage.setItem('contact-messages', JSON.stringify(messages));
  } catch {
    // Ignore storage errors
  }
}

function showFormSuccess() {
  const form = document.getElementById('contact-form');
  if (!form) return;

  const successDiv = document.createElement('div');
  successDiv.className = 'form-success';
  successDiv.innerHTML = '<h3>Message Sent!</h3><p>Thank you for reaching out. We\\u2019ll get back to you soon.</p>';

  form.style.display = 'none';
  form.parentNode.insertBefore(successDiv, form.nextSibling);

  // Restore form after 5 seconds
  setTimeout(() => {
    successDiv.remove();
    form.style.display = 'block';
  }, 5000);
}

// --- Detect Server Mode ---

async function detectServerMode() {
  try {
    const res = await fetch('/list-messages');
    if (res.ok) serverMode = true;
  } catch {
    // Not in server mode
  }
}

// --- Utilities ---

function showToast(message, type) {
  const toast = document.createElement('div');
  toast.className = 'toast toast-' + (type || 'info');
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

// --- Smooth scrolling for anchor links ---

function setupSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
      const target = document.querySelector(anchor.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
}

// --- Init ---

document.addEventListener('DOMContentLoaded', () => {
  setupSmoothScroll();
  detectServerMode();

  const form = document.getElementById('contact-form');
  if (form) {
    form.addEventListener('submit', handleContactSubmit);
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
