/**
 * Frontend Design: Bold Geometric - Built-in Skill
 * High contrast, massive type, kinetic energy
 */

export const FRONTEND_DESIGN_BOLD_GEOMETRIC_SKILL = `---
name: frontend-design-bold-geometric
description: Bold geometric aesthetic — massive type, high contrast, color blocks, kinetic energy. Use for product launches, brand sites, portfolios with attitude, and anything that needs to feel like an event.
---

# Bold Geometric Aesthetic

> **Parent skill:** Read \`/.skills/frontend-design.md\` first for the required Design Intent block, universal principles (typography tiers, color construction, spacing, interaction, mobile, anti-patterns), and image/responsive guidance that apply to every aesthetic.

High contrast. Massive type. Strong color blocks. Kinetic energy. This aesthetic makes things feel like an event — a product launch, a brand statement, something worth paying attention to. Think Nike campaigns, contemporary museum exhibitions, automotive reveals, festival branding.

Every decision should feel deliberate and confident. Nothing tentative, nothing decorative for its own sake.

## Typography

**Display font character:** Heavy, wide, geometric. The kind of typeface where uppercase letters own the space they're in. Look for geometric sans-serifs with strong character width and high x-height — fonts that feel engineered, not handwritten. Weight 700–800 for headings. Avoid anything thin, elegant, or calligraphic.

**Body font character:** Clean, neutral, doesn't compete with the display font. A well-crafted sans-serif at regular weight (400–500) that disappears into readability.

**Find fonts that vary from project to project.** Browse Google Fonts filtered to sans-serif, sort by trending or newest. Look at the uppercase specimen — does it command attention? Each project should use a different display font. Never reuse the same pairing across generations.

**Scale:** Hero text should be uncomfortably large — it should feel like it's pushing against the edges of the viewport. Use \`clamp()\` with a minimum around 3rem and a maximum pushing 6–7rem. The gap between hero text and body text should be dramatic, not polite. Section titles somewhere in between. Labels/captions tiny, uppercase, letter-spaced wide — the contrast between massive headings and whispered labels creates tension.

**Treatment:** Uppercase hero text. Tight or slightly negative letter-spacing on large sizes (the letters should feel packed with energy). Line-height near 1.0 — headlines shouldn't float, they should stack like bricks.

## Color

**Build around tension.** A dark or very light neutral base with one saturated, electric accent that feels like it could vibrate off the screen. The accent should feel almost aggressive — not pastel, not muted, not friendly. Think neon signage, warning lights, highlighter ink.

**Base construction:** Dark themes work best here. Start with an almost-black that has a very slight cast (warm, cool, or neutral — match the brand). Text in warm or cool off-white, never pure #fff. Three text tiers: bright for headings, muted for body, dim for metadata.

**The accent does heavy lifting.** Use it for CTAs, key stats, one full-bleed color block section per page. The rest of the page is monochrome. The scarcity of color makes the accent hit harder.

**Full-bleed accent blocks.** One section per page with the accent as background and contrasting text. This is a signature move — it creates a visual event that breaks the dark rhythm. Add a subtle radial gradient overlay for depth.

**Vary the accent per project.** Hot orange one time, electric cyan the next, acid green after that. The aesthetic isn't defined by the color — it's defined by the intensity.

## Layout

**Hero:** Full-viewport. The hero should feel like it owns the entire screen. Either a split layout (text 50–55%, image/visual the rest) or a full-bleed image with text punched over it. The text IS the design element — let it dominate.

**Stats strip:** A horizontal band of 3–4 large numbers with tiny labels below them. Contrasting background (dark on light pages, accent or dark on dark pages). The numbers should be nearly as large as section headings. This is a signature bold-geometric element — raw data presented as visual impact.

**Feature rows:** Alternating two-column sections, image + text, flipping direction each row. Asymmetric grid (60/40 or 55/45, never 50/50). The asymmetry creates forward momentum.

**Section padding:** Aggressively generous. 5–8rem vertical. The whitespace between sections should feel like a breath between punches.

**Content width variation:** Body text constrained, images and color blocks full-bleed, stat strips edge-to-edge. The contrast between tight and wide creates rhythm.

## Backgrounds & Depth

Dark backgrounds benefit from a subtle radial gradient — slightly lighter at the center, darker at the edges. Barely perceptible but it adds dimension.

Avoid noise/grain textures and decorative patterns. This aesthetic is clean and sharp — depth comes from color contrast and layering, not surface treatment.

Shadows: minimal or none. Let contrast and bold color do the work. If you use shadows at all, they should be accent-tinted on hover (e.g., a warm glow behind a button on hover).

## Motion

**Controlled intensity.** Motion should feel like things arriving with purpose, not floating or bouncing.

**Hero entrance:** Stagger elements on page load with short delays (0.08–0.15s between items). Headline first, then subtitle, then CTA. Start from \`opacity: 0; translateY(20px)\`. The stagger creates a sense of unveiling.

**Scroll reveals:** IntersectionObserver, subtle translateY start, ease-out timing. Keep it simple — the content arrives, it doesn't perform.

**Hero image:** A slow scale on the hero image (1.0 → 1.05 over several seconds on load via CSS transition) creates subtle life.

**Hover:** Cards lift (translateY -4 to -6px). Buttons shift up slightly with an accent-colored shadow appearing. Images inside containers scale (1.03) with overflow hidden.

**Avoid absolutely:** Bouncy easing, scroll hijacking, parallax (it fights geometric precision), anything that softens the hard edges. This aesthetic is confident and controlled.

## Navigation

Fixed top bar, transparent on load, gaining a backdrop-blur background on scroll. Logo in the display font, heavy weight, uppercase or small caps, with a geometric mark (a dot, a slash, a small shape in the accent color). Nav links small, clean, well-spaced. One CTA button in the accent color. On mobile: clean hamburger icon, three thin lines, no fancy animations beyond open/close.

## Components

**Buttons:** Sharp corners (low border-radius, 0–4px). Generous horizontal padding. Display font or semi-bold body font. Primary buttons in accent color, outline buttons with a 2px border that fill on hover. No rounded pills — that's a different aesthetic.

**Cards:** Low border-radius (2–4px). No visible borders — use background contrast or subtle shadow. Image top, content bottom. Hover lifts the card and deepens the shadow.

**Footer:** Dark, functional, not decorative. Logo + nav links + contact. Small text, muted colors. Horizontal layout on desktop.

## What Makes This Aesthetic Work

The tension between massive scale and controlled precision. Every element is either very large or very small — there's no medium. The hero text is enormous, the labels are tiny, the accent is intense, the base is muted. That contrast at every level is what makes bold-geometric feel energetic rather than loud.
`;
