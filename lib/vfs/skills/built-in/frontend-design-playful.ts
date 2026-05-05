/**
 * Frontend Design: Playful - Built-in Skill
 * Toy-like, bright, bouncy, illustrative
 */

export const FRONTEND_DESIGN_PLAYFUL_SKILL = `---
name: frontend-design-playful
description: Playful aesthetic — toy-like, bright, bouncy, illustrative. Soft shapes, candy colors, friendly mascots, generous animation. Use for kids brands, games, creative tools, learning platforms, joyful consumer products, anything that should feel like fun.
---

# Playful Aesthetic

> **Parent skill:** Read \`/.skills/frontend-design.md\` first for the required Design Intent block, universal principles, and image/responsive guidance.

Toy-like. Bright. Bouncy. Illustrative. This aesthetic communicates joy and approachability through soft shapes, saturated candy colors, friendly characters, and generous animation. Different from soft-organic (which is gentle and trustworthy for adults) — playful is *fun*, with a willingness to look silly. Think Duolingo, MailChimp's classic era, Slack's mascot illustrations, indie game studios, kids' learning apps.

This sub-skill describes the *character* of playfulness; layout is yours to design — keep choices consistent with the energy below.

## Typography

**Display font character:** Rounded, friendly, often with handwritten or hand-drawn quality. Bubbly geometric sans-serifs, rounded slabs, or genuinely handwritten fonts. Weight 700–800 to feel chunky and toy-like. The font should feel like it could be made of plastic.

**Body font character:** A friendly sans-serif with rounded terminals. Different from display but matching its warmth. Regular weight (400–500), comfortable readability.

**Find fonts that vary from project to project.** Browse Google Fonts for: Fredoka, Baloo 2, Lilita One, Caveat (handwritten), Patrick Hand, Sniglet, Quicksand. Each project should pick a different display font. Avoid converging on the same chunky-rounded sans every time.

**Scale:** Friendly-large. Hero headings substantial but not aggressive (clamp 2.5–4.5rem). Body text comfortable (1–1.1rem). Labels often slightly larger than other aesthetics, in friendly weight.

**Treatment:** Sentence case or even all lowercase for headings — uppercase is too formal. Natural letter-spacing. Sometimes decorative underlines (squiggly, hand-drawn) under emphasized words. Friendly punctuation choices: exclamation marks, em-dashes used conversationally.

## Color

**Saturated and candy-bright.** Multiple accent colors used together, like a kids' art-supply box.

**Base construction:** Often light or warm white, but saturated colored bases work too (mint green, baby blue, soft yellow). Surface variation between background and slightly-different-color cards.

**Accent strategy:** Multiple accents, used in coordinated ways. Each section can use a different primary color, or different content types each get a color (a green for nature features, a blue for water features, etc.). The key is *systematic* multi-color, not random.

**Color combinations to explore:** Coral + turquoise + butter yellow + lavender. Hot pink + mint + sky blue + sunshine. Each project picks a different palette.

**Tinted everything.** Backgrounds, badges, button hovers, shadows — all tinted toward accent colors rather than gray.

**Vary per project.** A different multi-color palette each project. The aesthetic is the *combination* of bright colors, not a specific combination.

## Spatial Logic

**Generous spacing with bouncy density.** Not as dense as maximalist, not as restrained as minimal. Content with room to play.

**Section padding:** 4–6rem vertical. Comfortable, friendly.

**Asymmetry and rotation are fun.** Elements at slight angles (1–3 degrees of rotation), slightly off-grid alignment, content that pops out of containers. Don't lock everything to a strict grid.

**Decorative elements with personality.** Squiggles, stars, hearts, hand-drawn arrows, simple shapes scattered as decoration. Used to reinforce friendliness, not as luxury ornament.

## Backgrounds & Depth

**Soft, colorful, with character.**

**Tinted backgrounds.** Sections in different soft pastels — switch base color between sections for rhythm.

**Doodled decorations.** Hand-drawn-style SVG: arrows, hearts, stars, squiggles, dots. Used as visual punctuation. These can be inline decoration or floating in margins.

**Soft colored shadows.** Shadows in accent colors rather than gray. Cards with mint shadows, buttons with coral shadows. Layered for depth.

**Optional illustrated mascots.** Friendly character illustrations as part of the design. Big eyes, simple shapes, expressive poses. Can anchor hero sections or appear as decorative friends throughout.

**No photography (usually).** Illustration is the default visual language. If photos appear, they're treated playfully — bright color filters, rounded corners, decorative borders.

## Motion

**Bouncy motion is correct here.** Unlike most aesthetics where bounce reads as cheap, here it reads as fun. \`cubic-bezier(0.68, -0.55, 0.265, 1.55)\` and similar overshoot easings are valid.

**Page entrance:** Elements bounce or pop in. Stagger generously (0.1–0.15s between items). Headings can rotate slightly into final position. Decorative elements appear with a small bounce.

**Scroll reveals:** Energetic. Translate from below with bounce easing. Decorations rotate or scale in. Each kind of element has its own personality.

**Hover:** Substantial reactions. Cards lift 6–8px and tilt slightly. Buttons scale up (1.05). Mascots wave or wiggle. Hovers should feel rewarding.

**Continuous decorative motion.** A floating star that slowly drifts, a mascot whose eyes blink, a decoration that gently bounces in place. Adds life.

**Interactive feedback.** Click states should feel satisfying — buttons depress with shadow disappearing, elements jiggle on click, success states celebrate.

## Components

**Buttons:** Generous border-radius (12–999px, often pill-shaped). Bold display font. Saturated fill color with slight 3D feel (subtle gradient or shadow underneath suggesting depth). Hover scales up; click presses down. Often with a small icon.

**Cards:** Rounded corners (16–24px). Tinted backgrounds rather than white. Layered colored shadows. Often with a small decorative element (star, squiggle) escaping the card edge.

**Tags/badges:** Pill-shaped. Saturated tinted backgrounds. Sometimes with small icons or emoji.

**Form inputs:** Rounded (12–16px). Friendly border treatment. Focus state with bouncy color shift. Labels in friendly weight.

**Icons:** Simple, rounded, illustrated rather than line-icons. Often filled with accent colors.

## Anti-patterns Specific to This Aesthetic

- Sharp corners — fights the toy-like feel
- Muted or desaturated colors — kills the candy energy
- Restrained motion — fights the bounciness
- Serious typography (heavy serifs, technical sans) — wrong tone
- Clean professional photography — wants illustration instead
- All-uppercase headings — too formal

## What Makes This Aesthetic Work

Permission to be silly. Most aesthetics worry about looking unprofessional; playfulness embraces a kind of intentional immaturity. The risk is reading as childish (for an adult audience) or too commercial (for an art audience). The fix is craft — carefully drawn illustration, systematic color, considered motion. Sloppy playful design looks cheap; precise playful design looks delightful. The fun should feel made, not generated.
`;
