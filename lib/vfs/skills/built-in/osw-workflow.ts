/**
 * OSW Studio Workflow - Built-in Skill
 * Complete workflow for building websites in OSW Studio
 */

export const OSW_WORKFLOW_SKILL = String.raw`---
name: osw-workflow
description: Complete workflow for building websites in OSW Studio - planning, tech stack, execution order, and best practices for one-shot page building
---

# OSW Studio Website Building Workflow

## Purpose
This skill provides the complete workflow for building websites in OSW Studio, from planning to execution. Follow this guide for efficient, visible progress and professional results.

## Phase 1: Planning & Tech Stack

### Create PLAN.md First
**Always start by creating \`/PLAN.md\`** - this is your roadmap:

\`\`\`bash
touch /PLAN.md
echo '# Project Plan

## Overview
[Brief description of the website]

## Pages
- index.html - [Description]
- about.html - [Description]
- contact.html - [Description]

## Tech Stack
- Tailwind CSS (via CDN)
- [Motion library if needed]
- [Form solution if needed]
- Google Fonts: [Font names]
- Color Palette: [Colors]
- Icons: FontAwesome (via CDN)
- Images: Picsum Photos

## Component Structure
- /templates/components/nav.hbs
- /templates/components/footer.hbs
- /templates/partials/[other partials]

## Execution Order
1. Create base Handlebars components (nav, footer)
2. Build index.html (visible progress first!)
3. Build remaining pages
4. Add interactivity/animations
5. Test and refine
' > /PLAN.md
\`\`\`

### OSW-Compatible Tech Stack

#### CSS Framework: Tailwind CSS
\`\`\`html
<!-- Add to all .html files in <head> -->
<script src="https://cdn.tailwindcss.com"></script>
<script>
  tailwind.config = {
    theme: {
      extend: {
        colors: {
          primary: '#3B82F6',
          secondary: '#8B5CF6',
          // Add your palette colors
        }
      }
    }
  }
</script>
\`\`\`

#### Motion/Animation: Framer Motion or AOS
\`\`\`html
<!-- AOS (Animate On Scroll) - Simpler option -->
<link rel="stylesheet" href="https://unpkg.com/aos@next/dist/aos.css" />
<script src="https://unpkg.com/aos@next/dist/aos.js"></script>
<script>AOS.init();</script>

<!-- Or use CSS animations with Tailwind -->
\`\`\`

#### Forms: Netlify Forms
\`\`\`html
<!-- Netlify-ready form (works when deployed) -->
<form name="contact" method="POST" data-netlify="true">
  <input type="hidden" name="form-name" value="contact">
  <input type="email" name="email" required>
  <textarea name="message" required></textarea>
  <button type="submit">Send</button>
</form>
\`\`\`

#### Fonts: Google Fonts
\`\`\`html
<!-- Add to <head> -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Playfair+Display:wght@700&display=swap" rel="stylesheet">
<style>
  body { font-family: 'Inter', sans-serif; }
  h1, h2, h3 { font-family: 'Playfair Display', serif; }
</style>
\`\`\`

#### Icons: FontAwesome (NOT Emojis)
\`\`\`html
<!-- Add to <head> -->
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">

<!-- Use in HTML -->
<i class="fa-solid fa-check"></i>
<i class="fa-brands fa-github"></i>
\`\`\`

**Why no emojis?**
- Inconsistent rendering across devices
- Professional appearance
- Better accessibility
- Icon fonts offer more control

#### Images: Picsum Photos
\`\`\`html
<!-- Placeholder images -->
<img src="https://picsum.photos/800/600?random=1" alt="Description">
<img src="https://picsum.photos/400/300?random=2" alt="Description">

<!-- Specific size and style -->
<img src="https://picsum.photos/1200/400?grayscale&blur=2" alt="Hero background">
\`\`\`

#### Color Palettes
Choose aesthetic, accessible color schemes:
\`\`\`javascript
// Example professional palette
{
  primary: '#2563EB',    // Blue
  secondary: '#7C3AED',  // Purple
  accent: '#F59E0B',     // Amber
  neutral: {
    50: '#F9FAFB',
    900: '#111827'
  }
}

// Use tools like:
// - coolors.co
// - tailwindcss.com/docs/customizing-colors
// Ensure WCAG AA contrast ratios
\`\`\`

## Phase 2: Handlebars Setup

### Understanding Handlebars in OSW
OSW Studio compiles \`.hbs\`/\`.handlebars\` files to static HTML at build time:
- Partials for reusable components
- Templates compile automatically
- No runtime overhead

### Create Reusable Components

#### Navigation Component
\`\`\`bash
mkdir -p /templates/components
touch /templates/components/nav.hbs
\`\`\`

\`\`\`handlebars
<!-- /templates/components/nav.hbs -->
<nav class="bg-white shadow-sm sticky top-0 z-50">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="flex justify-between items-center h-16">
      <a href="/" class="font-bold text-xl text-primary">Brand</a>
      <div class="hidden md:flex space-x-8">
        <a href="/" class="text-gray-700 hover:text-primary">Home</a>
        <a href="/about.html" class="text-gray-700 hover:text-primary">About</a>
        <a href="/contact.html" class="text-gray-700 hover:text-primary">Contact</a>
      </div>
      <button class="md:hidden" id="mobile-menu-btn">
        <i class="fa-solid fa-bars text-2xl"></i>
      </button>
    </div>
  </div>
</nav>
\`\`\`

#### Footer Component
\`\`\`bash
touch /templates/components/footer.hbs
\`\`\`

\`\`\`handlebars
<!-- /templates/components/footer.hbs -->
<footer class="bg-gray-900 text-white py-12">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
      <div>
        <h3 class="font-bold text-lg mb-4">Brand</h3>
        <p class="text-gray-400">Your tagline here</p>
      </div>
      <div>
        <h4 class="font-semibold mb-4">Quick Links</h4>
        <ul class="space-y-2">
          <li><a href="/" class="text-gray-400 hover:text-white">Home</a></li>
          <li><a href="/about.html" class="text-gray-400 hover:text-white">About</a></li>
          <li><a href="/contact.html" class="text-gray-400 hover:text-white">Contact</a></li>
        </ul>
      </div>
      <div>
        <h4 class="font-semibold mb-4">Connect</h4>
        <div class="flex space-x-4">
          <a href="#" class="text-gray-400 hover:text-white">
            <i class="fa-brands fa-twitter text-xl"></i>
          </a>
          <a href="#" class="text-gray-400 hover:text-white">
            <i class="fa-brands fa-github text-xl"></i>
          </a>
        </div>
      </div>
    </div>
    <div class="border-t border-gray-800 mt-8 pt-8 text-center text-gray-400">
      <p>&copy; 2025 Brand. All rights reserved.</p>
    </div>
  </div>
</footer>
\`\`\`

### Using Components in Pages
\`\`\`handlebars
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Page Title</title>
  <!-- CDN links here -->
</head>
<body>
  {{> components/nav}}

  <!-- Page content -->

  {{> components/footer}}
</body>
</html>
\`\`\`

## Phase 3: Execution Order (Critical!)

### Why Start with index.html?
**Visible progress is essential** - users see results immediately:

1. **Create components first** (\`nav.hbs\`, \`footer.hbs\`)
2. **Build index.html second** - users can see the homepage working
3. **Build remaining pages** - about, contact, etc.
4. **Add interactivity last** - animations, mobile menu, etc.

### Example Execution Sequence
\`\`\`bash
# 1. Create PLAN.md
touch /PLAN.md
echo '[plan content]' > /PLAN.md

# 2. Set up Handlebars components
mkdir -p /templates/components
touch /templates/components/nav.hbs
touch /templates/components/footer.hbs
# Write component content...

# 3. Create index.html (PRIORITY!)
touch /index.html
# Write full homepage with hero, features, CTA...

# 4. Create other pages
touch /about.html
touch /contact.html
# Write content...

# 5. Add interactivity
touch /script.js
# Mobile menu toggle, form validation, etc.

# 6. Add global styles if needed
touch /styles.css
# Custom animations, overrides, etc.
\`\`\`

## Phase 4: Available Commands

### File Operations
\`\`\`bash
# List files
ls /
tree /

# Create files/directories
touch /index.html
mkdir -p /templates/components
echo 'content' > /file.txt

# Read files
cat /index.html
head -n 20 /PLAN.md

# Search
grep -r "className" /
rg "function" /script.js

# Copy/move/delete
cp /index.html /backup.html
mv /old.html /new.html
rm /unnecessary.html
\`\`\`

### File Editing (json_patch)
Use \`json_patch\` tool for file modifications:
- Add new sections
- Update existing content
- Replace components

### Checking Progress
Read the preview or specific files to verify work:
\`\`\`bash
cat /index.html
cat /PLAN.md
\`\`\`

## Phase 5: Best Practices

### Do's
✅ Create PLAN.md before coding
✅ Start with index.html for visible progress
✅ Use Tailwind CSS for rapid styling
✅ Use FontAwesome icons (NOT emojis)
✅ Use Picsum for placeholder images
✅ Create Handlebars components for nav/footer
✅ Use CDN links for all external assets
✅ Ensure mobile responsiveness
✅ Follow accessible color contrast (WCAG AA)
✅ Test in preview after each major step

### Don'ts
❌ Don't use emojis (use FontAwesome icons instead)
❌ Don't create backend/server code (static sites only)
❌ Don't use runtime JavaScript frameworks (React/Vue/etc.)
❌ Don't skip PLAN.md
❌ Don't build pages in random order
❌ Don't use complex build tools
❌ Don't add dependencies that require npm install
❌ Don't create overly complex directory structures

### Mobile-First Approach
Always design for mobile first:
\`\`\`html
<!-- Mobile default -->
<div class="p-4 text-center">
  <!-- Tablet override -->
  <div class="md:text-left md:p-8">
    <!-- Desktop override -->
    <div class="lg:p-12 lg:max-w-7xl lg:mx-auto">
      <!-- Content -->
    </div>
  </div>
</div>
\`\`\`

### Performance
- Use CDN links (already cached by browsers)
- Lazy load images below the fold
- Minimize inline scripts
- Compress images via Picsum parameters

## Phase 6: Example Project Structure

\`\`\`
/
├── PLAN.md                          # Project roadmap
├── index.html                       # Homepage (build first!)
├── about.html                       # About page
├── contact.html                     # Contact page
├── templates/
│   ├── components/
│   │   ├── nav.hbs                 # Navigation
│   │   └── footer.hbs              # Footer
│   └── partials/
│       ├── hero.hbs                # Reusable hero
│       └── cta.hbs                 # Call-to-action
├── styles.css                       # Optional custom CSS
└── script.js                        # Optional interactivity
\`\`\`

## Phase 7: Quality Checklist

Before considering the project complete:

- [ ] PLAN.md exists and is complete
- [ ] All pages use Handlebars nav/footer components
- [ ] Mobile responsive (test with browser dev tools)
- [ ] Accessible color contrast
- [ ] FontAwesome icons used (no emojis)
- [ ] All external assets use CDN links
- [ ] Forms use Netlify format (if applicable)
- [ ] Preview shows all pages working
- [ ] No console errors in browser
- [ ] Clean, semantic HTML structure

## Summary

**The OSW Studio Workflow:**
1. 📋 Create PLAN.md with tech stack and execution order
2. 🧩 Build Handlebars components (nav, footer)
3. 🏠 Create index.html FIRST (visible progress!)
4. 📄 Build remaining pages
5. ✨ Add interactivity and polish
6. ✅ Test and verify in preview

**Key Technologies:**
- Tailwind CSS (CDN)
- FontAwesome icons (NOT emojis)
- Picsum placeholder images
- Google Fonts
- Netlify Forms
- Handlebars templating
- AOS or CSS animations

**Remember:** Start with PLAN.md, build index.html second, and always prioritize visible progress!
`;
