/**
 * Frontend Design: Minimal - Built-in Skill
 * Extreme whitespace, monochrome, restrained elegance
 */

export const FRONTEND_DESIGN_MINIMAL_SKILL = `---
name: frontend-design-minimal
description: Minimal aesthetic — extreme whitespace, monochrome palette with one accent, restrained elegance. Use for luxury brands, architecture firms, photography portfolios, high-end products, and any design where less is genuinely more.
---

# Minimal Aesthetic

> **Parent skill:** Read \`/.skills/frontend-design.md\` first for the required Design Intent block, universal principles (typography tiers, color construction, spacing, interaction, mobile, anti-patterns), and image/responsive guidance that apply to every aesthetic.

Extreme whitespace. Monochrome. Restrained. This aesthetic communicates confidence through what it removes — every element that remains earns its place. Think Apple product pages, architectural studio sites, high-end fashion, luxury brands, gallery portfolios.

Every decision should pass the test: "does removing this make the design worse?" If the answer is no, remove it.

## Typography

**Display font character:** Light weight (300–400) on a clean, precise sans-serif. The thinness IS the statement — heavy type creates impact, light type creates sophistication. Look for typefaces with excellent optical quality at light weights, clean geometry, and good spacing. The font should feel engineered and precise, not decorative.

**Body font character:** The same font family at regular weight, or a very similar sans-serif. Minimal means minimal font variety — using one font family for everything is valid here and reinforces the restraint.

**Find fonts that vary from project to project.** Browse Google Fonts for sans-serifs that have good light (300) weights. Test them at large sizes — some fonts fall apart when thin. Look for clean, geometric or neo-grotesque designs. Each project should use a different typeface.

**Scale:** NOT massive — minimalism is about proportion, not scale. Hero headlines should be large enough to establish hierarchy but not screaming. Body text at standard size with generous line-height (1.7–1.8) — the extra air compensates for the quiet typography. Labels and captions in small uppercase with wide letter-spacing (0.1–0.15em) — this is a signature minimal element. The tracking creates horizontal rhythm.

**Treatment:** Sentence case or lowercase. Never all-uppercase for headings (except labels/captions). Wide letter-spacing on headings (0.02–0.05em). Line-height 1.2–1.3 for display text. The text should feel like it's breathing, not packed.

## Color

**Monochrome with ONE accent.** The accent is used so sparingly that when it appears, it commands attention.

**Base construction:** True neutrals — not warm-shifted, not cool-shifted. Pure or near-pure whites, grays, and blacks. This is the one aesthetic where neutral grays aren't dead — the lack of warmth or coolness IS the point. The purity communicates control.

**Accent strategy:** Two approaches, choose one per project:
1. **Black as accent** — on a white base, black itself is the emphasis. "Accent" means bold weight, a filled button, a dark block. No color at all.
2. **Single restrained color** — one tone used in exactly 2–3 places per page: a link color, one CTA, maybe a thin decorative line. Not saturated neon — a tone with enough personality to register but not enough to distract.

**No tinted neutrals, no colored shadows, no gradient tints.** Every color trick that adds warmth or character is deliberate left out. The austerity is the aesthetic.

**Vary per project.** Swap between pure monochrome, warm stone tones (rare warmth exception for specific luxury contexts), and cool blue-gray systems. The accent, when present, should be unexpected — a single unexpected hue that the viewer notices because everything else is so restrained.

## Layout

**Defined by negative space.** The grid is what's empty, not what's filled.

**Hero:** Large whitespace above and below. Centered text, narrow max-width (around 600px). No image, or a single full-bleed image with no text overlay. The hero might be just a sentence and a button surrounded by vast empty space.

**Content sections:** Single-column centered, narrow max-width for text (580px). Wide margins on both sides (10–15% of viewport on desktop). Elements widely spaced.

**Image presentation:** Full-bleed or precisely sized within the narrow column. One image per section. Images are the visual events — give them enormous breathing room (4–6rem or more above and below).

**Gallery (if applicable):** Simple grid with generous gap (2–3rem). No hover effects on the grid itself — clicking opens the image. The grid composition IS the design.

**Section padding:** The most generous of any aesthetic — 5–10rem vertical. This is where "extreme whitespace" lives. If it feels like too much space, it's probably right.

**Content width:** Body text narrow. Outer container moderate. Images can break wider but nothing should feel sprawling.

## Backgrounds & Depth

**None.** Flat backgrounds. No gradients, no textures, no ambient decoration, no blurred shapes, no grain, no noise.

**Rules only.** Thin hairlines (1px) in a light neutral between sections. This is the only structural decoration allowed. They create just enough separation.

**No shadows.** If you need to distinguish a card or container, use a thin border (1px, very light) or pure whitespace. Shadows add visual weight and depth cues that fight the flatness minimalism requires.

**No blur, no glow, no colored shadows.** Every visual effect adds noise that dilutes the signal.

## Motion

**Almost none.** The page loads. The content is there. That's it.

**The complete list of acceptable motion:**
- Page load: simple opacity fade, 0.3s. No transform, no stagger.
- Link hover: color transition, 0.3s.
- Image hover (in gallery): subtle opacity change (1 → 0.85), 0.4s.
- Button hover: fill/outline swap, 0.3s.

**That's all.** No scroll reveals, no staggered entrances, no parallax, no sliding, no scaling, no hero animations. Every animation you add dilutes the minimalism. If the page feels like it needs animation to be interesting, the content or typography isn't strong enough — fix that instead.

## Navigation

Extremely simple. Logo (text only, display font, light weight) on one side. 3–5 text links on the other. No CTA button in the nav — or if present, it's text-only with an underline, not a filled button. No background on the nav initially.

On scroll: optional thin border-bottom appears. No backdrop-filter, no background color, no shadow.

On mobile: hamburger icon with thin lines. Full-screen white overlay with centered links in the display font, widely spaced. The mobile nav should feel like a separate, calm page.

## Components

**Buttons:** Zero border-radius. Small uppercase text with wide letter-spacing. Generous padding. Two states only: filled (dark bg, light text) and outline (border, transparent bg). They swap on hover — filled becomes outline, outline becomes filled. No shadow, no scale, no translate. The interaction is a quiet inversion.

**Cards (when needed):** No background, no shadow. Content separated by whitespace or a thin bottom border. If a container is necessary, thin 1px border with no border-radius and generous internal padding.

**Footer:** Barely there. Logo, 3–4 links, copyright line. Everything in the dimmest text tier. A single thin rule on top. Generous padding above. It should feel like a whisper at the end of a page.

**Forms:** Bottom-border-only inputs (no full border, no background). On focus: the bottom border strengthens or shifts to the accent color. Labels above in small uppercase. The form should feel like writing on a blank page.

## What Makes This Aesthetic Work

Courage. Every other aesthetic adds things to create interest — color, texture, motion, decoration. Minimalism removes them and trusts that typography, spacing, and content are enough. The difference between good minimalism and lazy minimalism is precision: if you move an element 8px and the page looks worse, the minimalism is working. If nothing changes, the page is just empty. Minimal design is the hardest to execute because there's nothing to hide behind.
`;
