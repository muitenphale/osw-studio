/**
 * Frontend Design: Industrial - Built-in Skill
 * Utilitarian, monospace, data-dense, blueprint precision
 */

export const FRONTEND_DESIGN_INDUSTRIAL_SKILL = `---
name: frontend-design-industrial
description: Industrial aesthetic — utilitarian, technical, data-dense, blueprint precision. Monospace type, exposed grids, technical labels, schematic feel. Use for developer tools, technical products, infrastructure brands, dashboards, anything that should feel engineered and informational.
---

# Industrial Aesthetic

> **Parent skill:** Read \`/.skills/frontend-design.md\` first for the required Design Intent block, universal principles, and image/responsive guidance.

Utilitarian. Technical. Data-dense. Blueprint precision. This aesthetic feels engineered rather than designed — exposed grids, monospace labels, technical readouts, schematic clarity. Different from brutalism (which is *anti*-design) — industrial is heavily designed, just to feel like a piece of equipment rather than a poster. Think Linear, Vercel docs, Figma's internal tools, well-designed dashboards, technical product brands like Teenage Engineering.

This sub-skill describes the *character* of industrial design; layout is yours to design — keep choices consistent with the technical voice below.

## Typography

**Display font character:** Often monospace, or a very neutral grotesque sans-serif. Industrial design treats type as information rather than decoration. Look for: high-quality monospace fonts with character (JetBrains Mono, IBM Plex Mono, Geist Mono, Berkeley Mono), or precise neo-grotesques (Inter, Geist Sans — used here as character because the *use* makes them industrial).

**Body font character:** Either the same monospace (full-monospace pages are valid here) or a clean sans paired with monospace for technical labels. The mix of body sans + monospace label is the signature industrial typographic combo.

**Find fonts that vary from project to project.** Browse Google Fonts: JetBrains Mono, IBM Plex Mono, Space Mono, DM Mono, Geist Mono, Fira Code, Roboto Mono. Each project should pick a different mono. The neutral sans pairing also varies.

**Scale:** Restrained. Headings only modestly larger than body — the hierarchy is functional, not theatrical. Body text often slightly smaller than other aesthetics (0.875–1rem) to support density. Labels in mono, often tiny (0.75rem) with letter-spacing.

**Treatment:** Mixed case. Numeric content emphasized — technical numbers, version strings, IDs feel correct in monospace. Labels above values, often in small uppercase mono with letter-spacing. Code-like text rendering everywhere.

## Color

**Restrained and functional.** Not warm, not playful. Technical neutrals with one functional accent.

**Base construction:** Deep cool-shifted blacks for dark mode, true near-whites for light mode. NOT warm — coolness reinforces the technical feel. Pure neutrals are correct here (one of the few aesthetics where untinted gray works). Surface variation between background and 5% lighter for cards/panels.

**Accent strategy:** One functional color used for state and emphasis. Often a saturated color that reads as "data" — cyan, electric blue, lime, signal orange. The accent indicates action, status, or category, not decoration.

**Status colors are core.** Green for success, amber for warning, red for error, blue/cyan for info. These are part of the visual language, not just for alerts — show them in metadata, badges, version indicators.

**No gradients except as data viz.** Color gradients used to encode information (heatmaps, sparklines, progression bars) are fine. Decorative gradients are not.

**Vary per project.** Different functional accent per project: lime one project, electric blue another, signal orange a third. Status colors stay consistent (green/amber/red) but the brand accent shifts.

## Spatial Logic

**Density is correct here.** Industrial design respects the user's screen real estate — pack information in.

**Section padding:** Tight by aesthetic standards — 2–4rem vertical between major sections. Inside sections, components sit close together.

**Strong grid alignment.** Everything snaps to a baseline grid. Vertical rhythm matters — line-heights and spacing all multiples of a base unit (often 4 or 8px). Use \`grid-template-columns\` literally; the grid lines should feel almost visible.

**Visible structure.** Thin borders (1px) defining sections. Hairline rules between data rows. Section corners with technical labels (a region might be labeled \`SEC.01 / OVERVIEW\` in tiny mono). Dotted-line decorations for blueprint feel.

**Tabular layouts where data exists.** Tables, key-value lists, terminal-style readouts. Don't disguise tabular data as cards — present it as tables.

## Backgrounds & Depth

**Flat or grid-textured.** Solid technical neutrals. Optional very-low-opacity grid pattern (0.03 opacity dot grid or line grid) for blueprint feel.

**No gradients on backgrounds.** Save gradients for data viz.

**Subtle technical decoration.** Crosshair markers in section corners. Coordinate-style labels in margins. Reference lines. SVG diagrams or wireframe sketches as decoration.

**Borders carry depth.** Thin 1px borders in slightly-different-from-bg color. Multiple-border treatments (a border + an outline) for layered feel. No soft shadows — that's organic territory.

## Motion

**Mechanical and precise.** Snappy transitions, no overshoot, no bounce. Easing should feel like a switch flipping or a relay engaging.

**Page entrance:** Either no entrance animation or a quick (0.15–0.2s) fade. Industrial design prefers content arriving instantly — like a CLI output.

**Scroll reveals:** Often skipped entirely. If used: opacity only, very fast (0.2s).

**Hover:** Subtle and immediate. Border color shifts. Background tint changes. Cursor changes to indicate function. Transitions 0.1–0.15s — sharper than other aesthetics.

**Loading states matter.** Spinner animations, progress bars, type-on text effects for terminal-style feedback. These are part of the aesthetic.

**Data viz animation.** Charts and graphs animating on data changes is a signature industrial motion — controlled, purposeful, informative.

## Components

**Buttons:** Sharp corners (border-radius 0–4px). Tight padding. Mono or neutral sans label. Often with a small status indicator or icon. Primary buttons in accent, secondary with thin border. No shadow, no gradient — flat with hover state shift.

**Cards/panels:** Bordered (1px). No or minimal border-radius. Tight internal padding. Often with a header row containing a label and metadata. Backgrounds slightly lifted from page bg.

**Form inputs:** Bordered, sharp corners or 2–4px max. Mono font for input text. Label above in small uppercase mono. Focus state: border shifts to accent color. No fancy ring effects.

**Tables and data:** First-class citizens. Hairline rules. Mono for numeric columns. Dim labels, full-color values. Status indicators inline.

**Code blocks and terminal output.** Treated as primary content. Mono throughout. Subtle syntax-highlight-like color application even in marketing copy — version numbers, file paths, commands styled differently.

**Tooltips and overlays.** Functional, square corners, mono labels. Feel like dev tools rather than marketing UI.

## Anti-patterns Specific to This Aesthetic

- Warm-tinted neutrals — fights the cool technical feel
- Soft shadows — too organic
- Rounded corners above 4px — softens the precision
- Decorative gradients — reads as marketing rather than tooling
- Bouncy or elastic motion — fights the mechanical feel
- Generous airy spacing — fights the information density

## What Makes This Aesthetic Work

The honest presentation of structure. Industrial design earns trust by showing what it is — exposed grids, technical labels, density that respects the viewer's intelligence. Compare to "tech startup marketing site" which hides the technical underneath gradients and rounded cards: industrial design *is* the technical, presented as the design. The risk is feeling spreadsheet-like or unwelcoming to non-technical viewers — counter that with precise typography and a single well-chosen accent color, not by warming up the tone.
`;
