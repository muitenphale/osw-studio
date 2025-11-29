/**
 * OSW Planning - Built-in Skill
 * Project planning workflow and JAMstack tech stack options
 */

export const OSW_PLANNING_SKILL = String.raw`---
name: osw-planning
description: Read when starting new projects. Covers PLAN.md workflow, JAMstack-compatible tech stack options, and project structure.
---

# OSW Studio Project Planning

## Purpose
This skill helps you plan new website projects in OSW Studio. Use it at the start of any new project to establish structure, choose technologies, and create a roadmap.

## Step 1: Create PLAN.md First

**Always start by creating \`/PLAN.md\`** - this is your project roadmap:

\`\`\`markdown
# Project Plan

## Overview
[Brief description of the website and its purpose]

## Pages
- index.html - Homepage with hero, features, CTA
- about.html - About page with team/company info
- contact.html - Contact form and details

## Tech Stack
- CSS Framework: [Tailwind/Bootstrap/Bulma/Vanilla]
- Icons: [FontAwesome/Heroicons/Feather/Lucide]
- Fonts: [Google Fonts selection]
- Images: [Picsum/Unsplash/User-provided]
- Animation: [AOS/Animate.css/CSS only]
- Forms: [Netlify Forms/Formspree/Basin]

## Color Palette
- Primary: #3B82F6
- Secondary: #8B5CF6
- Accent: #F59E0B
- Neutral: #F9FAFB / #111827

## Component Structure
- /templates/components/nav.hbs
- /templates/components/footer.hbs
- /templates/partials/[other partials]

## Execution Order
1. Create Handlebars components (nav, footer)
2. Build index.html first (visible progress!)
3. Build remaining pages
4. Add interactivity/animations
5. Test and refine
\`\`\`

## JAMstack Tech Stack Options

### CSS Frameworks (pick one)

**Tailwind CSS** - Utility-first, highly customizable
\`\`\`html
<script src="https://cdn.tailwindcss.com"></script>
<script>
  tailwind.config = {
    theme: {
      extend: {
        colors: {
          primary: '#3B82F6',
          secondary: '#8B5CF6',
        }
      }
    }
  }
</script>
\`\`\`

**Bootstrap 5** - Component-rich, quick prototyping
\`\`\`html
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
\`\`\`

**Bulma** - Modern, flexbox-based
\`\`\`html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bulma@0.9.4/css/bulma.min.css">
\`\`\`

**Vanilla CSS** - Full control, no dependencies
\`\`\`html
<link rel="stylesheet" href="/styles.css">
\`\`\`

### Icon Libraries (pick one)

**FontAwesome** - Largest collection
\`\`\`html
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
<!-- Usage: <i class="fa-solid fa-check"></i> -->
\`\`\`

**Heroicons** - By Tailwind team, inline SVG
\`\`\`html
<!-- Copy SVG directly from heroicons.com -->
<svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">...</svg>
\`\`\`

**Feather Icons** - Minimal, clean
\`\`\`html
<script src="https://unpkg.com/feather-icons"></script>
<script>feather.replace()</script>
<!-- Usage: <i data-feather="check"></i> -->
\`\`\`

**Lucide Icons** - Feather fork, more icons
\`\`\`html
<script src="https://unpkg.com/lucide@latest"></script>
<script>lucide.createIcons();</script>
<!-- Usage: <i data-lucide="check"></i> -->
\`\`\`

### Animation Libraries (optional)

**AOS (Animate On Scroll)**
\`\`\`html
<link rel="stylesheet" href="https://unpkg.com/aos@next/dist/aos.css">
<script src="https://unpkg.com/aos@next/dist/aos.js"></script>
<script>AOS.init();</script>
<!-- Usage: <div data-aos="fade-up">Content</div> -->
\`\`\`

**Animate.css**
\`\`\`html
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/animate.css/4.1.1/animate.min.css">
<!-- Usage: <div class="animate__animated animate__fadeIn">Content</div> -->
\`\`\`

**CSS Transitions** - No library needed
\`\`\`css
.element {
  transition: transform 0.3s ease, opacity 0.3s ease;
}
.element:hover {
  transform: translateY(-4px);
  opacity: 0.9;
}
\`\`\`

### Placeholder Images

**Picsum Photos**
\`\`\`html
<img src="https://picsum.photos/800/600" alt="Random image">
<img src="https://picsum.photos/800/600?random=1" alt="Specific random">
<img src="https://picsum.photos/800/600?grayscale" alt="Grayscale">
\`\`\`

**Unsplash Source**
\`\`\`html
<img src="https://source.unsplash.com/800x600/?nature" alt="Nature image">
<img src="https://source.unsplash.com/800x600/?office" alt="Office image">
\`\`\`

### Web Fonts

**Google Fonts**
\`\`\`html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Playfair+Display:wght@700&display=swap" rel="stylesheet">
<style>
  body { font-family: 'Inter', sans-serif; }
  h1, h2, h3 { font-family: 'Playfair Display', serif; }
</style>
\`\`\`

**System Font Stack** - No external request
\`\`\`css
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
}
\`\`\`

### Form Handling (for static hosting)

**Netlify Forms**
\`\`\`html
<form name="contact" method="POST" data-netlify="true">
  <input type="hidden" name="form-name" value="contact">
  <input type="email" name="email" required>
  <textarea name="message" required></textarea>
  <button type="submit">Send</button>
</form>
\`\`\`

**Formspree**
\`\`\`html
<form action="https://formspree.io/f/YOUR_ID" method="POST">
  <input type="email" name="email" required>
  <textarea name="message" required></textarea>
  <button type="submit">Send</button>
</form>
\`\`\`

**Basin**
\`\`\`html
<form action="https://usebasin.com/f/YOUR_ID" method="POST">
  <input type="email" name="email" required>
  <textarea name="message" required></textarea>
  <button type="submit">Send</button>
</form>
\`\`\`

## Project Structure

\`\`\`
/
├── PLAN.md                    # Project roadmap (create first!)
├── index.html                 # Homepage
├── about.html                 # About page
├── contact.html               # Contact page
├── templates/
│   ├── components/
│   │   ├── nav.hbs           # Navigation component
│   │   └── footer.hbs        # Footer component
│   └── partials/
│       ├── hero.hbs          # Reusable hero section
│       └── cta.hbs           # Call-to-action section
├── styles.css                 # Custom styles (if needed)
└── scripts/
    └── main.js               # Custom JavaScript (if needed)
\`\`\`

## Color Palette Guidelines

Choose accessible, professional color schemes:

\`\`\`javascript
// Example palettes

// Professional Blue
{ primary: '#2563EB', secondary: '#3B82F6', accent: '#F59E0B' }

// Modern Purple
{ primary: '#7C3AED', secondary: '#8B5CF6', accent: '#10B981' }

// Clean Teal
{ primary: '#0D9488', secondary: '#14B8A6', accent: '#F97316' }

// Warm Orange
{ primary: '#EA580C', secondary: '#F97316', accent: '#0EA5E9' }
\`\`\`

**Tools for color selection:**
- coolors.co - Generate palettes
- tailwindcss.com/docs/customizing-colors - Tailwind palette
- contrast-ratio.com - Check WCAG accessibility

## Planning Do's and Don'ts

### Do's
✅ Create PLAN.md before writing any code
✅ Choose ONE CSS framework and stick with it
✅ Plan all pages upfront
✅ Use CDN links for all external assets
✅ Consider mobile-first design
✅ Ensure color contrast meets WCAG AA (4.5:1 for text)
✅ Plan component reuse (nav, footer, cards)

### Don'ts
❌ Don't skip PLAN.md - it saves time later
❌ Don't mix multiple CSS frameworks
❌ Don't use emojis for icons (use icon libraries)
❌ Don't plan for backend features (static sites only)
❌ Don't use npm/build tools (CDN only)
❌ Don't over-engineer - start simple
❌ Don't forget responsive breakpoints in your plan
`;
