/**
 * Frontend Design: Editorial - Built-in Skill
 * Serif-forward, content-dense, magazine-like grids
 */

export const FRONTEND_DESIGN_EDITORIAL_SKILL = `---
name: frontend-design-editorial
description: Editorial aesthetic — serif typography, magazine-like grids, content-dense layouts with elegant hierarchy. Use for blogs, publications, long-form portfolios, news sites, and any content-first design where reading is the primary activity.
---

# Editorial Aesthetic

> **Parent skill:** Read \`/.skills/frontend-design.md\` first for the required Design Intent block, universal principles (typography tiers, color construction, spacing, interaction, mobile, anti-patterns), and image/responsive guidance that apply to every aesthetic.

Serif typography. Magazine grids. Content density with elegant hierarchy. This aesthetic prioritizes reading and lets the content be the visual interest. Think well-designed newspapers, literary journals, museum exhibition catalogs, long-form journalism sites.

Every decision should serve the content. Decoration is restrained. The typography and layout do the work.

## Typography

This is the most typographically complex aesthetic. Three distinct voices work together like the layers of a well-designed magazine.

**Display font character:** A true serif with personality — not a geometric sans pretending. High-contrast strokes (thick/thin variation), elegant proportions, distinctive at large sizes. Look for serifs that feel authored and literary. Weight 400–700 depending on the font's natural weight.

**Body font character:** A serif designed for screen reading at body sizes. Good x-height, open counters, comfortable at 16–18px across long paragraphs. Not the same as the display serif — a text serif has different priorities than a display serif.

**UI/caption font:** A clean sans-serif for metadata, bylines, categories, navigation, and small functional text. This creates the third typographic layer that gives editorial design its magazine feel. The contrast between serif content and sans-serif chrome is the signature.

**Find fonts that vary from project to project.** Browse Google Fonts filtered to serif. Look at the italic specimen — editorial design uses italic heavily for pull quotes and emphasis. Check readability at 16px for body serifs. Each project should feel like a different publication.

**Scale:** Hero headlines large but not screaming — let the letterforms speak. Body text slightly larger than other aesthetics (1.05–1.15rem) with generous line-height (1.7–1.8) because long-form text needs more breathing room. Captions and metadata in the sans-serif, small, sometimes uppercase with letter-spacing.

**Treatment:** Mixed case (sentence or title case, never all-uppercase — serifs look best at natural case). Italic for subtitles, pull quotes, and emphasis. Letter-spacing: natural or very slightly positive — tight tracking hurts serif readability.

**Pull quotes:** A signature editorial element. Display serif, italic, 1.5–2x body size. Offset to one side of the column or centered with generous vertical space. Bordered with a thin accent line on the left or top. These break up long text and pull the reader forward.

## Color

**Muted, sophisticated palettes.** High contrast for readability. No bright or electric accents — think ink, dye, natural pigments.

**Base construction:** Warm off-whites that feel like paper — cream, parchment, ivory. Not stark white. Surface tones a shade deeper, like a different paper stock. Text in near-black. Muted text in warm dark gray. The palette should feel like it could exist in print.

**Accent character:** Brick red, deep blue, olive, dusty plum, dark teal — colors that feel like they came from a printer's ink well, not a screen. Desaturated enough to feel sophisticated, saturated enough to be noticeable. Used sparingly: category labels, links, occasional emphasis.

**Rules and dividers.** Thin horizontal lines (1px) in a muted tone are a core visual element. Between articles, below headers, in the header and footer. They create structure without weight — like the ruled lines of a printed page.

**Dark variants:** Warm charcoal backgrounds with parchment-toned text. The same tinted-neutral approach as light, inverted. Rules in a slightly lighter tone.

**Vary per project.** Brick red and cream for a news publication, deep blue and warm white for a literary journal, olive and parchment for a nature magazine. The feel is always "printed matter" but the specific palette changes.

## Layout

**Three content widths on the same page.** This is the signature editorial layout technique:
1. Narrow (580–680px) for body text — optimal reading measure
2. Medium (900–960px) for images, pull quotes, and wider content
3. Full-bleed for hero photography and section dividers

The shift between these widths as you scroll creates the magazine rhythm. Without it, the page feels like a blog post, not a publication.

**Magazine grid for index/listing pages:** Asymmetric grids with one large feature item + smaller secondary items. A 12-column grid with the lead story spanning 7 columns and secondary stories in the remaining 5, or similar. Never a uniform grid of identical cards.

**Hero for articles:** Full-bleed image with text BELOW (not overlaid) — editorial style presents the image as a photograph to be appreciated, not a background to be read over. Or: large serif headline centered above the fold with byline/date below and image after.

**Section padding:** Moderate — 3–5rem vertical. Editorial is content-dense, which means less dramatic whitespace than other aesthetics, but still comfortable. The density should feel intentional, not cramped.

## Backgrounds & Depth

**Paper feel.** Warm off-white backgrounds with subtle surface alternation. The shift between base and surface tones should feel like turning between different paper stocks.

**No gradients.** Flat, honest backgrounds. Gradients feel digital; editorial aims to feel printed.

**No shadows in article view.** Use rules (hairlines) and whitespace for separation instead. Shadows feel like a dashboard, not a magazine.

**Shadows in grid/index view only:** Very subtle, barely there — just enough to lift clickable article cards.

**Image treatments:** No border-radius on editorial images (or 2px max). Photographs are presented as photographs — sharp rectangles. An optional subtle border (1px in the rule color) frames them like a printed image.

## Motion

**Restrained.** Editorial design trusts the content to be interesting. Animation should be nearly invisible.

**Page load:** Simple opacity fade, 0.3–0.4s. No staggering — the content arrives as a complete page, like turning to a new page.

**Scroll reveals:** Optional and very subtle. Opacity only, no transform. Or skip entirely — many editorial sites use no scroll animation at all, and that's fine.

**Hover on links:** Underline transitions. Color change to accent. The underline is the editorial interaction signature.

**Hover on article cards (grid view):** Image scale 1.02, headline color shifts to accent. Minimal.

**Avoid:** Elaborate entrance animations, parallax, anything that says "look at this animation" instead of "read this content."

## Navigation

Simple horizontal bar. Logo/masthead in the display serif, larger, with weight. Nav links in the sans-serif UI font, small, well-spaced. No prominent CTA button — editorial sites rarely hard-sell. A thin rule below the nav separating it from content.

Optional: a secondary category strip below the main nav with category links in small uppercase sans-serif with wide letter-spacing. Rules above and below.

On mobile: hamburger or simple text "Menu" link. Full-width dropdown with generous spacing.

## Components

**Article cards (grid):** Image on top (sharp rectangle, no radius), category label in small uppercase sans-serif accent color, headline in display serif, metadata line (date, author, read time) in small sans-serif dim text. No background container — just content with whitespace.

**Blockquotes/pull quotes:** Display serif, italic, larger than body. Accent-colored thin border on the left or top. Generous vertical margin. These are editorial punctuation marks.

**Bylines and metadata:** Sans-serif, small, sometimes uppercase with letter-spacing. Separated by middle dots or thin vertical rules. Date, author, reading time, category.

**Footer:** Multi-column: about/description, navigation, newsletter. Thin rule on top. Surface background. Publication name in the display serif, everything else in sans-serif.

## What Makes This Aesthetic Work

The three-voice typographic system. Display serif for headings creates authorial weight. Body serif for text creates reading comfort. Sans-serif for UI/metadata creates functional contrast. Remove any one voice and the design feels flat. The combination — plus the three-width layout rhythm — is what makes a page feel like a designed publication rather than a generic blog.
`;
