/**
 * Frontend Design: Art Deco - Built-in Skill
 * Geometric ornament, symmetry, gold-on-black opulence
 */

export const FRONTEND_DESIGN_ART_DECO_SKILL = `---
name: frontend-design-art-deco
description: Art-deco aesthetic — geometric ornament, strong symmetry, gold-on-black opulence, sunburst and chevron motifs. Use for hospitality, luxury events, theaters, period-piece brands, jewelry, anything that wants to evoke the 1920s and 1930s.
---

# Art-Deco Aesthetic

> **Parent skill:** Read \`/.skills/frontend-design.md\` first for the required Design Intent block, universal principles, and image/responsive guidance.

Geometric ornament. Strong symmetry. Gold on dark backgrounds. Sunburst and chevron motifs. Vertical emphasis. Art-deco evokes the 1920s and 1930s — the Chrysler Building, ocean-liner posters, Hollywood premieres, the Great Gatsby. Glamour and geometry together. Think theater programs, hotel branding, jewelry brand sites, vintage event posters.

Symmetry is a virtue here, in contrast to most other aesthetics — this is one of the rare cases where centered, balanced compositions are correct rather than safe. The parent skill's anti-symmetry guidance is overridden in this aesthetic.

## Typography

**Display font character:** Geometric, often condensed, with strong vertical stress. Capital letters with sharp corners and high contrast. Look for fonts modeled on 1920s posters: tall, narrow, often with double-line or inline detail. Engraved or chiseled feel. Weight: variable but usually medium-to-heavy.

**Body font character:** Clean serif or geometric sans that doesn't compete with the display font. Often a transitional serif works well — some period feel without distracting from the display headings.

**Find fonts that vary from project to project.** Browse Google Fonts for: Limelight, Cinzel, Poiret One, Sacramento (paired), Cormorant Garamond, Playfair Display. Each project should pick a different display font. The signature is the *style* (period geometric), not a specific font.

**Scale:** Strong vertical proportion. Headings often taller than wide — narrow display fonts at large sizes emphasize this. Body text at standard size with comfortable line-height.

**Treatment:** Often all-caps for headings (this is one of the few aesthetics where all-caps is correct). Wide letter-spacing on titles to evoke poster lettering. Italic and script fonts used sparingly for accents (event names, special features).

## Color

**Gold and black is the signature.** Or: black and white with one jewel-tone accent (emerald, ruby, sapphire, amethyst). Pure metallics — gold (#c9a961, #d4af37) or platinum/silver — are the period correct accent.

**Base construction:** Deep black backgrounds (near-black, very slight warmth). Off-white or cream alternates for lighter sections. Surface variation between true black and 5–10% lighter for layering.

**Accent strategy:** Gold accents for ornament, headings, dividers, decorative borders. Used liberally — this is not a "scarcity makes it special" aesthetic. Gold is the signature material.

**Jewel-tone alternative:** Single saturated jewel-tone (deep emerald, blood ruby, royal sapphire) instead of or alongside gold. Used the same way — for ornament and emphasis.

**No pastels, no warm-shifted neutrals, no soft gradients.** Sharp tonal contrast is the period feel.

## Spatial Logic

**Symmetry is correct here.** Center-aligned hero compositions, balanced columns, mirrored layouts — these read as elegance rather than safety in this aesthetic. Resist the impulse to break symmetry.

**Vertical emphasis.** Tall narrow elements, stacked compositions, content arranged in vertical bands. The Chrysler Building was a vertical statement; that proportion translates to layout.

**Strong horizontal dividers.** Decorative gold rules separating sections. Often with a small geometric ornament centered on the rule (a sunburst, a chevron, a diamond).

**Section padding:** Generous and even. 5–8rem vertical. Symmetrical above and below. Even rhythm reinforces the formal feel.

## Backgrounds & Depth

**Decorative ornament is core.** This is a maximally decorative aesthetic — backgrounds carry geometric pattern.

**Pattern types to use:** Sunburst rays (radial lines from a corner or center), chevrons, stepped pyramids, geometric flowers, fan shapes, fluted columns, repeating diamond grids. SVG patterns work well here.

**Gold linework on dark backgrounds.** Decorative borders around sections, around images, around buttons. 1–2px gold lines forming geometric frames. Double-line borders are period-correct.

**Corner ornaments.** Small geometric flourishes in section corners — a sunburst, a stepped pyramid, an art-deco rosette. SVG or unicode symbols both work.

**No photos with effects.** Photographs (when used) are presented cleanly, often in geometric frames or with gold corner ornaments.

## Motion

**Stately and formal.** Motion should feel like a curtain rising, not like a notification arriving.

**Page entrance:** Slow fade-in (0.6–0.8s) with no transform, or a subtle scale (0.98 → 1) to feel like the page is materializing. Stagger ornaments separately from content.

**Scroll reveals:** Subtle. Opacity fade with slight upward translate (10px). Easing: smooth ease-out. Stagger 0.1s between siblings.

**Hover:** Cards or images gain a thicker gold border, or the gold ornament in a corner illuminates. Buttons fill from outline to filled with a smooth 0.4s transition.

**Decorative motion:** Sunburst SVGs that very slowly rotate, or gold lines that draw themselves on scroll-into-view via stroke-dashoffset animation. Use sparingly.

## Components

**Buttons:** Rectangular with gold borders (1–2px). Small uppercase text, wide letter-spacing. Often with a small geometric corner ornament. Hover: border thickens, or background fills with gold and text becomes black. No border-radius — sharp corners.

**Cards:** Bordered with gold linework. Often with corner ornaments. Internal layout symmetric. Backgrounds slightly lighter than page bg for depth. No rounded corners.

**Section headers:** Centered, with decorative rules above and below the title. Often a small geometric ornament directly below the title.

**Forms:** Bottom-border-only inputs in gold. Labels in small uppercase wide-tracked. Submit button in the standard art-deco button style.

## Anti-patterns Specific to This Aesthetic

- Asymmetric or off-center hero compositions — fights the formal balance
- Soft gradients or pastel colors — too modern, too soft
- Rounded corners — destroys the sharp geometric feel
- Sans-serif body fonts with no period feel — looks like generic luxury
- Glow effects, neon, dramatic shadows — wrong period
- Mixing art-deco with modern minimalism — produces a confused result

## What Makes This Aesthetic Work

The combination of geometric discipline with ornamental richness. Most aesthetics either commit to ornament (maximalist) or commit to restraint (minimal). Art-deco is rigorously geometric AND lavishly decorated — the ornament follows strict geometric logic. Sunbursts have specific angles. Chevrons stack in mathematical sequence. The richness feels controlled rather than chaotic. Symmetry isn't lazy here; it's the period's signature. The risk is looking like a bad wedding invitation — execute the geometry precisely and let the gold do the work.
`;
