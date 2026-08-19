import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateNavigationScript } from '../multipage-preview';

/**
 * Two wirings that only the emitted text and the file can show.
 *
 * Both were real defects, and both are invisible to every other test in the suite: the first is a
 * branch inside a template literal, the second a call site inside a `useEffect` in a 2500-line
 * component that only a real iframe can drive.
 */

const source = readFileSync(join(process.cwd(), 'components/preview/multipage-preview.tsx'), 'utf8');

describe('the toolbar is gated on the runtime', () => {
  it('tracks the element for a runtime that supports direct editing', () => {
    const script = generateNavigationScript('/index.html', true);
    expect(script).toContain('var __oswDirectEdit = true;');
    expect(script).toContain('if (__oswDirectEdit) __oswToolbarTrack(target);');
  });

  it('emits the flag as false where it does not', () => {
    const script = generateNavigationScript('/index.html', false);
    expect(script).toContain('var __oswDirectEdit = false;');
  });

  it('never calls the tracker unguarded', () => {
    // The gate is one line in a template literal, so a later edit that adds a second, unguarded
    // call would restore a toolbar of four buttons that all refuse.
    for (const directEdit of [true, false]) {
      const script = generateNavigationScript('/index.html', directEdit);
      const calls = script.match(/__oswToolbarTrack\(target\)/g) ?? [];
      const guarded = script.match(/if \(__oswDirectEdit\) __oswToolbarTrack\(target\)/g) ?? [];
      expect(calls.length, 'an unguarded __oswToolbarTrack call').toBe(guarded.length);
    }
  });

  it('defaults to supported, so no existing caller changes behaviour', () => {
    expect(generateNavigationScript('/index.html')).toContain('var __oswDirectEdit = true;');
  });
});

describe('the frame message guard', () => {
  it('rejects a message when this mount has no iframe of its own', () => {
    // The workspace mounts the preview twice and only the visible mount renders an iframe, so in the
    // other one `iframeRef.current` is null. Written as `iframeRef.current && source !== ...`, the
    // `&&` short-circuited and that mount accepted every message the *visible* frame posted — its
    // `onFocusSelection` carries `surface: 'mobile'`, whose rule includes every selection, so
    // selecting an element attached it to the next message with nothing pressed.
    expect(source).toContain('if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) {');
    expect(source).not.toContain('if (iframeRef.current && event.source !== iframeRef.current.contentWindow)');
  });
});
