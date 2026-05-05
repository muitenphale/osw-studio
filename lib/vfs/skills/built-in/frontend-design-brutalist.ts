/**
 * Frontend Design: Brutalist - Built-in Skill
 * Raw, exposed, anti-design, defiantly ugly
 */

export const FRONTEND_DESIGN_BRUTALIST_SKILL = `---
name: frontend-design-brutalist
description: Brutalist aesthetic — raw, exposed, anti-design, deliberately rough. Uses default browser styling, harsh contrast, system fonts, and refuses polish. Use for underground brands, art collectives, manifestos, music sites, anything that wants to reject mainstream slickness.
---

# Brutalist Aesthetic

> **Parent skill:** Read \`/.skills/frontend-design.md\` first for the required Design Intent block, universal principles, and image/responsive guidance.

Raw. Exposed. Anti-design. Defiantly rough. Brutalist web design rejects the polish of mainstream interfaces — visible borders, default fonts, harsh color, structural honesty over visual comfort. Think early-web personal sites, art zines, underground music labels, fashion houses that want to feel adversarial. The point is not "ugly for ugly's sake" — the point is *honesty*. Nothing is hidden. Nothing is softened.

This sub-skill describes the *character* of brutalism; layout is yours to design. Many universal-principle defaults (warm tints, soft shadows, rounded corners) are inverted here. Where this sub-skill conflicts with the parent skill, this one wins.

## Typography

**Display font character:** System fonts treated as a feature, not a fallback. Times New Roman, Courier, Arial, Helvetica — used unironically and at unusual sizes. Or: a single brutally heavy display font (Helvetica Neue Black, Druk, condensed grotesques) used aggressively. Never an elegant serif unless the elegance is being weaponized.

**Body font character:** Whatever the display font is, OR system serif paired with system sans. Single-font designs are common and valid. The font should feel default, not curated.

**Find fonts that vary from project to project.** When deviating from system fonts, look for fonts with strong character: condensed grotesques, slab serifs with mechanical stress, or Google Fonts categorized as "display" with extreme proportions. Each project should pick one direction (system-default OR one heavy display) and commit.

**Scale:** Extreme, often inappropriate. Headings can be enormous (8–12rem) or tiny. Body text can be 12px or 24px. The mismatch between conventional sizing and the chosen sizing IS the design. Use \`clamp()\` only where useful — not as a default.

**Treatment:** Often uppercase, often crammed, often with negative letter-spacing on display sizes so letters touch. Or fully default treatment with no styling at all. Underlines on links — actual underlines, not styled hover effects. Visited link colors visible (purple, default).

## Color

**Brutal contrast.** Pure #000 on pure #fff is valid here — one of the few aesthetics where this works. Or: a single ugly color (warning yellow, hazard orange, browser-blue #0000ee) on a stark base.

**Base construction:** Pure white or pure black. Not warmed, not cooled. Pure neutrals are mandatory — tinted ones contradict the aesthetic.

**Accent strategy:** One harsh color, used everywhere or nowhere. Default browser-blue links (#0000EE) are valid. Hazard yellow (#FFFF00). Hot pink. Warning red. The color should feel like signage, not branding.

**No gradients, no colored shadows, no tints.** All flat, all harsh.

**Vary per project.** Different harsh palette each time: hazard yellow + black one project, browser-blue + white the next, hot pink + black after that.

## Spatial Logic

**Visible structure.** Borders. Lots of borders. Solid 1–2px lines that show where boxes are. Tables used unironically as layout. Grids that don't try to hide their grid-ness.

**Content can crash and overlap.** Elements touching, overlapping, or sitting at uncomfortable angles is fine. Symmetry is not a virtue here.

**Section padding:** Often inconsistent — that's part of the aesthetic. Some sections cramped, others with absurd whitespace. The unevenness is intentional.

**Default-browser layout is permitted.** A page styled almost entirely with browser defaults is a valid brutalist outcome. So is a page with extreme custom positioning. What's NOT valid is the safe middle.

## Backgrounds & Depth

**None, or aggressively patterned.** Either pure flat color (most common) or harsh repeating patterns: solid color blocks, hatch lines, scrollable marquee text bars, ASCII art backgrounds.

**No shadows. No depth.** Brutalism is flat by doctrine.

**Borders carry the structural load.** Where other aesthetics use shadow or whitespace to separate elements, brutalism uses visible black lines.

## Motion

**Either zero motion or jarring motion.** No middle ground.

**Zero option:** Static page. Default browser link behavior. No hover transitions. No scroll effects. Elements appear instantly.

**Jarring option:** Marquee text. Blink (yes, actually). Sudden color flashes on hover (no transition — instant). Hover states that feel hostile (sudden inversion, sudden border thickening). Cursor changes that surprise.

**No smooth easing curves.** Easing belongs to other aesthetics. Brutalism uses \`linear\` or \`step()\` if it uses transitions at all.

## Components

**Buttons:** No border-radius. Visible 2–3px border in pure black. No shadow. Often default browser button styling preserved or exaggerated. Hover: instant inversion (black bg becomes white bg, etc.).

**Links:** Underlined. Visited links a different color. Hover: thicker underline or instant background flash.

**Forms:** Default browser inputs. Or aggressively styled with thick borders, no rounding, sharp corners. Labels uppercase, often crammed against the input.

**"Cards":** Just bordered boxes. Solid 2px border. No background variation. No shadow. Internal padding minimal.

## Anti-patterns Specific to This Aesthetic

- Soft shadows — fundamentally incompatible
- Rounded corners — fundamentally incompatible
- Smooth easing curves — fundamentally incompatible
- Pastel colors — fundamentally incompatible
- "Tasteful" design choices — defeats the point
- Trying to look polished — brutalism is a rejection of polish

## What Makes This Aesthetic Work

Conviction. Brutalism fails when it's half-committed — a polished site with one ugly element looks like a mistake, while a fully-committed brutalist site looks intentional and has its own aggressive elegance. The honesty of exposed structure, system fonts, and harsh contrast becomes its own form of beauty. The risk is performative ugliness — pick a clear axis (raw structure, system-default, harsh color, or jarring motion) and execute it with full conviction. Half-brutalism is the only way to fail.
`;
