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
