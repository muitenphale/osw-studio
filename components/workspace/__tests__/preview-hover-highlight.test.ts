import { describe, it, expect } from 'vitest';
import { previewHoverHighlight } from '../index';

/**
 * Which highlight the Styles tab's `Select element` button asks for while the pointer is on it.
 *
 * Exported and asserted as a pure function for the same reason `focusReloadAction` and
 * `applyToolbarAction` are: nothing in the repo renders `Workspace`, so a rule left inline in the
 * component is a rule nothing can check.
 *
 * The rule that matters is that "highlight the preview panel" is **two different calls**. The nav
 * buttons all route through `handleSidebarHover`, and that function returns early and *clears* both
 * previews when the panel it is asked about is already open — correctly, because for a nav button an
 * open panel means the press closes it and there is nothing to preview. This button does not close
 * the preview; it arms a tool inside it. So the already-open case has to point `panelReplacePreview`
 * straight at the preview instead, and only the closed case may be routed.
 *
 * Getting that backwards is silent: hovering draws nothing at all, which looks exactly like a hover
 * handler that was never wired.
 */

describe('previewHoverHighlight', () => {
  it('asks for the panel itself when the preview is already open', () => {
    // The case the user is actually in: the Styles empty state only renders with the preview open.
    expect(previewHoverHighlight({ hovering: true, previewOpen: true })).toBe('panel');
  });

  it('routes through the sidebar decision when the preview is closed', () => {
    // Closed means the press will *open* it, and what to outline then — an insert position, or the
    // panel that gets evicted — is a decision `handleSidebarHover` already owns.
    expect(previewHoverHighlight({ hovering: true, previewOpen: false })).toBe('route');
  });

  it('clears on leave whether the preview is open or not', () => {
    // The leave is the half that gets forgotten, and forgetting it strands a dashed outline on the
    // panel for as long as the tab stays on the empty state.
    expect(previewHoverHighlight({ hovering: false, previewOpen: true })).toBe('clear');
    expect(previewHoverHighlight({ hovering: false, previewOpen: false })).toBe('clear');
  });
});
