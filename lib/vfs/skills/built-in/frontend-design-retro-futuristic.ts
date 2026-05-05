/**
 * Frontend Design: Retro-Futuristic - Built-in Skill
 * Y2K chrome, synthwave, vaporwave, dated-future
 */

export const FRONTEND_DESIGN_RETRO_FUTURISTIC_SKILL = `---
name: frontend-design-retro-futuristic
description: Retro-futuristic aesthetic — chrome, gradients, scanlines, dated visions of the future. Pulls from Y2K, synthwave, vaporwave, and 80s/90s sci-fi. Use for music brands, fashion drops, nostalgic tech, creative portfolios, anything that wants to feel like the future as imagined in 1985.
---

# Retro-Futuristic Aesthetic

> **Parent skill:** Read \`/.skills/frontend-design.md\` first for the required Design Intent block, universal principles, and image/responsive guidance.

Chrome. Gradients. Scanlines. Glow. Dated visions of the future. This aesthetic mines a specific kind of nostalgia — not for the past as it was, but for the future as it was *imagined*. Synthwave album covers. Y2K iPod packaging. Vaporwave room aesthetics. 80s sci-fi UI. Late-90s software splash screens. Pick one decade-flavor and commit; mixing eras dilutes the spell.

This sub-skill describes the *character* of retro-futurism; layout is yours to design — keep choices consistent with the chosen decade-flavor.

## Choose a Decade-Flavor First

Retro-futurism is a family of aesthetics. Pick one before you start:

- **Y2K (1999–2003):** Glossy chrome, frosted plastic, candy translucency, bevelled buttons, blue-on-white. Think early Apple, MSN Messenger, the Bondi iMac.
- **Synthwave (1980s-future):** Magenta and cyan gradients, sun-on-grid horizons, neon outlines, VHS scanlines, dark backgrounds. Think Drive soundtrack, Stranger Things title cards.
- **Vaporwave (90s-mall-future):** Pastel pink and teal, Greek statues, Japanese typography, glitch artifacts, low-bitrate JPEG aesthetic, Windows 95 chrome. Think mall liminal spaces.
- **80s sci-fi UI:** Wireframe vector graphics, monochrome green or amber on black, blocky kerning, technical readouts. Think Alien's Mother, Tron, early CAD systems.

State the chosen flavor in the Design Intent block. The rest of this sub-skill applies across flavors but the specific palette and typography come from the choice above.

## Typography

**Display font character:** Strong period flavor. Y2K uses rounded sans (think Eurostile, Bank Gothic). Synthwave uses chrome-ready geometric sans, often italicized. Vaporwave mixes Times New Roman with Japanese characters. 80s sci-fi UI uses condensed monospace or wireframe-style display fonts.

**Body font character:** Match the period. Often a clean monospace works for any flavor. A geometric sans-serif works for Y2K and synthwave.

**Find fonts that vary from project to project.** Browse Google Fonts for period-appropriate options: VT323, Press Start 2P (8-bit games), Major Mono Display (terminal), Audiowide (Y2K), Orbitron (synthwave), DM Mono, Space Mono. Match the chosen decade-flavor.

**Scale:** Often dramatic. Synthwave especially loves enormous type with chrome treatment. Y2K loves smaller, glossy buttons. Vaporwave loves text that looks like stretched 1990s WordArt.

**Treatment:** Italic display text feels appropriately period for synthwave. Letter-spacing wide on technical labels. Synthwave often uses chrome gradient fills on heading text via background-clip. Y2K loves 3D bevels and embossing.

## Color

**Strong period palette.** This is one of the few aesthetics where saturated, even garish, color is correct.

**Y2K:** Translucent blues, frosted whites, baby pink, lime green. Glossy plastic feel. Backgrounds often gradient blue-to-white with high transparency layers.

**Synthwave:** Deep purple-black backgrounds. Magenta (#ff00ff or #ff2a6d) and cyan (#00fff0) as primary accents. Hot pink. Electric violet. Sunset gradients (orange to magenta to purple). Glow on every accent.

**Vaporwave:** Pastel teal, hot pink, lavender, peach. Often on a dusty pink or pale teal base. Greek-statue gray. JPEG-compression artifact colors.

**80s sci-fi UI:** Phosphor green (#33ff33) or amber (#ffb000) on near-black. Single-color systems are correct. Or: deep blue and red on black for "computer warning" feel.

**Vary per project.** Don't reuse the exact same magenta-cyan combo every synthwave project — shift the temperature, swap dominant for accent, push toward purple or toward orange.

## Spatial Logic

**Period layout cues.** Y2K loves modular floating panels with rounded corners and frosted backgrounds. Synthwave loves vast horizons and centered hero compositions with glowing single elements. Vaporwave loves asymmetric collage with overlapping elements at random angles. 80s sci-fi UI loves grid-locked technical readouts with labeled values.

**Section padding:** Variable by flavor. Synthwave wants generous (6–10rem) for the cinematic feel. Y2K wants tighter (3–5rem) for the modular feel. Vaporwave doesn't care about consistency.

**Composition supports the period.** Don't force modern responsive grid logic — period authenticity is more important than perfect alignment.

## Backgrounds & Depth

**This is where retro-futurism lives.**

**Y2K:** Glossy gradient backgrounds. Layered translucent panels with backdrop-blur. White-to-blue radial gradients. Shine highlights on every surface.

**Synthwave:** Vast gradient skies (purple to magenta to orange). Animated grid floors using CSS perspective transforms. Sun discs. Distant mountain silhouettes. Glow effects on text and borders (\`text-shadow: 0 0 20px var(--accent)\`).

**Vaporwave:** Pastel gradient backgrounds. Decorative imagery: Greek statues, Japanese characters (大切, 美), checkerboard floors, palm trees, dolphins, low-poly objects. Image overlays.

**80s sci-fi UI:** Pure black or near-black backgrounds. Subtle scanline overlay (linear-gradient striped pattern at very low opacity). Wireframe geometric decorations. Phosphor glow on text.

**Scanlines are a free win.** A subtle horizontal-line CSS overlay (\`repeating-linear-gradient\` at 1–2% opacity) adds period authenticity to most flavors instantly.

## Motion

**Period-appropriate motion.**

**Y2K:** Bouncy easing on hover (it's allowed here, unlike most aesthetics). Loading spinners with chrome. Frosted panels that fade in.

**Synthwave:** Slow continuous motion — animated grid floors, drifting starfields, slowly pulsing glow. Hero text often slides in from off-screen with a faint trail.

**Vaporwave:** Glitch effects on hover (RGB channel separation). Slow, dreamy fades. Image distortion on scroll.

**80s sci-fi UI:** Type-on text effects (text appearing character by character). Cursor blinks. Sudden state changes with no easing. Boot-sequence-style entrance.

## Components

**Buttons:** Period-flavored. Y2K wants gradient fills, rounded corners, and inset highlight. Synthwave wants neon outline with glow. Vaporwave wants Windows-95 chrome bevels. 80s sci-fi wants thin border with terminal-style label.

**Cards/panels:** Period-flavored too. Translucent and frosted (Y2K), neon-outlined (synthwave), collage-overlapped (vaporwave), bordered with technical labels (80s sci-fi).

**Icons:** Wireframe or low-poly icons feel correct for synthwave and 80s sci-fi. Glossy 3D icons for Y2K. Pixel art for any flavor.

## Anti-patterns Specific to This Aesthetic

- Modern flat design — kills the period feel instantly
- "Tasteful" muted accent colors — period authenticity wants saturation
- Mixing decade-flavors without intent — synthwave + Y2K together usually looks confused
- Smooth modern easing on Y2K (which wants bounce) or Y2K bevels on synthwave (which wants glow)
- Sans-serif system fonts — kills period authenticity

## What Makes This Aesthetic Work

Period commitment. Retro-futurism succeeds by leaning fully into a specific decade's vision of the future, including its excesses. Half-commitment reads as confused. Pick one flavor, then execute every detail consistent with it — typography, color, motion, decoration. The right magenta on the wrong layout still feels wrong. The wrong magenta on the right layout might still work.
`;
