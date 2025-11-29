/**
 * Accessibility - Built-in Skill
 * Web accessibility guidelines for WCAG 2.1 AA compliance
 */

export const ACCESSIBILITY_SKILL = String.raw`---
name: accessibility
description: Read when user mentions accessibility, a11y, WCAG, or when building forms and navigation. Covers semantic HTML, ARIA, and focus management.
---

# Web Accessibility Best Practices

## Purpose
Ensure static websites meet WCAG 2.1 Level AA accessibility standards. Make your sites usable by everyone, including people using assistive technologies.

## Semantic HTML

### Proper Heading Hierarchy
\`\`\`html
<!-- ✅ Good: Logical hierarchy -->
<h1>Page Title</h1>
  <h2>Section</h2>
    <h3>Subsection</h3>
    <h3>Another Subsection</h3>
  <h2>Another Section</h2>

<!-- ❌ Bad: Skipping levels -->
<h1>Page Title</h1>
  <h3>Section</h3>  <!-- Skips h2 -->
\`\`\`

**Rules:**
- One \`<h1>\` per page
- Don't skip heading levels
- Use headings for structure, not styling

### Landmark Regions
\`\`\`html
<header role="banner">
  <nav role="navigation" aria-label="Main navigation">
    <!-- Primary navigation -->
  </nav>
</header>

<main role="main">
  <article>
    <!-- Main content -->
  </article>

  <aside role="complementary">
    <!-- Related content -->
  </aside>
</main>

<footer role="contentinfo">
  <!-- Footer content -->
</footer>
\`\`\`

### Lists for Navigation
\`\`\`html
<!-- ✅ Good: Semantic list structure -->
<nav aria-label="Main menu">
  <ul>
    <li><a href="/">Home</a></li>
    <li><a href="/about.html">About</a></li>
    <li><a href="/contact.html">Contact</a></li>
  </ul>
</nav>

<!-- ❌ Bad: Divs for everything -->
<div class="nav">
  <div><a href="/">Home</a></div>
  <div><a href="/about.html">About</a></div>
</div>
\`\`\`

### Buttons vs Links
\`\`\`html
<!-- ✅ Links for navigation -->
<a href="/about.html">Learn More</a>

<!-- ✅ Buttons for actions -->
<button type="button" onclick="openModal()">Open Dialog</button>
<button type="submit">Submit Form</button>

<!-- ❌ Bad: Link styled as button for action -->
<a href="#" onclick="doSomething()">Click Me</a>
\`\`\`

## ARIA Attributes

### When to Use ARIA
**ARIA First Rule**: Don't use ARIA if you can use native HTML instead.

\`\`\`html
<!-- ✅ Prefer native HTML -->
<button>Click Me</button>

<!-- ❌ Unnecessary ARIA -->
<div role="button" tabindex="0">Click Me</div>
\`\`\`

### Common ARIA Patterns

**aria-label and aria-labelledby**
\`\`\`html
<!-- For icons/buttons without visible text -->
<button aria-label="Close dialog">
  <span class="icon-close">×</span>
</button>

<!-- Link existing text -->
<h2 id="section-title">Contact Information</h2>
<section aria-labelledby="section-title">
  <!-- Section content -->
</section>
\`\`\`

**aria-describedby**
\`\`\`html
<label for="password">Password</label>
<input
  type="password"
  id="password"
  aria-describedby="password-help"
>
<span id="password-help">
  Password must be at least 8 characters
</span>
\`\`\`

**aria-hidden**
\`\`\`html
<!-- Hide decorative icons from screen readers -->
<button>
  <span class="icon" aria-hidden="true">🔍</span>
  Search
</button>

<!-- Don't hide interactive content -->
<button aria-hidden="true">Submit</button> <!-- ❌ Bad -->
\`\`\`

### Live Regions
\`\`\`html
<!-- Announce dynamic content changes -->
<div role="status" aria-live="polite">
  <!-- Updates announced when user is idle -->
</div>

<div role="alert" aria-live="assertive">
  <!-- Updates announced immediately -->
</div>

<!-- Example: Form error -->
<div role="alert" aria-live="assertive" class="error-message">
  Please enter a valid email address
</div>
\`\`\`

## Keyboard Navigation

### Focusable Elements
\`\`\`css
/* Visible focus indicators */
*:focus {
  outline: 2px solid #005fcc;
  outline-offset: 2px;
}

/* Never remove focus styles without replacement */
/* ❌ Bad */
*:focus {
  outline: none;
}

/* ✅ Better: Custom focus style */
button:focus {
  outline: none;
  box-shadow: 0 0 0 3px rgba(0,95,204,0.5);
}
\`\`\`

### Tab Order
\`\`\`html
<!-- Natural tab order (follows DOM order) -->
<button>First</button>
<button>Second</button>
<button>Third</button>

<!-- ❌ Avoid: Manipulating tab order unless necessary -->
<button tabindex="3">Third</button>
<button tabindex="1">First</button>
<button tabindex="2">Second</button>

<!-- ✅ Remove from tab order (decorative/duplicate) -->
<a href="/home" tabindex="-1">
  <img src="logo.png" alt="">
</a>
\`\`\`

### Keyboard Event Handlers
\`\`\`javascript
// Handle both click and keyboard events
button.addEventListener('click', handleAction);
button.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    handleAction();
  }
});

// Close dialogs on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && dialogOpen) {
    closeDialog();
  }
});
\`\`\`

### Skip Links
\`\`\`html
<!-- Allow keyboard users to skip navigation -->
<a href="#main-content" class="skip-link">
  Skip to main content
</a>

<nav>
  <!-- Navigation -->
</nav>

<main id="main-content">
  <!-- Main content -->
</main>
\`\`\`

\`\`\`css
.skip-link {
  position: absolute;
  top: -40px;
  left: 0;
  background: #000;
  color: #fff;
  padding: 8px;
  z-index: 100;
}

.skip-link:focus {
  top: 0;
}
\`\`\`

## Color and Contrast

### WCAG Contrast Ratios
- **Normal text**: 4.5:1 minimum
- **Large text** (18pt+ or 14pt+ bold): 3:1 minimum
- **UI components**: 3:1 minimum

\`\`\`css
/* ✅ Good contrast (7:1) */
.text {
  color: #333;
  background: #fff;
}

/* ❌ Poor contrast (2.1:1) */
.text-bad {
  color: #ccc;
  background: #fff;
}
\`\`\`

**Tools**: Use contrast checkers (WebAIM, Chrome DevTools)

### Don't Rely on Color Alone
\`\`\`html
<!-- ❌ Bad: Color only -->
<p style="color: red;">Error: Invalid input</p>
<p style="color: green;">Success!</p>

<!-- ✅ Good: Color + text/icon -->
<p class="error">
  <span class="icon" aria-hidden="true">❌</span>
  Error: Invalid input
</p>
<p class="success">
  <span class="icon" aria-hidden="true">✓</span>
  Success!
</p>
\`\`\`

## Form Accessibility

### Labels for Inputs
\`\`\`html
<!-- ✅ Explicit label -->
<label for="email">Email Address</label>
<input type="email" id="email" name="email" required>

<!-- ✅ Implicit label -->
<label>
  Email Address
  <input type="email" name="email" required>
</label>

<!-- ❌ Bad: Placeholder only -->
<input type="email" placeholder="Email">
\`\`\`

### Required Fields
\`\`\`html
<label for="name">
  Name
  <span aria-label="required">*</span>
</label>
<input
  type="text"
  id="name"
  name="name"
  required
  aria-required="true"
>
\`\`\`

### Error Messaging
\`\`\`html
<label for="password">Password</label>
<input
  type="password"
  id="password"
  aria-describedby="password-error"
  aria-invalid="true"
>
<span id="password-error" role="alert">
  Password must be at least 8 characters
</span>
\`\`\`

### Fieldset and Legend
\`\`\`html
<fieldset>
  <legend>Shipping Method</legend>
  <label>
    <input type="radio" name="shipping" value="standard">
    Standard (5-7 days)
  </label>
  <label>
    <input type="radio" name="shipping" value="express">
    Express (1-2 days)
  </label>
</fieldset>
\`\`\`

## Images and Media

### Alt Text Best Practices
\`\`\`html
<!-- ✅ Descriptive alt text -->
<img src="dog.jpg" alt="Golden retriever playing with a ball in the park">

<!-- ✅ Decorative images -->
<img src="decorative-line.png" alt="">

<!-- ✅ Functional images -->
<a href="/search">
  <img src="search-icon.png" alt="Search">
</a>

<!-- ❌ Bad: Redundant text -->
<img src="photo.jpg" alt="Image of a photo">

<!-- ❌ Bad: Filename -->
<img src="IMG_1234.jpg" alt="IMG_1234">
\`\`\`

### Video Captions
\`\`\`html
<video controls>
  <source src="video.mp4" type="video/mp4">
  <track kind="captions" src="captions.vtt" srclang="en" label="English">
  Your browser doesn't support video.
</video>
\`\`\`

## Modal Dialogs

### Accessible Modal Pattern
\`\`\`javascript
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  const trigger = document.activeElement; // Remember trigger

  modal.setAttribute('aria-hidden', 'false');
  modal.classList.add('is-open');

  // Focus first interactive element
  const firstFocusable = modal.querySelector('button, [href], input, select');
  firstFocusable?.focus();

  // Trap focus
  modal.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      trapFocus(e, modal);
    }
  });

  // Return focus on close
  modal.addEventListener('close', () => {
    trigger.focus();
  });
}
\`\`\`

## Testing Checklist

### Automated Testing
- Run axe DevTools or WAVE
- Check contrast ratios
- Validate HTML

### Manual Testing
- [ ] Navigate entire site using only keyboard (Tab, Enter, Arrows, Escape)
- [ ] Test with screen reader (NVDA, JAWS, VoiceOver)
- [ ] Zoom to 200% - content still readable and usable
- [ ] Disable CSS - content still makes sense
- [ ] Use site in grayscale mode
- [ ] Test forms with different input methods

### Screen Reader Testing
**Windows**: NVDA (free)
**Mac**: VoiceOver (built-in, Cmd+F5)
**Mobile**: iOS VoiceOver, Android TalkBack

## Common Mistakes to Avoid

- Removing focus indicators
- Using \`<div>\` and \`<span>\` for everything
- Missing form labels
- Non-descriptive link text ("click here")
- Images without alt text
- Keyboard traps (can't navigate away)
- Auto-playing videos without controls
- Time limits without warnings
- Content only accessible on hover
- Poor color contrast

## Quick Wins

1. Add alt text to all images
2. Use semantic HTML (\`<nav>\`, \`<main>\`, \`<article>\`)
3. Ensure all interactive elements are keyboard accessible
4. Add visible focus indicators
5. Include skip navigation links
6. Label all form inputs
7. Use sufficient color contrast
8. Add ARIA labels to icon buttons
`;
