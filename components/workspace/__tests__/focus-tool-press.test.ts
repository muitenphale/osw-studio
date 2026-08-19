import { describe, it, expect } from 'vitest';
import { focusToolPress } from '../index';

/**
 * What a press of the Styles tab's `Select element` button asks for.
 *
 * Exported and asserted as a pure function for the same reason `previewHoverHighlight` and
 * `focusReloadAction` are: nothing in the repo renders `Workspace`, so a rule left inline in the
 * handler is a rule nothing can check.
 *
 * The rule is that this button and the preview header's crosshair are one control with two faces.
 * The crosshair has always toggled (`setFocusToolArmed(!selectorActive)`); a panel button that only
 * ever *set* the flag left the user looking at an armed picker with no way to stand it down from
 * the panel they armed it from, and — the part that reads as a bug rather than a missing feature —
 * a second press that did visibly nothing at all.
 *
 * `openPreview` is the half that is not simply `armed`. Arming means putting the preview where it
 * can be used, so it may open the panel; cancelling must not, because opening a panel as part of a
 * cancel is the opposite of the request. Collapsing the two into one boolean is the mistake this
 * shape exists to make impossible.
 */

describe('focusToolPress', () => {
  it('arms from disarmed, and brings the preview along', () => {
    expect(focusToolPress({ armed: false })).toEqual({ armed: true, openPreview: true });
  });

  it('disarms when already armed — the second press is the way out', () => {
    expect(focusToolPress({ armed: true }).armed).toBe(false);
  });

  it('does not open the preview panel to cancel', () => {
    // The cancel case finds the preview open in practice, since the Styles empty state does not
    // render otherwise. What this forbids is encoding "the press opens the preview" unconditionally,
    // which would make a cancel from any future surface pop a panel the user was closing.
    expect(focusToolPress({ armed: true }).openPreview).toBe(false);
  });

  it('is a pure toggle — pressing twice returns to where it started', () => {
    const once = focusToolPress({ armed: false });
    expect(focusToolPress({ armed: once.armed }).armed).toBe(false);
  });
});
