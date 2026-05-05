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

Every decision should feel deliberate and confident. Nothing tentative, nothing decorative for its own sake. This sub-skill describes the *character* of the aesthetic; the page composition is yours to design — just keep every choice consistent with the energy below.

## Typography

**Display font character:** Heavy, wide, geometric. The kind of typeface where uppercase letters own the space they're in. Look for geometric sans-serifs with strong character width and high x-height — fonts that feel engineered, not handwritten. Weight 700–800 for headings. Avoid anything thin, elegant, or calligraphic.

**Body font character:** Clean, neutral, doesn't compete with the display font. A well-crafted sans-serif at regular weight (400–500) that disappears into readability.

**Find fonts that vary from project to project.** Browse Google Fonts filtered to sans-serif, sort by trending or newest. Look at the uppercase specimen — does it command attention? Each project should use a different display font. Never reuse the same pairing across generations.

**Scale:** Hero text should be uncomfortably large — pushing against the edges of the viewport. Use \`clamp()\` with a minimum around 3rem and a maximum pushing 6–7rem. The gap between hero text and body text should be dramatic, not polite. Section titles somewhere in between. Labels/captions tiny, uppercase, letter-spaced wide — the contrast between massive headings and whispered labels creates tension.

**Treatment:** Uppercase hero text. Tight or slightly negative letter-spacing on large sizes (the letters should feel packed with energy). Line-height near 1.0 — headlines shouldn't float, they should stack like bricks.

## Color

**Build around tension.** A dark or very light neutral base with one saturated, electric accent that feels like it could vibrate off the screen. The accent should feel almost aggressive — not pastel, not muted, not friendly. Think neon signage, warning lights, highlighter ink.

**Base construction:** Dark themes work especially well here, but light themes work too if the accent does enough lifting. Start with an almost-black or near-white that has a very slight cast (warm, cool, or neutral — match the brand). Text in warm or cool off-tones, never pure #fff or #000. Three text tiers: bright for headings, muted for body, dim for metadata.

**The accent does heavy lifting.** Use it where you want the eye to land — CTAs, key numbers, one signature color event per page. The rest of the page is monochrome. Scarcity makes the accent hit harder.

**Vary the accent per project.** Hot orange one time, electric cyan the next, acid green after that, hazard yellow, magenta, ultramarine. The aesthetic isn't defined by *which* color — it's defined by intensity. Avoid converging on the same accent across generations.

## Spatial Logic

**Asymmetry creates momentum.** Symmetric layouts feel static, which fights this aesthetic's energy. Off-balance compositions, weight concentrated to one side, content that doesn't sit in the center — these create the forward motion that makes bold-geometric feel kinetic.

**Scale contrast at every level.** Pair very large with very small. Massive heading next to tiny caption. Wide color block next to a single line of text. There should be no medium-sized elements floating in the middle.

**Content width variation creates rhythm.** Tight body text, full-bleed color, wide images. The shifts in width as you scroll are part of the experience.

**Section padding:** Aggressively generous. 5–8rem vertical. The whitespace between sections should feel like a breath between punches.

**Color-block sections.** When a section needs to be a visual event, fill its full width with the accent color and put contrasting text on top. Use this scarcely — once or twice per page maximum. Frequency dilutes impact.

## Backgrounds & Depth

Dark backgrounds benefit from a subtle radial gradient — slightly lighter at the center, darker at the edges. Barely perceptible but it adds dimension.

Avoid noise/grain textures and decorative patterns. This aesthetic is clean and sharp — depth comes from color contrast and layering, not surface treatment.

Shadows: minimal or none. Let contrast and bold color do the work. If you use shadows at all, they should be accent-tinted on hover (e.g., a warm glow behind a button on hover).

## Motion

**Controlled intensity.** Motion should feel like things arriving with purpose, not floating or bouncing.

**Page entrance:** Stagger key elements on load with short delays (0.08–0.15s between items). Start from \`opacity: 0; translateY(20px)\`. The stagger creates a sense of unveiling. Keep the entrance to one orchestrated moment — don't sprinkle entrances throughout the page.

**Scroll reveals:** IntersectionObserver, subtle translateY start, ease-out timing. Keep it simple — content arrives, it doesn't perform.

**Hover:** Cards lift (translateY -4 to -6px). Buttons shift up slightly with an accent-colored shadow appearing. Images inside containers scale (1.03) with overflow hidden. Transitions 0.2–0.3s — sharper than soft aesthetics.

**Avoid absolutely:** Bouncy easing, scroll hijacking, parallax (it fights geometric precision), anything that softens the hard edges. This aesthetic is confident and controlled.

## Components

**Buttons:** Sharp corners (border-radius 0–4px). Generous horizontal padding. Display font or semi-bold body font. Primary buttons in accent color, outline buttons with a 2px border that fill on hover. No rounded pills — that's a different aesthetic.

**Cards:** Low border-radius (2–4px). No visible borders — use background contrast or subtle shadow. Hover lifts and deepens shadow.

**Form inputs:** Minimal border, sharp corners, accent-colored focus state. Match the architectural feel of the buttons.

## Anti-patterns Specific to This Aesthetic

- Pastel or muted accent colors — kills the kinetic energy
- Rounded corners above 4px — softens the architectural feel
- Center-aligned everything — symmetry fights momentum
- Multiple competing accent colors — dilutes scarcity
- Heavy decorative shadows — fights the clean geometric feel

## What Makes This Aesthetic Work

The tension between massive scale and controlled precision. Every element is either very large or very small — there's no medium. The hero text is enormous, the labels are tiny, the accent is intense, the base is muted. That contrast at every level is what makes bold-geometric feel energetic rather than loud. Asymmetry and width contrast give it forward motion. Restraint everywhere except the chosen moments of impact is what separates "designed" from "shouty."
`;
