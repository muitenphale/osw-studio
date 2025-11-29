/**
 * OSW One-Shot - Built-in Skill
 * Efficient complete site building in single sessions
 */

export const OSW_ONE_SHOT_SKILL = String.raw`---
name: osw-one-shot
description: Read when building landing pages, page layouts, or complete sites. Covers execution order, Handlebars components, CDN resources, and efficient page structure.
---

# OSW Studio One-Shot Site Building

## Purpose
This skill helps you build complete multi-page websites efficiently in a single session. Focus on visible progress and systematic execution.

## Core Principle: Visible Progress First

Users want to see results quickly. The execution order matters:

1. **Reusable components first** - nav.hbs, footer.hbs
2. **Homepage second** - index.html shows immediate progress
3. **Other pages third** - about, contact, etc.
4. **Polish last** - animations, mobile menu, refinements

## Execution Order

### Step 1: Create Components (5 min)

\`\`\`bash
mkdir -p /templates/components
\`\`\`

**Navigation Component** (/templates/components/nav.hbs):
\`\`\`handlebars
<nav class="bg-white shadow-sm sticky top-0 z-50">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="flex justify-between items-center h-16">
      <a href="/" class="font-bold text-xl text-primary">Brand</a>
      <div class="hidden md:flex space-x-8">
        <a href="/" class="text-gray-700 hover:text-primary transition-colors">Home</a>
        <a href="/about.html" class="text-gray-700 hover:text-primary transition-colors">About</a>
        <a href="/contact.html" class="text-gray-700 hover:text-primary transition-colors">Contact</a>
      </div>
      <button class="md:hidden p-2" id="mobile-menu-btn" aria-label="Toggle menu">
        <i class="fa-solid fa-bars text-xl"></i>
      </button>
    </div>
    <!-- Mobile menu -->
    <div class="hidden md:hidden pb-4" id="mobile-menu">
      <a href="/" class="block py-2 text-gray-700">Home</a>
      <a href="/about.html" class="block py-2 text-gray-700">About</a>
      <a href="/contact.html" class="block py-2 text-gray-700">Contact</a>
    </div>
  </div>
</nav>
\`\`\`

**Footer Component** (/templates/components/footer.hbs):
\`\`\`handlebars
<footer class="bg-gray-900 text-white py-12">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
      <div>
        <h3 class="font-bold text-lg mb-4">Brand</h3>
        <p class="text-gray-400">Your tagline or description here.</p>
      </div>
      <div>
        <h4 class="font-semibold mb-4">Quick Links</h4>
        <ul class="space-y-2">
          <li><a href="/" class="text-gray-400 hover:text-white transition-colors">Home</a></li>
          <li><a href="/about.html" class="text-gray-400 hover:text-white transition-colors">About</a></li>
          <li><a href="/contact.html" class="text-gray-400 hover:text-white transition-colors">Contact</a></li>
        </ul>
      </div>
      <div>
        <h4 class="font-semibold mb-4">Connect</h4>
        <div class="flex space-x-4">
          <a href="#" class="text-gray-400 hover:text-white transition-colors" aria-label="Twitter">
            <i class="fa-brands fa-twitter text-xl"></i>
          </a>
          <a href="#" class="text-gray-400 hover:text-white transition-colors" aria-label="GitHub">
            <i class="fa-brands fa-github text-xl"></i>
          </a>
          <a href="#" class="text-gray-400 hover:text-white transition-colors" aria-label="LinkedIn">
            <i class="fa-brands fa-linkedin text-xl"></i>
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

### Step 2: Build Homepage (index.html)

This is where users see progress. Build it complete before moving on.

\`\`\`html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Site Title</title>

  <!-- CSS Framework -->
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

  <!-- Icons -->
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">

  <!-- Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
  <style>body { font-family: 'Inter', sans-serif; }</style>

  <!-- Animation (optional) -->
  <link rel="stylesheet" href="https://unpkg.com/aos@next/dist/aos.css">
</head>
<body class="bg-white">
  {{> components/nav}}

  <!-- Hero Section -->
  <section class="py-20 bg-gradient-to-br from-primary to-secondary text-white">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
      <h1 class="text-4xl md:text-6xl font-bold mb-6" data-aos="fade-up">
        Your Headline Here
      </h1>
      <p class="text-xl md:text-2xl mb-8 opacity-90" data-aos="fade-up" data-aos-delay="100">
        A compelling subheadline that explains your value proposition.
      </p>
      <div class="flex flex-col sm:flex-row gap-4 justify-center" data-aos="fade-up" data-aos-delay="200">
        <a href="#" class="bg-white text-primary px-8 py-3 rounded-lg font-semibold hover:bg-gray-100 transition-colors">
          Get Started
        </a>
        <a href="#" class="border-2 border-white px-8 py-3 rounded-lg font-semibold hover:bg-white hover:text-primary transition-colors">
          Learn More
        </a>
      </div>
    </div>
  </section>

  <!-- Features Section -->
  <section class="py-20">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <h2 class="text-3xl font-bold text-center mb-12">Features</h2>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div class="text-center p-6" data-aos="fade-up">
          <div class="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <i class="fa-solid fa-rocket text-2xl text-primary"></i>
          </div>
          <h3 class="text-xl font-semibold mb-2">Feature One</h3>
          <p class="text-gray-600">Description of this amazing feature and its benefits.</p>
        </div>
        <div class="text-center p-6" data-aos="fade-up" data-aos-delay="100">
          <div class="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <i class="fa-solid fa-shield text-2xl text-primary"></i>
          </div>
          <h3 class="text-xl font-semibold mb-2">Feature Two</h3>
          <p class="text-gray-600">Description of this amazing feature and its benefits.</p>
        </div>
        <div class="text-center p-6" data-aos="fade-up" data-aos-delay="200">
          <div class="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <i class="fa-solid fa-chart-line text-2xl text-primary"></i>
          </div>
          <h3 class="text-xl font-semibold mb-2">Feature Three</h3>
          <p class="text-gray-600">Description of this amazing feature and its benefits.</p>
        </div>
      </div>
    </div>
  </section>

  <!-- CTA Section -->
  <section class="py-20 bg-gray-50">
    <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
      <h2 class="text-3xl font-bold mb-4">Ready to Get Started?</h2>
      <p class="text-xl text-gray-600 mb-8">Join thousands of satisfied customers today.</p>
      <a href="/contact.html" class="bg-primary text-white px-8 py-3 rounded-lg font-semibold hover:bg-primary/90 transition-colors inline-block">
        Contact Us
      </a>
    </div>
  </section>

  {{> components/footer}}

  <!-- Scripts -->
  <script src="https://unpkg.com/aos@next/dist/aos.js"></script>
  <script>
    AOS.init({ duration: 800, once: true });

    // Mobile menu toggle
    const menuBtn = document.getElementById('mobile-menu-btn');
    const mobileMenu = document.getElementById('mobile-menu');
    if (menuBtn && mobileMenu) {
      menuBtn.addEventListener('click', () => {
        mobileMenu.classList.toggle('hidden');
      });
    }
  </script>
</body>
</html>
\`\`\`

### Step 3: Build Remaining Pages

Use the same structure - just change the main content:

**Page Template:**
\`\`\`html
<!DOCTYPE html>
<html lang="en">
<head>
  <!-- Same head content as index.html -->
</head>
<body class="bg-white">
  {{> components/nav}}

  <!-- Page-specific content here -->

  {{> components/footer}}

  <!-- Same scripts as index.html -->
</body>
</html>
\`\`\`

### Step 4: Add Interactivity (if needed)

Common patterns:

**Mobile Menu Toggle:**
\`\`\`javascript
const menuBtn = document.getElementById('mobile-menu-btn');
const mobileMenu = document.getElementById('mobile-menu');
menuBtn?.addEventListener('click', () => mobileMenu?.classList.toggle('hidden'));
\`\`\`

**Smooth Scroll:**
\`\`\`html
<style>html { scroll-behavior: smooth; }</style>
\`\`\`

**Form Validation:**
\`\`\`javascript
document.querySelector('form')?.addEventListener('submit', (e) => {
  const email = document.querySelector('input[type="email"]');
  if (!email?.value.includes('@')) {
    e.preventDefault();
    alert('Please enter a valid email');
  }
});
\`\`\`

## Mobile-First Approach

Always design for mobile first, then add tablet/desktop overrides:

\`\`\`html
<!-- Mobile: stacked, small text -->
<div class="p-4 text-sm">
  <!-- Tablet: side padding, medium text -->
  <div class="md:px-8 md:text-base">
    <!-- Desktop: max width, large text -->
    <div class="lg:max-w-7xl lg:mx-auto lg:text-lg">
      Content
    </div>
  </div>
</div>
\`\`\`

**Common Breakpoints (Tailwind):**
- \`sm:\` - 640px (large phones)
- \`md:\` - 768px (tablets)
- \`lg:\` - 1024px (laptops)
- \`xl:\` - 1280px (desktops)

## Quick CDN Reference

\`\`\`html
<!-- Tailwind CSS -->
<script src="https://cdn.tailwindcss.com"></script>

<!-- Bootstrap 5 -->
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">

<!-- FontAwesome -->
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">

<!-- AOS Animation -->
<link rel="stylesheet" href="https://unpkg.com/aos@next/dist/aos.css">
<script src="https://unpkg.com/aos@next/dist/aos.js"></script>

<!-- Google Fonts (Inter) -->
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
\`\`\`

## Execution Do's and Don'ts

### Do's
✅ Build components before pages
✅ Complete index.html before other pages
✅ Test in preview after each major section
✅ Use consistent spacing (Tailwind: py-20 for sections)
✅ Add aria-labels to icon-only buttons
✅ Include mobile menu from the start
✅ Use transition-colors for hover effects

### Don'ts
❌ Don't build pages in random order
❌ Don't skip the mobile menu
❌ Don't forget to initialize AOS if using it
❌ Don't use fixed heights (use min-h instead)
❌ Don't forget responsive classes
❌ Don't leave placeholder text in final version

## Quality Checklist

Before considering complete:

- [ ] All pages use nav/footer components
- [ ] Mobile responsive (test at 375px width)
- [ ] Mobile menu works
- [ ] All links work
- [ ] No console errors
- [ ] Images have alt text
- [ ] Forms have proper labels
- [ ] Animations initialized (if using AOS)
- [ ] Hover states on interactive elements
- [ ] Footer has current year

## Performance Tips

- **Lazy load images below fold:** \`loading="lazy"\`
- **Preconnect to font servers:** Already in template
- **Use CDN versions:** Cached globally
- **Minimize custom JS:** Use CSS transitions when possible
- **Compress images:** Use Picsum size parameters

## Summary

**One-Shot Execution:**
1. 🧩 Components (nav.hbs, footer.hbs)
2. 🏠 index.html (complete with hero, features, CTA)
3. 📄 Other pages (about, contact)
4. ✨ Polish (animations, mobile menu)
5. ✅ Test in preview

**Speed Tips:**
- Copy the full page template, modify content
- Reuse section patterns across pages
- Keep styles consistent with Tailwind utilities
- Test early, test often
`;
