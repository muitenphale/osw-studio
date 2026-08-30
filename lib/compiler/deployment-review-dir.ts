import path from 'path';
import { deploymentsRoot } from '@/lib/deployments-root';

/**
 * Where a deployment's review build lives.
 *
 * Deliberately NOT under `public/`. The generated Caddy config serves that whole tree with
 * `handle /deployments/*` → `root * {publicRoot}` → `file_server` (lib/caddy/regenerate.ts), so
 * anything written there is fetchable by anyone holding the URL, under `STATIC_PROXY` Caddy
 * answers the request and Next never sees it, leaving nowhere to check anything. A review build is
 * gated on a password and an expiry, so it has to be served by a route that can enforce them,
 * which requires it to sit outside the web root.
 *
 * Sits beside the per-deployment databases so it is created, moved and deleted with them.
 */
export function deploymentReviewDir(deploymentId: string): string {
  return path.join(deploymentsRoot(), deploymentId, 'review-build');
}
