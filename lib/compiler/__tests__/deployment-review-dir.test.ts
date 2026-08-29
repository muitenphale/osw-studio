import { describe, it, expect, afterEach } from 'vitest';
import path from 'path';
import { deploymentsStaticRoot } from '@/lib/compiler/deployment-static-dir';
import { deploymentReviewDir } from '@/lib/compiler/deployment-review-dir';

/**
 * A review build is gated on a password and an expiry, so it has to be served by a route that can
 * check them. Under STATIC_PROXY the generated Caddy config answers every request under the public
 * root (`handle /deployments/*` → `file_server`, lib/caddy/regenerate.ts) without Next ever seeing
 * it, so a review build placed there would be readable by anyone holding the URL, with no code
 * positioned to object.
 */
const ORIGINAL = process.env.DEPLOYMENTS_DIR;
const ORIGINAL_STATIC = process.env.DEPLOYMENTS_STATIC_DIR;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.DEPLOYMENTS_DIR;
  else process.env.DEPLOYMENTS_DIR = ORIGINAL;
  if (ORIGINAL_STATIC === undefined) delete process.env.DEPLOYMENTS_STATIC_DIR;
  else process.env.DEPLOYMENTS_STATIC_DIR = ORIGINAL_STATIC;
});

const segments = (p: string) => p.split(path.sep).filter(Boolean);

describe('where a review build goes', () => {
  it('defaults beside the per-deployment databases', () => {
    // Same root as the runtime/analytics SQLite files, so the review build is created, moved and
    // deleted with the deployment directory rather than needing its own lifecycle.
    delete process.env.DEPLOYMENTS_DIR;

    expect(deploymentReviewDir('dep-1')).toBe(
      path.join(process.cwd(), 'deployments', 'dep-1', 'review-build')
    );
  });

  it('follows DEPLOYMENTS_DIR, keeping the <root>/<id>/review-build shape', () => {
    process.env.DEPLOYMENTS_DIR = '/var/osw/deployments';

    expect(deploymentReviewDir('dep-1')).toBe('/var/osw/deployments/dep-1/review-build');
  });

  it('is outside the tree Caddy file_servers', () => {
    // The concrete failure this guards: escaping deploymentsStaticRoot() is what keeps the
    // password and expiry checks from being bypassable.
    delete process.env.DEPLOYMENTS_DIR;
    delete process.env.DEPLOYMENTS_STATIC_DIR;

    const escape = path.relative(deploymentsStaticRoot(), deploymentReviewDir('dep-1'));
    expect(segments(escape)[0]).toBe('..');
  });
});
