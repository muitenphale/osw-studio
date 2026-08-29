import { describe, it, expect } from 'vitest';

import { renderReviewPasswordPage } from '../gate-page';

/**
 * The gate page is the one piece of HTML this instance serves to an anonymous caller, and it
 * interpolates a deployment name chosen by a workspace member. It also has to work with no network:
 * it is the door to the review copy, so a blocked font or stylesheet cannot be what stops a client
 * getting in.
 */

const DEPLOYMENT = 'aaaaaaaa-1111-2222-3333-444444444444';

describe('renderReviewPasswordPage', () => {
  it('posts back to the deployment it was rendered for', () => {
    const html = renderReviewPasswordPage({ deploymentId: DEPLOYMENT, name: 'Acme' });

    expect(html).toContain(`action="/review/${DEPLOYMENT}"`);
    expect(html).toContain('method="post"');
    expect(html).toContain('type="password"');
    expect(html).toContain('name="password"');
  });

  it('escapes a deployment name rather than interpolating markup into the page', () => {
    const html = renderReviewPasswordPage({
      deploymentId: DEPLOYMENT,
      name: '<script>alert(1)</script>',
    });

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes a name carrying an attribute break', () => {
    const html = renderReviewPasswordPage({
      deploymentId: DEPLOYMENT,
      name: '" onload="alert(1)',
    });

    expect(html).not.toContain('onload="alert(1)"');
    expect(html).toContain('&quot;');
  });

  it('shows an error only when one is given', () => {
    const clean = renderReviewPasswordPage({ deploymentId: DEPLOYMENT, name: 'Acme' });
    const failed = renderReviewPasswordPage({
      deploymentId: DEPLOYMENT,
      name: 'Acme',
      error: 'That password did not match.',
    });

    expect(clean).not.toContain('That password did not match.');
    expect(failed).toContain('That password did not match.');
  });

  it('references nothing off this page', () => {
    const html = renderReviewPasswordPage({
      deploymentId: DEPLOYMENT,
      name: 'Acme',
      error: 'nope',
    });

    // No CDN, no font host, no <img>/<link>/<script src> of any kind: the page must render intact
    // for a client on a locked-down corporate network.
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toMatch(/<link\b/i);
    expect(html).not.toMatch(/\bsrc\s*=/i);
  });

  it('tells crawlers not to index a client\'s unpublished site', () => {
    const html = renderReviewPasswordPage({ deploymentId: DEPLOYMENT, name: 'Acme' });

    expect(html).toMatch(/<meta name="robots" content="noindex/i);
  });
});
