/**
 * Frontend Design: Terminal - Built-in Skill
 * CLI aesthetic, monospace, command-prompt nostalgia
 */

export const FRONTEND_DESIGN_TERMINAL_SKILL = `---
name: frontend-design-terminal
description: Terminal aesthetic — CLI feel, monospace throughout, command-prompt nostalgia. Phosphor green or amber on black, ASCII art, type-on text effects. Use for hacker/dev tools, technical writing, retro-computing brands, anything that should feel like a command-line.
---

# Terminal Aesthetic

> **Parent skill:** Read \`/.skills/frontend-design.md\` first for the required Design Intent block, universal principles, and image/responsive guidance.

CLI feel. Monospace throughout. Command-prompt nostalgia. This aesthetic embraces the visual language of terminal emulators and early-computing interfaces — phosphor-glow text on black, blinking cursors, ASCII art, type-on effects. Different from industrial (which is dense modern data UI) — terminal is *retro*-computing, deliberately evoking 1970s mainframes or 1980s personal computers. Think hacker culture, retro game devs, niche text-first publications, command-line tool brands.

This sub-skill describes the *character* of terminal aesthetics; layout is yours to design. Many universal-principle defaults (multi-font hierarchy, varied content widths) are inverted here — terminal designs are typographically uniform.

## Typography

**Display font character:** Monospace. Always. Usually a single monospace font for the entire site. Look for fonts with strong character: VT323 (CRT terminal), Press Start 2P (8-bit), IBM Plex Mono, JetBrains Mono, Berkeley Mono, Departure Mono, or any clean modern mono. The font choice signals the era — pixelated for 80s, clean modern for cyberpunk-modern, slab for typewriter-feel.

**Body font character:** Same monospace as display, or a closely-paired second mono. Single-mono pages are common and valid.

**Find fonts that vary from project to project.** Browse Google Fonts for monospace: VT323, Press Start 2P, IBM Plex Mono, JetBrains Mono, Space Mono, DM Mono, Geist Mono, Major Mono Display, Share Tech Mono, Departure Mono, Fira Code. Each project should pick a different mono. The era it evokes shifts with the choice.

**Scale:** Restrained. Headings only modestly larger than body — terminal text rarely had dramatic size hierarchy. Often the entire page is a single size or just two sizes (heading and body). Body at 14–16px feels period-correct.

**Treatment:** Often all-caps for headings (terminals often had no lowercase). Or mixed case in lowercase-only style. Sometimes inverse video for emphasis (background filled, text in bg color). Underscores for emphasis instead of bold.

## Color

**Single-color systems are correct.** Phosphor green (#33ff33) on black, amber (#ffb000) on black, white on blue (CGA/EGA-era), or modern variations.

**Base construction:** Pure black or near-black. Slight green or amber tint to the background depending on phosphor color (\`#001100\` for green-tinted, \`#1a0a00\` for amber-tinted). Surface variation through different intensities of the phosphor color.

**Accent strategy:** The single phosphor color IS the design. Variations come from intensity — full-bright for headings (#33ff33), mid-bright for body (#22aa22), dim for metadata (#116611). Three intensity tiers replace the usual three text tiers.

**Multi-color terminal options.** Accept these only if period-authentic: ANSI colors (16-color palette), DOS-blue background with white text, or modern terminal themes (Solarized Dark, Dracula). State the era in the Design Intent.

**No gradients, no soft tints, no opacity tricks.** Terminal pixels are either on or off — that's the aesthetic.

**Vary per project.** Phosphor green one project, amber the next, ANSI palette after that, modern dark-theme palette after that. The aesthetic is *terminal*, not specifically green-on-black.

## Spatial Logic

**Character-grid alignment.** Treat layout as if it's locked to a character grid — fixed-width columns where things fit by character count, not by px. Use \`ch\` units liberally.

**Single-column dominant.** Terminal displays were single-column scrolling buffers. A page that feels like a long terminal session — content streaming top to bottom in a fixed-width column — is correct.

**Tight density.** Terminal text is dense. Section padding minimal (1–3rem). Lines stacked closely. Minimal whitespace.

**ASCII art and text decoration.** Box-drawing characters (\`│ ─ ┌ ┐ └ ┘ ├ ┤ ┬ ┴ ┼\`) for borders and dividers. ASCII art logos. Text-based ornaments (\`***\`, \`---\`, \`===\` for separators).

## Backgrounds & Depth

**Flat black, optionally with scanlines.**

**Scanline overlay:** Subtle horizontal-line pattern at 3–5% opacity for CRT feel. \`repeating-linear-gradient(transparent 0, transparent 1px, rgba(0,0,0,0.1) 2px)\`.

**Phosphor glow on text:** \`text-shadow: 0 0 4px currentColor\` adds the soft luminescence of CRT phosphor. Subtle but signature.

**Optional CRT curvature.** Heavy effect, use sparingly — a slight viewport-level border-radius and inset shadow to suggest a curved CRT screen.

**No images, mostly.** Terminal aesthetics are text-first. If images appear: dithered, ASCII-converted, or constrained to the phosphor color through CSS filters.

## Motion

**Type-on effects are signature.** Text appearing character by character (like typing) is the iconic terminal motion. Use for hero text and key reveals.

**Cursor blink.** A blinking text cursor (block or underscore) feels essential — even if just at the end of one element on the page.

**No smooth easing.** Terminal interfaces had no animation. If transitions exist, use \`linear\` or \`step()\` to evoke that limitation.

**Boot-sequence entrances.** Page entrance can simulate boot logs — text rendering line by line with delays, optional faux loading messages.

**Hover:** Inverse video (background and foreground swap). No transition timing — instant. This is the period-authentic hover behavior.

**Avoid:** Smooth fades, scale animations, parallax, modern easing — all anachronistic.

## Components

**Buttons:** Often just bracketed text \`[ EXECUTE ]\` or angle-bracket-styled \`< submit >\`. Or solid filled blocks of phosphor color with black text inside. Hover: inverse video swap.

**Inputs:** Underline (\`____________\`) or bracketed \`[          ]\`. Focus shown via blinking cursor inside. Labels prefixed with \`>\` or \`$\`.

**Lists and menus:** Often presented as menu options with letters or numbers \`(a) option one\`, \`(b) option two\`. Or arrow-prefixed \`> selected option\`.

**Headers and sections:** Often boxed with ASCII characters or underlined with \`=\`/\`-\`. Section labels sometimes prefixed with \`##\` or \`>\` like markdown.

**Navigation:** Often a top bar of bracketed links \`[ HOME ] [ ABOUT ] [ DOCS ]\` or a sidebar of menu items.

**Terminal prompts in copy.** Address users with \`>\` or \`$\` prompts. Status messages with \`[OK]\` \`[WARN]\` \`[ERR]\` prefixes. Style copy itself in terminal voice.

## Anti-patterns Specific to This Aesthetic

- Sans-serif body fonts — fundamentally incompatible
- Soft shadows or smooth gradients — anachronistic
- Color photography presented normally — wrong era
- Smooth modern animation — wrong era
- Multiple typefaces — terminal is mono-typographic
- Heavy decoration — terminals are sparse

## What Makes This Aesthetic Work

Period authenticity through restraint. Terminal aesthetics succeed when they fully commit to the limitations of early-computing displays — single font, single color (or limited palette), tight character-grid layout, no smooth motion. The constraints become the design language. Modern affordances (smooth animation, anti-aliased multi-color, layered shadows) immediately break the spell. The risk is reading as a coding-bootcamp landing page — counter that with genuine retro-computing references (boot sequences, ANSI palettes, ASCII art) rather than just "use a mono font on a dark background."
`;
