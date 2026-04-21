/**
 * Frontend Design - Built-in Skill
 * Universal design principles and aesthetic direction selection
 */

export const FRONTEND_DESIGN_SKILL = `---
name: frontend-design
description: Create distinctive, production-grade frontend interfaces with high design quality. Use this skill when the user asks to build web components, pages, artifacts, posters, or applications (examples include websites, landing pages, dashboards, React components, HTML/CSS layouts, or when styling/beautifying any web UI). Generates creative, polished code and UI design that avoids generic AI aesthetics.
---

This skill establishes universal design principles and requires you to commit to a specific aesthetic direction before writing code. For deeper guidance, read the aesthetic sub-skill that matches your chosen direction.

## Step 1: Design Intent (Required)

Before writing any code, output a design intent block as a comment at the top of your first file. Making these decisions explicitly prevents defaulting to generic patterns.

\`\`\`
/*
 * DESIGN INTENT
 * Tone: [one phrase — e.g., "dark cinematic", "bright editorial", "warm minimal", "bold geometric"]
 * Fonts: [display] + [body] — e.g., "Cormorant Garamond 300 + DM Sans 400"
 * Palette: [bg] [surface] [text] [accent] — e.g., "#0a0a0a #141414 #e8e6e1 #c4841d"
 * Layout: [one phrase — e.g., "asymmetric split hero, full-bleed color blocks"]
 * Memorable element: [the one thing someone remembers — e.g., "oversized serif hero text"]
 */
\`\`\`

Every decision below flows from this block. If a technique doesn't match the stated tone, don't use it.

## Step 2: Choose an Aesthetic Direction

After setting your design intent, read the sub-skill that best matches your tone. Each one is a complete recipe — specific fonts, colors, spacing, motion, and component patterns. Following one produces a cohesive, opinionated result instead of a generic mix.

**Available aesthetics:**

| Sub-skill | Tone | Good for |
|-----------|------|----------|
| \`frontend-design-bold-geometric\` | High contrast, massive type, kinetic energy | Product launches, brand sites, portfolios with attitude |
| \`frontend-design-soft-organic\` | Warm, rounded, gentle, approachable | SaaS, wellness, consumer products, friendly startups |
| \`frontend-design-editorial\` | Serif-forward, content-dense, magazine-like | Blogs, publications, long-form portfolios, news |
| \`frontend-design-minimal\` | Extreme whitespace, monochrome, restrained | Luxury brands, architecture, photography, high-end portfolios |

Read the matching sub-skill with: \`cat /.skills/frontend-design-{name}.md\`

If the project doesn't clearly fit one aesthetic, pick the closest match and adapt. Blending two is fine as long as the Design Intent block states your choices clearly. When in doubt, default to bold-geometric for marketing/product sites and soft-organic for apps/tools.

## Universal Principles

These apply regardless of which aesthetic you choose.

### Typography

Pick two fonts: a display font for headings and a body font for text. The sub-skill specifies exact pairings, but these rules are universal:

- **Size hierarchy matters.** Hero headings should be dramatically larger than body text. Use \`clamp()\` for fluid scaling. Timid size differences (2rem heading, 1rem body) create monotony.
- **Weight as a tool.** Light weights (300) on large text create elegance. Heavy weights (700–800) create impact. Mixing both adds range.
- **Never default to system fonts.** Arial, Helvetica, system-ui as primary fonts signal "no design thought went into this."

### Color

- **Three text tiers, not two.** Headings (full), body (muted), captions/metadata (dim). Two tiers makes body text either compete with headings or disappear.
- **Tint your neutrals.** Pure grays (#999, #666) feel dead. Warm-shift for warm designs, cool-shift for cool ones.
- **One accent, used sparingly.** CTAs, active states, key highlights. Per-item color variants are fine if systematic.

### Spacing & Layout

- **Generous section padding (5–8rem vertical)** is the clearest signal of professional design.
- **Content width variation.** Body text narrow (max 640px), headings wider, images and color blocks full-bleed. The contrast creates rhythm.
- **Vary spacing between sections** rather than making everything uniform.

### Images

When using stock photography (Unsplash URLs work without API keys: \`https://images.unsplash.com/photo-{id}?w={width}&q=80&fit=crop\`):

- All images: \`object-fit: cover\`, consistent border-radius matching the tone.
- Dark overlay on hero images for text readability.
- Image strips (3 side-by-side, 35–45vh) provide visual breathing room between content sections.

### Interaction

All interactive elements need hover feedback. This is non-negotiable regardless of aesthetic:
- Cards: translate up 4–6px, deepen shadow. Transition 0.4–0.6s ease-out.
- Links/buttons: color change, underline transition, or subtle scale (1.02).
- Images in cards: scale 1.03–1.05 with overflow hidden.

### Mobile & Responsive

- Touch targets: minimum 44px for all interactive elements.
- Stack split layouts vertically on mobile.
- Fluid typography via \`clamp()\`.
- Navigation must collapse on mobile (hamburger pattern).
- Read the \`responsive\` skill for complete mobile guidance.

### Selection & Scrollbar

Small details that signal intentionality:
- \`::selection\` color matching the accent.
- Custom scrollbar: thin track in surface color, thumb in accent. Or hide entirely for immersive layouts.

## What to Avoid

These patterns make interfaces look AI-generated:

- Same font for headings and body with no weight/size distinction
- Neutral grays without warm or cool tinting
- Uniform spacing — every section padded identically
- Everything centered and symmetrical for the entire page
- Single background tone throughout with no surface variation
- Inconsistent border-radius — pick a radius language and commit
- No hover states on interactive elements
- Purple-to-blue gradients on white backgrounds
- Using the same font (Space Grotesk, Inter, etc.) across every generation
- Scroll hijacking or libraries that override native scroll
- Bounce/elastic easing — subtle ease-out feels more refined
`;
