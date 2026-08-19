import { describe, it, expect } from 'vitest';
import { crosshairHintClass } from '../multipage-preview';

/**
 * The header crosshair's remote hover: what it wears while the pointer is on the Inspector's
 * `Select element` button, which arms the same tool from the other side of the workspace.
 *
 * Pure, because the component around it is 1200 lines with an iframe in the middle and nothing
 * renders it under test. What the *store* does with the flag between the two is
 * `lib/stores/__tests__/layout.test.ts`; that the panel button raises and drops it is
 * `components/styles-content/__tests__/select-element.test.tsx`. This owns only what the tint is.
 *
 * The classes are the `ghost` variant's own `hover:` rule with the pseudo-class removed, so a
 * pointer on the crosshair itself and a pointer on the panel button paint the same colours.
 */

describe('crosshairHintClass', () => {
  it('paints the ghost hover colours while hinted', () => {
    const classes = crosshairHintClass({ hinted: true, armed: false, hasFocusTarget: false });
    expect(classes).toContain('bg-accent');
    expect(classes).toContain('text-accent-foreground');
  });

  it('is nothing at all when not hinted', () => {
    // The default state of the header, which is most of the time. Returning a class here would
    // leave every preview's crosshair permanently tinted.
    expect(crosshairHintClass({ hinted: false, armed: false, hasFocusTarget: false })).toBeUndefined();
  });

  it('yields to the armed tint', () => {
    // Both controls stay on screen while the picker is armed, so a hover on the panel button with
    // the tool already armed is an ordinary thing to do. Armed is a state; a hint is a hint.
    expect(crosshairHintClass({ hinted: true, armed: true, hasFocusTarget: false })).toBeUndefined();
  });

  it('yields to the focus-target tint', () => {
    expect(crosshairHintClass({ hinted: true, armed: false, hasFocusTarget: true })).toBeUndefined();
  });
});
