import { describe, it, expect, afterEach } from 'vitest';
import path from 'path';
import { deploymentsStaticRoot, deploymentStaticDir } from '@/lib/compiler/deployment-static-dir';

/**
 * Publishing wrote to `cwd/public/deployments`, and on a desktop install `cwd` is the app bundle
 * (main.ts chdirs into it). That is read-only on Linux and Windows, so publishing failed with
 * EACCES, and on macOS it landed inside the bundle where the next drag-install discarded it.
 */
const ORIGINAL = process.env.DEPLOYMENTS_STATIC_DIR;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.DEPLOYMENTS_STATIC_DIR;
  else process.env.DEPLOYMENTS_STATIC_DIR = ORIGINAL;
});

describe('where published output goes', () => {
  it('defaults to public/deployments, which is what Caddy serves', () => {
    // lib/caddy/regenerate.ts roots at `cwd/public` and maps the URL path onto the filesystem, so
    // changing this default would break a STATIC_PROXY install.
    delete process.env.DEPLOYMENTS_STATIC_DIR;

    expect(deploymentsStaticRoot()).toBe(path.join(process.cwd(), 'public', 'deployments'));
  });

  it('follows DEPLOYMENTS_STATIC_DIR when the install directory cannot be written', () => {
    process.env.DEPLOYMENTS_STATIC_DIR = '/var/osw/deployments-static';

    expect(deploymentStaticDir('dep-1')).toBe('/var/osw/deployments-static/dep-1');
  });

  it('keeps the deployment id as the first path segment under the root', () => {
    // A request for /deployments/{id}/page.html is resolved by joining the requested path onto
    // this directory, so the id has to stay a single segment directly under the root.
    process.env.DEPLOYMENTS_STATIC_DIR = '/tmp/static';

    expect(path.relative('/tmp/static', deploymentStaticDir('dep-1'))).toBe('dep-1');
  });
});
