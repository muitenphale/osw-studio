/**
 * Frontend Design - Built-in Skill
 * Universal design principles and aesthetic direction selection
 */

export const FRONTEND_DESIGN_SKILL = `---
name: frontend-design
description: Create distinctive, production-grade frontend interfaces with high design quality. Use this skill when the user asks to build web components, pages, artifacts, posters, or applications (examples include websites, landing pages, dashboards, React components, HTML/CSS layouts, or when styling/beautifying any web UI). Generates creative, polished code and UI design that avoids generic AI aesthetics.
---

This skill establishes universal design principles and requires you to commit to a specific aesthetic direction before writing code. For deeper guidance, read the aesthetic sub-skill that matches your chosen direction.

## Step 1: Pick an Extreme

Before writing any code, pick a clear aesthetic direction and commit to it. Tentative, "tasteful blend of two things" choices produce generic output. Bold maximalism and refined minimalism both work — the key is intentionality and follow-through, not intensity.

The design space is wide. Consider tones like:

> brutally minimal · maximalist chaos · retro-futuristic · organic/natural · luxury/refined · playful/toy-like · editorial/magazine · brutalist/raw · art-deco/geometric · soft/pastel · industrial/utilitarian · cinematic/dark · terminal/CLI · vaporwave · dark academia · swiss/grid · zine/cut-paste · botanical · bauhaus

Use these for inspiration. Pick one tone and design *true to it* — don't water it down toward a safe middle.

## Step 2: Output a Design Intent Block

Output a design intent block as a comment at the top of your first file. Making these decisions explicitly prevents defaulting to generic patterns.

\`\`\`
/*
 * DESIGN INTENT
 * Tone: [one phrase — e.g., "dark cinematic", "bright editorial", "warm minimal", "bold geometric"]
 * Fonts: [display] + [body] — e.g., "Cormorant Garamond 300 + DM Sans 400"
 * Palette: [bg] [surface] [text] [accent] — e.g., "#0a0a0a #141414 #e8e6e1 #c4841d"
 * Layout signature: [one phrase describing what makes this layout distinctive — e.g., "asymmetric split hero, full-bleed color blocks", "single-column scroll with massive type"]
 * Memorable element: [the one thing someone remembers — e.g., "oversized serif hero text"]
 */
\`\`\`

Every decision below flows from this block. If a technique doesn't match the stated tone, don't use it.

## Step 3: Read the Matching Sub-skill

After committing to a tone, read the sub-skill that matches. Each sub-skill describes the aesthetic's character, color logic, typography feel, spacing rhythm, and motion intent — but deliberately does NOT prescribe page structure (no "you must have a stats strip" or "use a 3-column grid"). Layout composition is your judgment call; the sub-skill informs the *feel* of whatever layout you design.

**Available sub-skills:**

| Sub-skill | Tone | Good for |
|-----------|------|----------|
| \`frontend-design-bold-geometric\` | High contrast, massive type, kinetic energy | Product launches, brand sites, portfolios with attitude |
| \`frontend-design-soft-organic\` | Warm, rounded, gentle, approachable | SaaS, wellness, consumer products, friendly startups |
| \`frontend-design-editorial\` | Serif-forward, content-dense, magazine-like | Blogs, publications, long-form portfolios, news |
| \`frontend-design-minimal\` | Extreme whitespace, monochrome, restrained | Luxury brands, architecture, photography, gallery sites |
| \`frontend-design-brutalist\` | Raw, exposed, anti-design, defiantly ugly | Underground brands, art collectives, manifestos, music sites |
| \`frontend-design-retro-futuristic\` | Y2K chrome, synthwave, vaporwave, dated-future | Music, fashion, nostalgic tech, creative portfolios |
| \`frontend-design-art-deco\` | Geometric ornament, symmetry, gold-on-black opulence | Hospitality, luxury events, theaters, period brands |
| \`frontend-design-maximalist\` | Dense, layered, ornamental, more-is-more | Fashion, art, lifestyle, anything that wants to overwhelm |
| \`frontend-design-playful\` | Toy-like, bright, bouncy, illustrative | Kids brands, games, creative tools, joyful products |
| \`frontend-design-industrial\` | Utilitarian, monospace, data-dense, blueprint precision | Developer tools, technical products, infrastructure, dashboards |
| \`frontend-design-luxury\` | Refined opulence, dark serif elegance, gold accents | High-end fashion, jewelry, hospitality, private services |
| \`frontend-design-terminal\` | CLI aesthetic, monospace, command-prompt nostalgia | Hacker/dev tools, technical writing, retro-computing brands |

Read the matching sub-skill with: \`cat /.skills/frontend-design-{name}.md\`

If the project doesn't fit any of these cleanly, pick the closest and push it further toward an extreme — don't blend two into a safe middle. Blending is allowed only when the Design Intent block names exactly which tones and what each contributes.

## Universal Principles

These apply regardless of which aesthetic you choose.

### Match complexity to vision

Maximalist designs need elaborate code: extensive animation, layered effects, ornamental detail. Minimalist or refined designs need restraint: precise spacing, careful type, near-zero motion. A minimal site with twelve animations isn't minimal anymore; a maximalist site with one hover effect feels half-finished. The aesthetic dictates how much code is appropriate.

### Typography

Pick two fonts: a display font for headings and a body font for text. Sub-skills specify character requirements, but these rules are universal:

- **Size hierarchy matters.** Hero headings should be dramatically larger than body text when the aesthetic permits scale (most do; pure-minimal does not). Use \`clamp()\` for fluid scaling. Timid size differences (2rem heading, 1rem body) create monotony.
- **Weight as a tool.** Light weights (300) on large text create elegance. Heavy weights (700–800) create impact. Mixing both adds range.
- **Never default to system fonts.** Arial, Helvetica, system-ui as primary fonts signal "no design thought went into this" — unless the chosen aesthetic specifically calls for raw system type (brutalist, terminal).

### Color

- **Three text tiers, not two.** Headings (full), body (muted), captions/metadata (dim). Two tiers makes body text either compete with headings or disappear.
- **Tint your neutrals.** Pure grays (#999, #666) feel dead. Warm-shift for warm designs, cool-shift for cool ones. Pure neutrals are reserved for aesthetics that require austerity (minimal, industrial).
- **One accent, used sparingly.** CTAs, active states, key highlights. Per-item color variants are fine if systematic. Maximalist aesthetics override this — see that sub-skill.

### Spacing & Layout

- **Generous section padding** is the clearest signal of professional design. Most aesthetics want 5–8rem vertical between major sections. Editorial and industrial run tighter; minimal runs wider.
- **Content width variation creates rhythm.** Body text narrow (max 640px), headings wider, images and color blocks full-bleed. The contrast is what makes a page feel composed rather than uniform.
- **Vary spacing between sections** rather than making everything uniform.

### Images

When using stock photography (Unsplash URLs work without API keys: \`https://images.unsplash.com/photo-{id}?w={width}&q=80&fit=crop\`):

- All images: \`object-fit: cover\`, border-radius matching the chosen aesthetic.
- Dark overlay on hero images for text readability.
- Image strips (3 side-by-side, 35–45vh) provide visual breathing room between content sections.

### Interaction

All interactive elements need hover feedback. The *style* of feedback varies by aesthetic; the *presence* of feedback does not:
- Cards, buttons, links, images all need a hover state.
- Transition timing should match the aesthetic's energy: 0.2s for sharp/kinetic aesthetics, 0.4–0.6s for soft/organic, near-zero for minimal.

### Mobile & Responsive

- Touch targets: minimum 44px for all interactive elements.
- Stack split layouts vertically on mobile.
- Fluid typography via \`clamp()\`.
- Navigation must collapse on mobile (hamburger or equivalent pattern).
- Read the \`responsive\` skill for complete mobile guidance.

### Selection & Scrollbar

Small details that signal intentionality:
- \`::selection\` color matching the accent.
- Custom scrollbar: thin track in surface color, thumb in accent. Or hide entirely for immersive layouts.

## What to Avoid

These patterns make interfaces look AI-generated regardless of chosen aesthetic:

- Same font for headings and body with no weight/size distinction
- Pure neutral grays without warm or cool tinting (except in aesthetics that require it)
- Uniform spacing — every section padded identically
- Everything centered and symmetrical for the entire page (unless symmetry is the aesthetic point — art-deco)
- Single background tone throughout with no surface variation
- Inconsistent border-radius — pick a radius language and commit
- No hover states on interactive elements
- Purple-to-blue gradients on white backgrounds
- Reusing the same display font across generations (Space Grotesk, Inter as a display font, etc.)
- Scroll hijacking or libraries that override native scroll
- Bounce/elastic easing on serious aesthetics — subtle ease-out feels more refined
- Adding "a little of everything" — if you can't name one signature element someone will remember, the design isn't finished
`;
