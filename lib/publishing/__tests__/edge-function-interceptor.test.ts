import { describe, it, expect } from 'vitest';
import { processHtml, HtmlProcessingOptions } from '@/lib/publishing/html-processor';
import { generateReviewWidget } from '@/lib/publishing/review-widget';
import { reviewApiBase } from '@/lib/review/api-base';
import { PublishSettings } from '@/lib/vfs/types';
import { interceptPage } from './interceptor-harness';

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
    hasEdgeFunctions: true,
  };
}

const page = () => interceptPage(processHtml(HTML, options()));

describe('edge function interceptor', () => {
  it('still rewrites an ordinary relative call', () => {
    // The control for every exclusion below: if the interceptor stopped rewriting anything, the
    // exclusions would all "pass" while edge functions were quietly broken.
    expect(page().route('/submit-form')).toBe('/api/deployments/dep-1/functions/submit-form');
  });

  it('leaves the review prefix alone', () => {
    const url = `${reviewApiBase('dep-1')}/comments`;
    expect(page().route(url)).toBe(url);
  });

  it('leaves absolute, api, asset and fragment URLs alone', () => {
    const probe = interceptPage(processHtml(HTML, options()));
    expect(probe.route('https://example.com/x')).toBe('https://example.com/x');
    expect(probe.route('/api/deployments/dep-1/functions/x')).toBe('/api/deployments/dep-1/functions/x');
    expect(probe.route('/logo.png')).toBe('/logo.png');
    expect(probe.route('#anchor')).toBe('#anchor');
  });
});

describe('review widget request URLs', () => {
  it('are absolute, so the interceptor on the same page cannot claim them', () => {
    const widget = generateReviewWidget('dep-1');
    expect(widget).toContain('window.location.origin + API + path');
  });

  it('survive the interceptor sharing the page with them', () => {
    const origin = 'https://studio.example.com';
    const reviewPage = interceptPage(
      processHtml(HTML, { ...options(), reviewWidget: true }),
      origin
    );
    const base = `${origin}${reviewApiBase('dep-1')}`;

    expect(reviewPage.widgetRequest('/comments', {})).toBe(`${base}/comments`);
    expect(reviewPage.widgetRequest('/comments/c-1', { method: 'PATCH', body: '{}' })).toBe(
      `${base}/comments/c-1`
    );
    expect(reviewPage.widgetRequest('/participant', { method: 'PATCH', body: '{}' })).toBe(
      `${base}/participant`
    );
  });
});
