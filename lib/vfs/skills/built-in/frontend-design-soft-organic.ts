/**
 * Frontend Design: Soft Organic - Built-in Skill
 * Warm, rounded, gentle, approachable
 */

export const FRONTEND_DESIGN_SOFT_ORGANIC_SKILL = `---
name: frontend-design-soft-organic
description: Soft organic aesthetic — warm tones, rounded shapes, gentle gradients, approachable feel. Use for SaaS products, wellness brands, consumer apps, friendly startups, and anything that should feel welcoming and trustworthy.
---

# Soft Organic Aesthetic

> **Parent skill:** Read \`/.skills/frontend-design.md\` first for the required Design Intent block, universal principles, and image/responsive guidance.

Warm. Rounded. Gentle. This aesthetic makes things feel approachable and trustworthy — the kind of interface you'd hand to someone who's never used it before and they'd still feel comfortable. Think modern SaaS marketing pages, health/wellness apps, consumer product sites, friendly startup brands.

Every decision should communicate care and warmth. Nothing sharp, nothing aggressive, nothing cold. This sub-skill describes the *character* of the aesthetic; the page composition is yours to design — keep every choice consistent with the warmth below.

## Typography

**Display font character:** Rounded terminals, soft geometry. The kind of typeface that smiles at you — friendly without being childish, approachable without being casual. Look for geometric sans-serifs with rounded stroke endings, medium-to-high x-height, open counters. Weight 600–700 for headings — substantial but not heavy.

**Body font character:** Excellent readability, neutral warmth. A sans-serif that feels comfortable at long reading lengths. Regular weight (400), generous spacing.

**Find fonts that vary from project to project.** Browse Google Fonts for sans-serifs with rounded or soft characteristics. Check how the lowercase 'a', 'g', and 'e' look — they should feel open and inviting. Each project should use a different pairing. Never reuse.

**Scale:** Large but not overwhelming. Hero headlines should be confident, not shouting — use \`clamp()\` with a range that feels generous but restrained (roughly 2–4rem). Body text slightly larger than other aesthetics (1–1.1rem) with generous line-height (1.65–1.75) for a relaxed reading pace.

**Treatment:** Sentence case (never uppercase — uppercase feels confrontational in this aesthetic). Natural letter-spacing. Subtitles directly below headings in muted text. Labels in lowercase with medium weight, not uppercase — lowercase labels feel friendlier.

## Color

**Build around warmth.** Everything should feel like it has been sitting in gentle sunlight. Even "cool" palettes should have warm undertones rather than icy blue.

**Base construction:** Light themes work best. Start with a warm off-white (cream, bone, linen — not stark white). Surface color a shade deeper for cards and alternating sections. Text in warm near-black, muted text in warm gray, dim text in warm light gray. Nothing should feel sterile or clinical.

**Accent character:** Desaturated, warm, and natural-feeling. Think terracotta, dusty coral, sage green, warm gold, soft lavender — colors you'd find in nature or a pottery studio, not on a neon sign. The accent should feel like it grew there, not like it was dropped in.

**Tinted backgrounds for badges and tags:** Accent at 8–12% opacity for backgrounds with the full accent as text. Color variety without visual noise.

**Dark variants:** Warm charcoal or warm stone bases. Never cold gray or blue-black. Off-white text with warmth. Same principles, warm-shifted throughout.

**Vary the palette per project.** Coral and cream one time, sage and warm gray the next, dusty blue and linen after that. The warmth is the constant, not the specific hue.

## Spatial Logic

**Comfortable density.** Not as airy as minimal, not as dense as editorial. Content has room to breathe but doesn't feel sparse.

**Section padding:** Generous but not extreme — 3–6rem vertical. Comfortable, not dramatic.

**Content width:** Moderate (max 1080px container). Body text narrow (max 640px). Everything feels embraced, not sprawling.

**Avoid hard splits and aggressive asymmetry.** A hero with content on one side and an image on the other can feel confrontational here — when in doubt, lean toward centered or gently offset compositions. Symmetry communicates calm.

## Backgrounds & Depth

**Soft gradients.** Subtle linear gradients between background and surface tones in headers or feature areas. The gradient should be barely perceptible — a gentle shift, not a ramp.

**Colored shadows.** Tint box-shadow toward the element's dominant color rather than using generic gray shadows. A card with a warm accent gets shadows tinted toward that warmth. Elements feel like they belong to the space rather than floating above it.

**Layered shadows on cards.** A tight, close shadow for edge definition plus a larger, softer, more diffuse shadow for atmosphere. Single shadows look flat.

**Surface alternation.** Switch between background and surface tones every 2–3 sections for gentle rhythm.

**Ambient decoration (sparingly).** Large, soft, blurred shapes (circles, blobs) positioned behind hero content at very low opacity (10–15%). These create atmosphere without distraction. Maximum 2 per page.

**No noise/grain.** Too rough for this aesthetic. No sharp decorative patterns either.

## Motion

**Everything should feel gentle and unhurried.** Transition times slightly longer than other aesthetics (0.4–0.6s). Easing curves that feel like settling into a chair — smooth ease-out or gentle cubic beziers.

**Page entrance:** Fade in from opacity 0 with a very small vertical shift (12–16px). Stagger key elements by 0.1s. Nothing dramatic — things simply arrive.

**Scroll reveals:** IntersectionObserver with small translateY start and 0.5s ease-out. Stagger 0.08s between siblings. Barely noticeable — content settles into place.

**Hover on cards:** Translate up 3–4px, shadow expands and softens. Maybe a very subtle scale (1.01). The card should feel like it's gently rising, not snapping.

**Hover on buttons:** Background lightens or darkens subtly. Shadow appears or deepens. No vertical movement — keep buttons grounded.

**Avoid:** Fast animations, abrupt transforms, anything that feels mechanical or snappy. Things should feel like they're gently settling into place, not clicking into position.

## Components

**Buttons:** Generous border-radius (8–12px). Comfortable padding. Display font or semi-bold body font. Primary buttons in the accent with a color-tinted shadow. Secondary buttons with a subtle border and surface background. Hover transitions are gentle — no sharp state changes.

**Cards:** Rounded corners (12–16px). Soft layered shadows. No hard borders — shadow provides definition. Generous internal padding (1.5–2rem). Images with matching border-radius and overflow hidden.

**Badges/tags:** Pill-shaped (border-radius 99px). Tinted background, accent text. Small, quiet, informational.

**Input fields:** Rounded (8–10px). Subtle border that strengthens on focus with an accent-colored focus ring (via box-shadow, not outline). Generous internal padding for comfortable typing.

## Anti-patterns Specific to This Aesthetic

- Sharp corners on buttons or cards — instantly breaks the warmth
- All-uppercase headings — too aggressive
- Pure neutral grays — feels clinical instead of caring
- Hard-edged section transitions — should feel like a gentle shift
- Saturated electric accents — kills the natural warmth
- Mechanical or snappy easing curves — fights the unhurried feel

## What Makes This Aesthetic Work

Consistency of warmth. Every color is tinted warm. Every corner is rounded. Every shadow is soft. Every transition is gentle. Every element says "welcome." The risk is blandness — avoid it by committing to the accent color and using it with intention for interactive elements and key moments, not as wallpaper. The warmth should feel designed, not default.
`;
