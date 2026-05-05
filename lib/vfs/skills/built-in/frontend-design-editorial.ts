/**
 * Frontend Design: Editorial - Built-in Skill
 * Serif-forward, content-dense, magazine-like grids
 */

export const FRONTEND_DESIGN_EDITORIAL_SKILL = `---
name: frontend-design-editorial
description: Editorial aesthetic — serif typography, magazine-like rhythm, content-dense layouts with elegant hierarchy. Use for blogs, publications, long-form portfolios, news sites, and any content-first design where reading is the primary activity.
---

# Editorial Aesthetic

> **Parent skill:** Read \`/.skills/frontend-design.md\` first for the required Design Intent block, universal principles, and image/responsive guidance.

Serif typography. Magazine rhythm. Content density with elegant hierarchy. This aesthetic prioritizes reading and lets the content be the visual interest. Think well-designed newspapers, literary journals, museum exhibition catalogs, long-form journalism sites.

Every decision should serve the content. Decoration is restrained. The typography and layout do the work. This sub-skill describes the *character* of editorial design; specific page composition is yours to design — keep every choice consistent with the print-oriented voice below.

## Typography

This is the most typographically complex aesthetic. Three distinct voices work together like the layers of a well-designed magazine.

**Display font character:** A true serif with personality — not a geometric sans pretending. High-contrast strokes (thick/thin variation), elegant proportions, distinctive at large sizes. Look for serifs that feel authored and literary. Weight 400–700 depending on the font's natural weight.

**Body font character:** A serif designed for screen reading at body sizes. Good x-height, open counters, comfortable at 16–18px across long paragraphs. Not the same as the display serif — a text serif has different priorities than a display serif.

**UI/caption font:** A clean sans-serif for metadata, bylines, categories, navigation, and small functional text. This third voice gives editorial design its magazine feel. The contrast between serif content and sans-serif chrome is the signature.

**Find fonts that vary from project to project.** Browse Google Fonts filtered to serif. Look at the italic specimen — editorial design uses italic heavily. Check readability at 16px for body serifs. Each project should feel like a different publication.

**Scale:** Hero headlines large but not screaming — let the letterforms speak. Body text slightly larger than other aesthetics (1.05–1.15rem) with generous line-height (1.7–1.8) because long-form text needs more breathing room. Captions and metadata in the sans-serif, small, sometimes uppercase with letter-spacing.

**Treatment:** Mixed case (sentence or title case, never all-uppercase — serifs look best at natural case). Italic for subtitles, pull quotes, and emphasis. Letter-spacing: natural or very slightly positive — tight tracking hurts serif readability.

**Pull quotes:** A signature editorial element. Display serif, italic, 1.5–2x body size. Bordered with a thin accent line. These break up long text and pull the reader forward.

## Color

**Muted, sophisticated palettes.** High contrast for readability. No bright or electric accents — think ink, dye, natural pigments.

**Base construction:** Warm off-whites that feel like paper — cream, parchment, ivory. Not stark white. Surface tones a shade deeper, like a different paper stock. Text in near-black. Muted text in warm dark gray. The palette should feel like it could exist in print.

**Accent character:** Brick red, deep blue, olive, dusty plum, dark teal — colors that feel like they came from a printer's ink well, not a screen. Desaturated enough to feel sophisticated, saturated enough to be noticeable. Used sparingly: category labels, links, occasional emphasis.

**Rules and dividers.** Thin horizontal lines (1px) in a muted tone are a core visual element. They create structure without weight — like the ruled lines of a printed page.

**Dark variants:** Warm charcoal backgrounds with parchment-toned text. Same tinted-neutral approach as light, inverted. Rules in a slightly lighter tone.

**Vary per project.** Brick red and cream for one publication, deep blue and warm white for another, olive and parchment for a third. The feel is always "printed matter" but the specific palette changes.

## Spatial Logic

**Width variation is the rhythm.** Editorial design lives or dies by varying content widths as the reader scrolls:
- Narrow (580–680px) for body text — optimal reading measure
- Medium (900–960px) for images, pull quotes, and wider content
- Full-bleed for hero photography and section dividers

The shift between widths is what creates magazine feel. Without it, the page feels like a generic blog post.

**Asymmetric grids over uniform ones.** When laying out multiple items (article index, gallery, etc.), prefer asymmetric grids — one large feature with smaller supporting items, or columns of unequal width. Uniform grids of identical cards feel like a content management system, not a publication.

**Section padding:** Moderate — 3–5rem vertical. Editorial is content-dense, less dramatic whitespace than other aesthetics, but still comfortable. Density should feel intentional, not cramped.

## Backgrounds & Depth

**Paper feel.** Warm off-white backgrounds with subtle surface alternation. The shift between base and surface tones should feel like turning between different paper stocks.

**No gradients.** Flat, honest backgrounds. Gradients feel digital; editorial aims to feel printed.

**Shadows are mostly absent.** Use rules (hairlines) and whitespace for separation in article-reading contexts. Very subtle shadows acceptable on clickable cards in index/listing contexts only.

**Image treatments:** No border-radius on editorial images (or 2px max). Photographs are presented as photographs — sharp rectangles. An optional 1px border in the rule color frames them like a printed image.

## Motion

**Restrained.** Editorial design trusts the content to be interesting. Animation should be nearly invisible.

**Page entrance:** Simple opacity fade, 0.3–0.4s. No staggering — content arrives as a complete page, like turning to a new page.

**Scroll reveals:** Optional and very subtle. Opacity only, no transform. Or skip entirely — many editorial sites use no scroll animation, and that's fine.

**Hover on links:** Underline transitions. Color change to accent. The underline is the editorial interaction signature.

**Hover on article cards:** Image scale 1.02, headline color shifts to accent. Minimal.

**Avoid:** Elaborate entrance animations, parallax, anything that says "look at this animation" instead of "read this content."

## Components

**Article cards:** Image on top (sharp rectangle, no radius), category label in small uppercase sans-serif accent color, headline in display serif, metadata line (date, author, read time) in small sans-serif dim text. No background container — just content with whitespace.

**Blockquotes/pull quotes:** Display serif, italic, larger than body. Accent-colored thin border on the left or top. Generous vertical margin.

**Bylines and metadata:** Sans-serif, small, sometimes uppercase with letter-spacing. Separated by middle dots or thin vertical rules.

**Buttons:** Used sparingly. Editorial sites rarely hard-sell. When needed: simple, text-led, often just a styled link with an underline. Avoid prominent filled CTAs unless the publication is selling subscriptions or events.

## Anti-patterns Specific to This Aesthetic

- Geometric sans-serif headlines — kills the literary feel
- Rounded corners on images or cards — feels like a tech product
- Gradient backgrounds — feels digital, not printed
- Dramatic entrance animations — distracts from reading
- Heavy CTAs and sales-pitch language — wrong tone
- Uniform grids of identical cards — feels like a CMS dump

## What Makes This Aesthetic Work

The three-voice typographic system. Display serif creates authorial weight. Body serif creates reading comfort. Sans-serif for chrome creates functional contrast. Remove any voice and the design feels flat. The combination — plus the width-variation rhythm — is what makes a page feel like a designed publication rather than a generic blog.
`;
