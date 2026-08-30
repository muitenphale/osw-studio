// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { processHtml, HtmlProcessingOptions } from '@/lib/publishing/html-processor';
import { REVIEW_WIDGET_MARKER, generateReviewWidget } from '@/lib/publishing/review-widget';
import { PublishSettings } from '@/lib/vfs/types';

const HTML = '<html><head><title>x</title></head><body><h1>Hi</h1></body></html>';

function publishSettings(): PublishSettings {
  return {
    enabled: true,
    underConstruction: false,
    headScripts: [],
    bodyScripts: [],
    cdnLinks: [],
    analytics: { enabled: false, provider: 'builtin', privacyMode: true },
    seo: {},
    compliance: {
      enabled: false,
      bannerPosition: 'bottom',
      bannerStyle: 'bar',
      message: 'We use cookies.',
      acceptButtonText: 'Accept',
      declineButtonText: 'Decline',
      mode: 'opt-in',
      blockAnalytics: true,
    },
    settingsVersion: 1,
  };
}

function options(): HtmlProcessingOptions {
  return {
    publishSettings: publishSettings(),
    projectId: 'proj-1',
    baseUrl: 'https://example.com',
    deploymentId: 'dep-1',
  };
}

describe('review widget injection', () => {
  it('the public build pass never emits the review widget', () => {
    const out = processHtml(HTML, options());
    expect(out).not.toContain(REVIEW_WIDGET_MARKER);
  });

  it('the review build pass emits the review widget', () => {
    const out = processHtml(HTML, { ...options(), reviewWidget: true });
    expect(out).toContain(REVIEW_WIDGET_MARKER);
  });

  it('stays out of the public build even when review-ish settings are present', () => {
    // The widget is opt-in per build pass. Nothing in PublishSettings, and no combination of
    // enabled features, may turn it on — a misconfiguration must not reach a live site.
    const settings = publishSettings();
    settings.compliance.enabled = true;
    settings.analytics.enabled = true;
    const out = processHtml(HTML, {
      publishSettings: settings,
      projectId: 'proj-1',
      baseUrl: 'https://example.com',
      deploymentId: 'dep-1',
      hasEdgeFunctions: true,
      reviewWidget: false,
    });
    expect(out).not.toContain(REVIEW_WIDGET_MARKER);
  });

  it('places the widget inside the document body', () => {
    const out = processHtml(HTML, { ...options(), reviewWidget: true });
    // Both bounds matter: everything precedes </body>, so the upper bound alone would also pass
    // for a widget injected into <head>.
    expect(out.indexOf(REVIEW_WIDGET_MARKER)).toBeGreaterThan(out.indexOf('<body'));
    expect(out.indexOf(REVIEW_WIDGET_MARKER)).toBeLessThan(out.indexOf('</body>'));
    expect(out).toContain('Review copy, not live');
  });

  it('injects last, after the consent banner', () => {
    const settings = publishSettings();
    settings.compliance.enabled = true;
    const out = processHtml(HTML, {
      publishSettings: settings,
      projectId: 'proj-1',
      baseUrl: 'https://example.com',
      deploymentId: 'dep-1',
      reviewWidget: true,
    });
    expect(out).toContain('osw-consent-banner');
    expect(out.indexOf(REVIEW_WIDGET_MARKER)).toBeGreaterThan(out.indexOf('osw-consent-banner'));
  });

  it('does not inject a second widget into already-processed HTML', () => {
    const once = processHtml(HTML, { ...options(), reviewWidget: true });
    const twice = processHtml(once, { ...options(), reviewWidget: true });

    // Two hosts means the second script instance calls attachShadow on the first host and throws.
    const hosts = (html: string) => html.split(`<div ${REVIEW_WIDGET_MARKER}=`).length - 1;
    expect(hosts(once)).toBe(1);
    expect(hosts(twice)).toBe(1);
  });

  it('emits no external references', () => {
    expect(generateReviewWidget('d')).not.toMatch(/https?:|\/\//);
    expect(generateReviewWidget('d')).not.toMatch(/@import|url\(|src=/);
  });

  it('escapes the deployment id', () => {
    expect(generateReviewWidget('a"><script>x</script>')).not.toContain('<script>x');
  });
});

// ---------------------------------------------------------------------------
// The emitted script has to be valid JavaScript
// ---------------------------------------------------------------------------

describe('the emitted widget script', () => {
  /**
   * The widget ships as script text assembled from template literals, so a syntax error in it is
   * invisible to `tsc` and to every test that only inspects the markup. It would first surface as a
   * dead widget in someone's review session, with the customer's page otherwise intact.
   *
   * `new Function` parses without running: the body expects a browser it does not have here.
   */
  it('parses', () => {
    const script = generateReviewWidget('dep-1').match(/<script>([\s\S]*)<\/script>/);

    expect(script).not.toBeNull();
    expect(() => new Function(script![1])).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// The brand mark
// ---------------------------------------------------------------------------

describe('the review bar logo', () => {
  /**
   * The mark is the OSW Studio logo inlined from components/ui/logo.tsx, not a letter in a coloured
   * square. It carries no `xmlns`, deliberately: the attribute's value contains `//`, which the
   * no-external-references check above cannot tell from a protocol-relative URL. Inline SVG written
   * through `innerHTML` in an HTML document is put in the SVG namespace by the parser anyway, and
   * the next test is what holds that claim up.
   */
  /** The chrome is emitted as a JS string literal, so `<` arrives escaped. */
  function chromeMarkup(): string {
    const assignment = generateReviewWidget('dep-1').match(
      /chrome\.innerHTML = "((?:[^"\\]|\\.)*)"/
    );
    expect(assignment).not.toBeNull();
    return JSON.parse(`"${assignment![1]}"`) as string;
  }

  it('inlines the logo geometry rather than a letter', () => {
    const markup = chromeMarkup();

    expect(markup).toContain('<svg class="mark"');
    expect(markup).toContain('viewBox="0 0 256 256"');
    // Four glyph paths: O, S, W, S.
    expect(markup.match(/<path d="M/g) ?? []).toHaveLength(4);
    // The letter-in-a-square placeholder this replaced.
    expect(markup).not.toContain('<span class="mark">');
    expect(generateReviewWidget('dep-1')).not.toContain('xmlns');
  });

  it('parses into the SVG namespace without an xmlns attribute', () => {
    const host = document.createElement('div');
    host.innerHTML = chromeMarkup();

    const svg = host.querySelector('.mark');
    expect(svg).not.toBeNull();
    expect(svg!.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(svg!.querySelectorAll('path')).toHaveLength(4);
  });
});
