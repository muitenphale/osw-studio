/**
 * Responsive Design - Built-in Skill
 * Mobile-first responsive design patterns and common failure prevention
 */

export const RESPONSIVE_SKILL = String.raw`---
name: responsive
description: Read when building responsive layouts. Covers mobile-first CSS, navigation patterns, fluid typography, touch targets, and the most common responsive failures.
---

# Responsive Design

The #1 visual failure in AI-generated sites is broken mobile layouts — fixed widths overflowing, navigation that doesn't collapse, text too small to read, touch targets too tiny to tap. This skill covers how to avoid all of that.

## Mobile-First Always

Start with the narrowest layout and expand outward. This isn't a preference — it's how CSS works most naturally. A mobile layout with media queries that add complexity is simpler and more robust than a desktop layout with media queries that try to undo complexity.

${"```"}css
/* Base styles = mobile (no media query needed) */
.container { padding: 1rem; }
.grid { display: flex; flex-direction: column; gap: 1rem; }

/* Tablet */
@media (min-width: 768px) {
  .container { padding: 2rem; }
  .grid { flex-direction: row; flex-wrap: wrap; }
  .grid > * { flex: 1 1 calc(50% - 0.5rem); }
}

/* Desktop */
@media (min-width: 1024px) {
  .container { padding: 3rem; max-width: 1200px; margin: 0 auto; }
  .grid > * { flex: 1 1 calc(33.333% - 0.67rem); }
}
${"```"}

## Key Breakpoints

You don't need dozens of breakpoints. Three cover almost everything:

- **375px** — small phones (iPhone SE, Galaxy S). Your base styles should work here.
- **768px** — tablets and small laptops. Two-column layouts become possible.
- **1024px+** — desktops. Full multi-column layouts, larger typography, more whitespace.

Test at these three widths and you'll catch most issues.

## Fluid Typography and Spacing

Hard-coded pixel values are the root of most overflow bugs. Use relative and fluid units instead.

${"```"}css
/* Fluid heading — scales smoothly from 1.75rem to 3rem */
h1 { font-size: clamp(1.75rem, 4vw + 0.5rem, 3rem); }

/* Body text — never smaller than 1rem */
body { font-size: clamp(1rem, 1.5vw + 0.25rem, 1.25rem); }

/* Fluid spacing */
section { padding: clamp(2rem, 5vw, 5rem) clamp(1rem, 3vw, 3rem); }
${"```"}

**Rules of thumb:**
- Use ${"```"}rem${"```"} for font sizes and spacing (relative to root, consistent scaling)
- Use ${"```"}%${"```"} or ${"```"}vw${"```"} for widths (adapts to container/viewport)
- Use ${"```"}clamp()${"```"} for anything that needs to scale between a min and max
- Reserve ${"```"}px${"```"} for borders, shadows, and tiny fixed details

## Navigation — The #1 Failure

Mobile navigation is where AI-generated sites break most visibly. A desktop nav bar with 6 links doesn't fit on a 375px screen. You need a collapse pattern.

### Hamburger + Mobile Overlay

${"```"}html
<nav class="nav">
  <a href="/" class="nav-logo">Brand</a>
  <button class="nav-toggle" onclick="document.querySelector('.nav-links').classList.toggle('open')" aria-label="Toggle menu">
    ☰
  </button>
  <div class="nav-links">
    <a href="/">Home</a>
    <a href="/about">About</a>
    <a href="/contact">Contact</a>
  </div>
</nav>
${"```"}

${"```"}css
.nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem;
  position: relative;
}

/* Mobile: hidden by default, full-width dropdown */
.nav-links {
  display: none;
  flex-direction: column;
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: inherit;
  padding: 1rem;
  gap: 0.5rem;
  z-index: 50;
}
.nav-links.open { display: flex; }

.nav-toggle {
  font-size: 1.5rem;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0.5rem;
}

/* Desktop: inline, toggle hidden */
@media (min-width: 768px) {
  .nav-links {
    display: flex;
    flex-direction: row;
    position: static;
    padding: 0;
    gap: 1.5rem;
  }
  .nav-toggle { display: none; }
}
${"```"}

Every multi-page site needs this pattern or something equivalent. Don't skip it.

## Common Failures

These are the specific things that break on small screens. Check each one:

### Fixed widths
${"```"}css
/* BAD — overflows on phones */
.card { width: 400px; }

/* GOOD — adapts to container */
.card { width: 100%; max-width: 400px; }
${"```"}

### Horizontal overflow
${"```"}css
/* BAD — wide tables break layout */
table { width: 800px; }

/* GOOD — scrollable container */
.table-wrapper { overflow-x: auto; -webkit-overflow-scrolling: touch; }
table { min-width: 600px; }
${"```"}

### Hover-only interactions
Touch screens don't have hover. Any functionality hidden behind ${"```"}:hover${"```"} is invisible on mobile. Use ${"```"}:hover${"```"} for visual enhancement only — the element must be usable without it.

### Small fonts
Anything below 14px is hard to read on mobile. Body text should be at least 16px (1rem) on small screens. Form inputs need 16px minimum to prevent iOS auto-zoom.

### Padding eating the viewport
${"```"}css
/* BAD — 3rem padding on both sides = 6rem consumed on a 375px screen */
.section { padding: 3rem; }

/* GOOD — less padding on mobile */
.section { padding: 1.5rem 1rem; }
@media (min-width: 768px) { .section { padding: 3rem; } }
${"```"}

### Images overflowing
${"```"}css
/* Always include this globally */
img, video, svg { max-width: 100%; height: auto; }
${"```"}

## Touch Targets

Apple and Google both recommend a minimum touch target of 44x44 CSS pixels. This applies to buttons, links, form controls, and anything tappable.

${"```"}css
button, a, input, select, textarea {
  min-height: 44px;
}

/* For icon-only buttons, ensure the clickable area is large enough */
.icon-btn {
  padding: 0.75rem;
  min-width: 44px;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
${"```"}

Space interactive elements at least 8px apart so adjacent tap targets don't overlap.

## Images and Media

${"```"}css
/* Responsive images — always */
img {
  max-width: 100%;
  height: auto;
  display: block;
}

/* Object-fit for fixed-ratio containers */
.hero-img {
  width: 100%;
  height: 300px;
  object-fit: cover;
}

/* Lazy loading for below-the-fold images */
${"```"}
${"```"}html
<img src="photo.jpg" alt="Description" loading="lazy" />
${"```"}

For hero images and backgrounds, consider using smaller image dimensions on mobile:
${"```"}html
<!-- Smaller image for mobile, larger for desktop -->
<img src="https://picsum.photos/800/400" alt="Hero"
     srcset="https://picsum.photos/400/200 400w, https://picsum.photos/800/400 800w"
     sizes="100vw" />
${"```"}

## Testing Checklist

Before finishing, mentally walk through the site at each breakpoint:

- [ ] **375px (phone)**: All content visible, no horizontal scroll, text readable, nav collapses
- [ ] **768px (tablet)**: Layout uses available space, grid switches to 2-column where appropriate
- [ ] **1024px+ (desktop)**: Full layout, max-width containers prevent ultra-wide stretching
- [ ] Touch targets are at least 44x44px
- [ ] No text smaller than 14px on any screen
- [ ] Images don't overflow their containers
- [ ] Forms are usable on mobile (inputs are 16px+ to prevent iOS zoom)
- [ ] Horizontal scroll doesn't appear at any width
`;
