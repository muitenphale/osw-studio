// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * The thumbnail capture has to supply the blob-URL map itself.
 *
 * Compiled pages no longer carry a copy of it, so the asset interceptor inside the captured frame
 * resolves runtime requests through `window.__oswVfsBlobUrls` and nothing else. The preview host
 * injects it; this is the other renderer, and a thumbnail that skipped it would lose every asset a
 * script asks for while the page renders, with no error.
 */

const mocks = vi.hoisted(() => ({
  compileProject: vi.fn(),
  cleanupBlobUrls: vi.fn(),
  captureIframeScreenshot: vi.fn(),
  getProject: vi.fn(),
  init: vi.fn(),
}));

vi.mock('@/lib/vfs', () => ({
  vfs: { init: mocks.init, getProject: mocks.getProject },
}));
vi.mock('@/lib/preview/virtual-server', () => ({
  VirtualServer: class {
    compileProject = mocks.compileProject;
    cleanupBlobUrls = mocks.cleanupBlobUrls;
  },
}));
vi.mock('../screenshot', () => ({ captureIframeScreenshot: mocks.captureIframeScreenshot }));

/** srcdoc as the capture set it, taken at the moment the screenshot is requested. */
let renderedHtml = '';

beforeEach(() => {
  vi.clearAllMocks();
  renderedHtml = '';
  mocks.init.mockResolvedValue(undefined);
  mocks.getProject.mockResolvedValue({ id: 'p1', settings: { runtime: 'static' } });
  mocks.captureIframeScreenshot.mockImplementation((iframe: HTMLIFrameElement) => {
    renderedHtml = iframe.srcdoc;
    return Promise.resolve('data:image/jpeg;base64,x');
  });

  // jsdom does not load srcdoc, so the capture would wait on an onload that never fires.
  vi.spyOn(HTMLIFrameElement.prototype, 'srcdoc', 'set').mockImplementation(function (
    this: HTMLIFrameElement,
    value: string
  ) {
    Object.defineProperty(this, 'srcdoc', { value, configurable: true, writable: true });
    setTimeout(() => this.onload?.(new Event('load')), 0);
  });
});

describe('capturing a project thumbnail', () => {
  it('gives the frame the blob-URL map its interceptor needs', async () => {
    mocks.compileProject.mockResolvedValue({
      files: [{ path: '/index.html', content: '<html><head></head><body></body></html>' }],
      blobUrls: new Map([['/img/hero.png', 'blob:http://localhost/hero']]),
    });

    const { captureProjectScreenshot } = await import('../project-thumbnail');
    const result = await captureProjectScreenshot('p1');

    expect(result).toBe('data:image/jpeg;base64,x');
    expect(renderedHtml).toContain('window.__oswVfsBlobUrls');
    expect(renderedHtml).toContain('/img/hero.png');
    expect(renderedHtml).toContain('blob:http://localhost/hero');
  });

  it('returns nothing when the project has no index page to capture', async () => {
    mocks.compileProject.mockResolvedValue({ files: [], blobUrls: new Map() });

    const { captureProjectScreenshot } = await import('../project-thumbnail');

    expect(await captureProjectScreenshot('p1')).toBeNull();
  });
});
