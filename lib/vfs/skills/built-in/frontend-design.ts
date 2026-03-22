/**
 * Frontend Design - Built-in Skill
 * Visual design quality guidelines for distinctive, polished interfaces
 */

export const FRONTEND_DESIGN_SKILL = String.raw`---
name: frontend-design
description: Read when building visually polished pages, landing pages, dashboards, or portfolios. Covers typography, color, layout, motion, and avoiding generic aesthetics.
---

# Frontend Design Quality

This skill guides creation of visually distinctive interfaces that avoid generic AI aesthetics. It covers the aesthetic layer — typography, color, composition, motion, and atmosphere. For project structure and execution order, see the workflow skill.

## Design Thinking

Before writing any CSS, commit to an aesthetic direction. Every project should feel intentionally designed for its context, not assembled from defaults.

**Pick a tone** and execute it with consistency. A few examples: brutally minimal, maximalist/layered, editorial/magazine, retro/vintage, brutalist/raw, soft/pastel, dark & cinematic, geometric/art deco. There are many more — the point is to choose one and commit. A cohesive simple design always beats an inconsistent elaborate one.

**What makes it memorable?** Identify the one visual element someone will remember — an unusual color, a striking typographic choice, an unexpected layout. Design around that anchor.

## Typography

Typography is the single highest-impact design choice. Pick two fonts maximum — a distinctive display font for headings and a clean body font for text. The pairing should reflect the project's tone.

Some strong Google Fonts pairings for inspiration:
- Playfair Display + Source Sans 3 (editorial), Sora + DM Sans (geometric), Fraunces + Outfit (warm), Cormorant Garamond + Lato (luxurious), Archivo Black + Work Sans (impactful)

Make headings dramatically larger than body text — timid size differences create visual monotony. A hero headline at 3-4.5rem against 1rem body text creates real hierarchy.

Don't default to a single generic font (Arial, system-ui) for everything. That's the fastest way to look templated.

## Color & Theme

Build a color system with CSS custom properties — a dominant color, one sharp accent, surface tones, and text colors. A dominant-plus-accent approach outperforms evenly distributed multi-color palettes.

For dark themes, avoid pure black (#000) — use #0a0a0a or #111. For light themes, use warm (#fafaf9) or cool (#f8fafc) off-whites instead of #fff. Tint your grays warm or cool rather than using neutral #999.

Ensure text-on-background contrast meets WCAG AA (4.5:1). Use accent color sparingly — CTAs, active states, key highlights only.

Avoid purple-to-blue gradients on white backgrounds — they're the most overused AI-generated palette.

## Spatial Composition

Generous spacing is the clearest signal of professional design. Sections need real breathing room (5-8rem padding), not token spacing. Vary padding between sections rather than making everything uniform.

Not every section needs to be centered-and-stacked. Consider asymmetric layouts, overlapping elements that break into adjacent sections, full-bleed sections alternating with contained content, and varied column widths. Body text should max out around 65-75 characters per line (~42rem) for readability.

## Backgrounds & Atmosphere

Flat solid-color backgrounds feel lifeless. Create depth and atmosphere with subtle gradients, mesh/radial gradient layers, noise or grain textures (SVG filter overlays), geometric patterns, or layered transparencies. Match the technique to the aesthetic — a brutalist site uses raw textures differently than a luxury one.

Alternate between light and dark sections for visual rhythm. This creates natural content separation without relying on borders or dividers.

## Motion & Interaction

Every interactive element should respond to interaction — hover states on cards, links, and buttons are table stakes. Use CSS transitions (transform, opacity, box-shadow) rather than animating layout properties.

For scroll-triggered reveals, use IntersectionObserver to add a class when elements enter the viewport. Keep motion purposeful — pick a few key moments rather than animating everything. Excessive bounce and elastic easing looks cheap; subtle ease-out movements feel more refined.

## Shadows & Depth

Single box-shadows look flat. Layer multiple shadows at different offsets and opacities for realistic elevation — a tight shadow for definition, a medium spread for depth, and a large soft shadow for atmosphere.

## What to Avoid

These patterns make interfaces look AI-generated and generic:
- Same font for everything, no display/body distinction
- Uniform spacing — every section padded identically
- Everything centered and symmetrical
- Inconsistent border-radius — pick sharp, subtle, or rounded and commit
- No hover states — interactive elements feel dead
- Neutral gray text (#999) instead of warm or cool tinted grays
- Equal-width everything — no variation in content width
- Single background tone throughout — no light/dark rhythm
- Placeholder content left in — replace all Lorem ipsum with realistic text
`;
