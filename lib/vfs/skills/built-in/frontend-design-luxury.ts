/**
 * Frontend Design: Luxury - Built-in Skill
 * Refined opulence, dark serif elegance, gold accents
 */

export const FRONTEND_DESIGN_LUXURY_SKILL = `---
name: frontend-design-luxury
description: Luxury aesthetic — refined opulence, dark serif elegance, restrained gold accents, expensive feel. Different from minimal (which is restraint as statement) — luxury allows ornament if it signals craft. Use for high-end fashion, jewelry, hospitality, private services, anything that should feel expensive.
---

# Luxury Aesthetic

> **Parent skill:** Read \`/.skills/frontend-design.md\` first for the required Design Intent block, universal principles, and image/responsive guidance.

Refined opulence. Dark serif elegance. Restrained gold accents. The feel of expensive things presented with confidence. This aesthetic is *not* the same as minimal — minimal communicates wealth through extreme restraint, while luxury allows ornament and richness as long as every detail signals craft. Think high-end fashion houses (not boutique), private banking, fine jewelry brands, five-star hospitality, classic perfumeries.

This sub-skill describes the *character* of luxury; layout is yours to design — keep choices consistent with the refined voice below.

## Typography

**Display font character:** A high-contrast serif with classical proportions. Didone-style serifs (Bodoni, Didot, Playfair Display) communicate fashion-house elegance. Garalde or transitional serifs (Cormorant, EB Garamond) communicate hospitality and old-world craft. Pick the family that matches the brand. Weight: light to regular (300–400). Heavy weights kill the refined feel.

**Body font character:** A sophisticated serif at body sizes (different from display) or a refined sans (Montserrat at light weight, Spectral, neue grotesque at light weight). The body voice should feel composed and unhurried.

**Find fonts that vary from project to project.** Browse Google Fonts: Cormorant Garamond, Cinzel, Italiana, Bodoni Moda, Marcellus, Cormorant Infant, Yeseva One, Italiana, Forum. Each project should pick a different display serif. Avoid converging on Playfair Display in particular — it's the cliché choice.

**Scale:** Generous but not aggressive. Hero serif at 4–6rem with light weight. Body text at 1rem with generous line-height (1.7–1.8). Captions in small uppercase sans or mixed-case italic — never large, always whispered.

**Treatment:** Mixed case for headings (uppercase serif at large sizes works for fashion, but feels heavy elsewhere). Italic for emphasis and decorative subtitles. Letter-spacing slightly positive on headings (0.02em). Numbers in old-style figures if the font supports them.

## Color

**Dark and rich, OR cream and gold.** Two valid directions, choose one per project.

**Dark direction:** Near-black backgrounds with very slight warmth (deep brown-black, plum-black). Cream or warm-white text. Gold or champagne accents. Surface variation between true black and 5% warm-lift.

**Light direction:** Cream, ivory, parchment backgrounds. Deep brown or near-black text. Single accent in deep jewel-tone (forest green, oxblood, navy) or restrained gold.

**Accent strategy:** Used sparingly. Gold (#c9a961, #d4af37) or champagne for ornament and emphasis on dark direction. Single jewel-tone for the light direction. The accent should feel like a single piece of jewelry on an outfit — present, intentional, scarce.

**No saturated electric colors.** No neon, no hot pink, no electric anything. Luxury palettes feel like aged materials.

**Vary per project.** Dark with champagne one project, cream with oxblood the next, deep navy with cream the third. Direction and accent both shift.

## Spatial Logic

**Generous and composed.** Space communicates value — but not as extreme as minimal.

**Section padding:** Generous — 5–8rem vertical. Each section feels like turning a page in a coffee-table book.

**Asymmetric, considered.** Not center-aligned (that's hospitality-cliché) and not aggressively asymmetric. Compositions that feel arranged with intention — left-aligned with weight balance from images, or single-column centered with very narrow widths.

**Image-forward.** Photography is core to luxury aesthetics. Generous image sizes. Photography should feel editorial — high-quality, often dark or moody, well-composed. Treat images as the primary visual content.

**Wide horizontal margins.** Content held in narrow center-stage with substantial space on either side communicates "this content is curated."

## Backgrounds & Depth

**Subtle and refined.**

**Flat backgrounds with slight surface variation.** No gradients (modern feel) and no patterns (decorative feel). Just careful tonal control.

**Optional grain or texture overlay.** Very subtle — film grain at 3–5% opacity, or paper-texture at low opacity. Adds material feel without obvious decoration.

**Hairline rules.** Thin 1px lines in gold or dim text color separating sections. Often with a small flourish (small SVG ornament, period mark).

**No box-shadows.** Drop shadows feel cheap. Use whitespace, hairline borders, or background tonal shifts for separation.

## Motion

**Slow, considered, almost cinematic.** Motion in luxury aesthetics should feel like a curtain reveal or a long lens exposure.

**Page entrance:** Slow opacity fade (0.6–0.9s) with no transform, or very subtle scale (0.99 → 1) for materialization feel. Stagger key elements with longer delays (0.2s between siblings).

**Scroll reveals:** Slow and graceful. 0.6s ease-out with small translate (10–15px). Often only the headlines reveal — body text just fades.

**Image reveals:** Hero images can scale slowly (1.0 → 1.05) over 4–6 seconds for breathing-photo feel.

**Hover:** Refined and slow. Cards lift only slightly (2–4px) over 0.5s. Image hovers fade slightly or zoom barely (1.02). Buttons fill or border-shift slowly. Nothing snaps.

**Decorative motion:** Generally avoided. Continuous motion reads as cheap unless very subtle.

## Components

**Buttons:** Often outline rather than filled. Thin border (1px). Small uppercase letter-spaced text. Generous padding. Sharp or barely-rounded corners (0–2px). Hover: fill from center, or border thickens. Sometimes just a styled link with an underline rather than a button shape.

**Cards:** Often borderless and shadowless. Content held in whitespace. If a container is needed, hairline border in the accent color. Internal padding generous. Image-led layouts.

**Forms:** Bottom-border-only inputs. Labels above in small uppercase letter-spaced. Submit button matches the standard luxury button.

**Image treatments:** No or minimal border-radius (2px max). Often presented full-bleed or in narrow centered single columns. Captions below in small italic.

**Decorative typography elements.** Drop caps on opening paragraphs of long-form content. Pull quotes in italic display serif with hairline rules. Section divider symbols (an asterism, ornamental glyph).

## Anti-patterns Specific to This Aesthetic

- Sans-serif headlines — kills the refinement instantly
- Saturated or electric accent colors — feels cheap
- Soft shadows or rounded cards — feels SaaS, not luxury
- Generous animation — fights the considered feel
- Casual tone in copy — even copy decisions affect aesthetic
- Stock photography that looks like stock — luxury photography should feel commissioned
- Playfair Display as the go-to display font — the cliché choice; pick something less common

## What Makes This Aesthetic Work

Restraint applied selectively. Luxury allows decoration where minimal forbids it — the gold accent, the elegant serif, the slow motion are all decorative choices. But every decoration is small and intentional. Where maximalism stacks, luxury chooses one element. Where playful adds energy, luxury slows down. The aesthetic comes from the *gap* between rich materials (serif typography, gold, photography) and quiet presentation (slow motion, generous space, single accent). The risk is reading as funereal or cold — counter with warmth in photography and considered tonal variation, not with playfulness.
`;
