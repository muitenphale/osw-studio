import path from 'path';

/**
 * The root holding one directory per deployment — its runtime and analytics databases, and its
 * review build.
 *
 * `DEPLOYMENTS_DIR` redirects it, the way `DATA_DIR` redirects the core database. A desktop install
 * needs that override: `main.ts` chdirs into the app bundle, so `cwd` is the install directory,
 * which is read-only on Linux and Windows and is replaced wholesale by the next drag-install on
 * macOS.
 *
 * Every path under a deployment must resolve through this one function. A deployment's databases
 * and its review build share a directory precisely so that deleting the directory disposes of
 * both; two independent readings of `DEPLOYMENTS_DIR` could drift, and the recursive delete would
 * then clear one tree while orphaning the other on disk with nothing raised.
 */
export function deploymentsRoot(): string {
  return process.env.DEPLOYMENTS_DIR || path.join(process.cwd(), 'deployments');
}
