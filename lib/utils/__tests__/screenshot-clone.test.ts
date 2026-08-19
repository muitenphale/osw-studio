// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { prepareScreenshotClone } from '../screenshot';
import { TOOLBAR_HOST_ATTR } from '@/lib/preview/toolbar-dom';

/**
 * What html2canvas is allowed to see when it clones the preview document.
 *
 * The selection toolbar is the reason this test exists. It lives *inside* the previewed document and
 * is **visible for as long as an element is selected** — unlike the selection overlay, which hides
 * itself the moment the selection is made. So a user who selects an element and then captures a
 * thumbnail gets the toolbar painted into it. The previous, host-rendered design was immune by
 * construction: a fixed div in the host page is outside the iframe, and html2canvas never saw it.
 *
 * Tested here rather than only through the frame because `onclone` is shared: the preview header's
 * capture button hands `captureIframeScreenshot` the **live** preview frame, and
 * `lib/utils/project-thumbnail.ts` and `lib/utils/deployment-thumbnail.ts` reach the same function
 * with their own offscreen frames. This is the one place all of them pass through.
 */

/**
 * A previewed page with a toolbar in it.
 *
 * Two shapes, and the difference is the point. A frame document has a `defaultView`, which is what
 * html2canvas hands over in the ordinary case; `createHTMLDocument` does not, which is the shape the
 * rest of this function early-returns on. Using only the second would make "it strips the toolbar"
 * and "it strips it before the guard" the same test.
 */
function docWithToolbar(withView: boolean): Document {
  let doc: Document;
  if (withView) {
    const frame = document.createElement('iframe');
    document.body.appendChild(frame);
    doc = frame.contentDocument!;
  } else {
    doc = document.implementation.createHTMLDocument('preview');
  }
  doc.body.innerHTML = '<main id="content">hello</main>';
  const host = doc.createElement('div');
  host.setAttribute(TOOLBAR_HOST_ATTR, '1');
  doc.body.appendChild(host);
  return doc;
}

describe('preparing the html2canvas clone', () => {
  it('strips the selection toolbar and keeps the page', () => {
    const doc = docWithToolbar(true);
    expect(doc.defaultView).not.toBeNull();

    prepareScreenshotClone(doc);

    expect(doc.querySelector(`[${TOOLBAR_HOST_ATTR}]`)).toBeNull();
    // A carve-out, not a purge: the page it was covering has to survive the same pass.
    expect(doc.querySelector('#content')).not.toBeNull();
  });

  it('strips it even when the clone has no window to compute styles in', () => {
    // The toolbar has to come out *before* the `defaultView` guard, or whether the thumbnail is
    // clean depends on a branch that has nothing to do with the toolbar.
    const doc = docWithToolbar(false);
    expect(doc.defaultView).toBeNull();

    prepareScreenshotClone(doc);

    expect(doc.querySelector(`[${TOOLBAR_HOST_ATTR}]`)).toBeNull();
  });
});
