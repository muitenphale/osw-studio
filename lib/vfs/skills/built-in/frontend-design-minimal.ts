/**
 * Frontend Design: Minimal - Built-in Skill
 * Extreme whitespace, monochrome, restrained elegance
 */

export const FRONTEND_DESIGN_MINIMAL_SKILL = `---
name: frontend-design-minimal
description: Minimal aesthetic — extreme whitespace, monochrome palette with one accent, restrained elegance. Use for luxury brands, architecture firms, photography portfolios, high-end products, and any design where less is genuinely more.
---

# Minimal Aesthetic

> **Parent skill:** Read \`/.skills/frontend-design.md\` first for the required Design Intent block, universal principles, and image/responsive guidance.

Extreme whitespace. Monochrome. Restrained. This aesthetic communicates confidence through what it removes — every element that remains earns its place. Think Apple product pages, architectural studio sites, high-end fashion, gallery portfolios.

Every decision should pass the test: "does removing this make the design worse?" If the answer is no, remove it. This sub-skill describes the *character* of minimalism; the page composition is yours to design — keep every choice consistent with the austerity below.

## Typography

**Display font character:** Light weight (300–400) on a clean, precise sans-serif. The thinness IS the statement — heavy type creates impact, light type creates sophistication. Look for typefaces with excellent optical quality at light weights, clean geometry, good spacing. The font should feel engineered and precise, not decorative.

**Body font character:** The same font family at regular weight, or a very similar sans-serif. Minimal means minimal font variety — using one family for everything is valid here and reinforces the restraint.

**Find fonts that vary from project to project.** Browse Google Fonts for sans-serifs with good light (300) weights. Test at large sizes — some fonts fall apart when thin. Look for clean, geometric or neo-grotesque designs. Each project should use a different typeface.

**Scale:** NOT massive — minimalism is about proportion, not scale. Hero headlines should be large enough to establish hierarchy but not screaming. Body text at standard size with generous line-height (1.7–1.8) — extra air compensates for the quiet typography. Labels and captions in small uppercase with wide letter-spacing (0.1–0.15em) — a signature minimal element. The tracking creates horizontal rhythm.

**Treatment:** Sentence case or lowercase. Never all-uppercase for headings (except labels/captions). Wide letter-spacing on headings (0.02–0.05em). Line-height 1.2–1.3 for display text. The text should feel like it's breathing, not packed.

## Color

**Monochrome with ONE accent (or zero).** The accent is used so sparingly that when it appears, it commands attention.

**Base construction:** True neutrals — not warm-shifted, not cool-shifted. Pure or near-pure whites, grays, and blacks. This is the one aesthetic where neutral grays aren't dead — the lack of warmth or coolness IS the point. Purity communicates control.

**Accent strategy:** Two approaches, choose one per project:
1. **Black as accent** — on a white base, black itself is the emphasis. "Accent" means bold weight, a filled button, a dark block. No color at all.
2. **Single restrained color** — one tone used in exactly 2–3 places per page: a link color, one CTA, maybe a thin decorative line. Not saturated neon — a tone with enough personality to register but not enough to distract.

**No tinted neutrals, no colored shadows, no gradient tints.** Every color trick that adds warmth or character is deliberately left out. Austerity is the aesthetic.

**Vary per project.** Pure monochrome one project, warm stone tones (rare warmth exception for specific luxury contexts) the next, cool blue-gray after that. The accent, when present, should be unexpected — a single hue the viewer notices because everything else is so restrained.

## Spatial Logic

**Defined by negative space.** The grid is what's empty, not what's filled. Whatever you build, the spacing around elements should feel almost extravagant.

**Section padding:** The most generous of any aesthetic — 5–10rem vertical. If it feels like too much space, it's probably right.

**Content widths:** Body text narrow (580px or so). Outer container moderate. Images can break wider but nothing should feel sprawling. Wide horizontal margins on desktop (10–15% of viewport) are appropriate.

**One thing at a time.** Resist filling space. A section with a single sentence and nothing else is valid. A page with five elements total can be complete.

## Backgrounds & Depth

**None.** Flat backgrounds. No gradients, no textures, no ambient decoration, no blurred shapes, no grain, no noise.

**Rules only.** Thin hairlines (1px) in a light neutral between sections. The only structural decoration allowed.

**No shadows.** If you need to distinguish a card or container, use a thin border (1px, very light) or pure whitespace. Shadows add visual weight that fights the flatness minimalism requires.

**No blur, no glow, no colored shadows.** Every visual effect adds noise that dilutes the signal.

## Motion

**Almost none.** The page loads. The content is there. That's it.

**The complete list of acceptable motion:**
- Page load: simple opacity fade, 0.3s. No transform, no stagger.
- Link hover: color transition, 0.3s.
- Image hover (in gallery): subtle opacity change (1 → 0.85), 0.4s.
- Button hover: fill/outline swap, 0.3s.

No scroll reveals, no staggered entrances, no parallax, no sliding, no scaling, no hero animations. Every animation you add dilutes the minimalism. If the page feels like it needs animation to be interesting, the content or typography isn't strong enough — fix that instead.

## Components

**Buttons:** Zero border-radius. Small uppercase text with wide letter-spacing. Generous padding. Two states only: filled (dark bg, light text) and outline (border, transparent bg). They swap on hover. No shadow, no scale, no translate. The interaction is a quiet inversion.

**Cards (when needed):** No background, no shadow. Content separated by whitespace or a thin bottom border. If a container is necessary, thin 1px border with no border-radius and generous internal padding.

**Forms:** Bottom-border-only inputs (no full border, no background). On focus: bottom border strengthens or shifts to the accent color. Labels above in small uppercase. The form should feel like writing on a blank page.

## Anti-patterns Specific to This Aesthetic

- Soft shadows or colored shadows — adds visual weight
- Tinted neutrals — fights the austerity
- Gradients of any kind — adds digital character
- Multiple accent colors — there is one, or there is none
- Rounded corners — softens the precision
- Decorative elements with no function

## What Makes This Aesthetic Work

Courage. Every other aesthetic adds things to create interest — color, texture, motion, decoration. Minimalism removes them and trusts that typography, spacing, and content are enough. The difference between good minimalism and lazy minimalism is precision: if you move an element 8px and the page looks worse, the minimalism is working. If nothing changes, the page is just empty. Minimal design is the hardest to execute because there's nothing to hide behind.
`;
