import { describe, it, expect } from 'vitest';
import { TEMPLATE_COMPONENT_CSS, templateTokens } from '@/lib/vfs/templates/theme';

/**
 * The component CSS was lifted out of the theme artifact mechanically, and the one thing a
 * mechanical lift gets wrong is context: a rule reads the same whether or not it sat inside an
 * `@media` block. These pin the parts where losing the wrapper would be silent.
 */
describe('shared component CSS', () => {
  it('keeps the motion opt-out behind the media query that asked for it', () => {
    // Extracted flat, `transition: none !important` applies to everyone, and every template ships
    // with its transitions and its button hover dead. Nothing renders wrong, so nothing catches it.
    const reduced = TEMPLATE_COMPONENT_CSS.indexOf('@media (prefers-reduced-motion: reduce)');
    expect(reduced).toBeGreaterThan(-1);
    expect(TEMPLATE_COMPONENT_CSS.indexOf('transition: none !important')).toBeGreaterThan(reduced);
    expect(TEMPLATE_COMPONENT_CSS.indexOf('animation: none !important')).toBeGreaterThan(reduced);
  });

  it('balances its braces, so the last rule closes the file rather than the media query', () => {
    const opens = (TEMPLATE_COMPONENT_CSS.match(/\{/g) ?? []).length;
    const closes = (TEMPLATE_COMPONENT_CSS.match(/\}/g) ?? []).length;
    expect(opens).toBe(closes);
  });

  it('makes the hidden attribute win against components that set a display', () => {
    // [hidden] is a browser default and any author rule outranks it, so `.notice { display: flex }`
    // keeps an element on screen after a script sets `el.hidden = true`.
    expect(TEMPLATE_COMPONENT_CSS).toMatch(/\[hidden\]\s*\{[^}]*display:\s*none\s*!important/);
  });
});

describe('tokens and components agree', () => {
  it('defines every custom property the components read', () => {
    // The two halves were extracted separately, and a missing token is silent: the declaration is
    // dropped and the element renders without it. `--shadow-sm` went missing exactly this way, so
    // every primary button sat flat with nothing to show for the box-shadow it asked for.
    const declared = new Set(
      [...templateTokens({ hue: 40 }).matchAll(/(--[a-z-]+)\s*:/g)].map((m) => m[1]),
    );
    const used = new Set(
      [...TEMPLATE_COMPONENT_CSS.matchAll(/var\((--[a-z-]+)/g)].map((m) => m[1]),
    );
    // A component may define its own, as .label-mono does for --font-label.
    const definedByComponents = new Set(
      [...TEMPLATE_COMPONENT_CSS.matchAll(/(--[a-z-]+)\s*:/g)].map((m) => m[1]),
    );

    const missing = [...used].filter((v) => !declared.has(v) && !definedByComponents.has(v));
    expect(missing).toEqual([]);
  });

  it('declares the same properties whichever scheme a template picked', () => {
    // Otherwise a dark template quietly loses a token a light one has, and only that template
    // breaks.
    const names = (css: string) =>
      [...css.matchAll(/(--[a-z-]+)\s*:/g)].map((m) => m[1]).sort();
    expect(names(templateTokens({ hue: 40, scheme: 'dark' }))).toEqual(
      names(templateTokens({ hue: 40 })),
    );
  });
});

describe('template tokens', () => {
  it('varies only what the spec allows a template to vary', () => {
    // Section 09 of the artifact: accent hue, light or dark, density, serif. Two templates on the
    // same scheme differ in their accent and nowhere else, which is what keeps them a family.
    const a = templateTokens({ hue: 285 });
    const b = templateTokens({ hue: 145 });

    const surfaceLines = (css: string) =>
      css.split('\n').filter((line) => /--(canvas|sunken|base|raised|ink|line)/.test(line));

    expect(surfaceLines(a)).toEqual(surfaceLines(b));
    expect(a).not.toBe(b);
    expect(a).toContain('oklch(0.57 0.19 285)');
    expect(b).toContain('oklch(0.57 0.19 145)');
  });

  it('scales the smaller radii off the one a template sets', () => {
    // A template picks one number for density; the rest follow, so nothing has to hand-tune three.
    expect(templateTokens({ hue: 40, radius: 6 })).toContain('--r-lg: 6px;');
    expect(templateTokens({ hue: 40, radius: 6 })).toContain('--r-md: 4px;');
  });
});
