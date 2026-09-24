import 'server-only';
import { buildStaticDeployment, cleanStaticDeployment } from '@/lib/compiler/static-builder';
import { checkDeploymentQuota } from '@/lib/publishing/quota';
import { generateUniqueSlug } from '@/lib/publishing/slug-generator';
import {
  getDeploymentBySlug,
  getDeploymentRoute,
  getDeploymentWorkspace,
  getWorkspaceById,
  registerDeploymentRoute,
} from '@/lib/auth/system-database';
import { regenerateInstanceCaddy } from '@/lib/caddy/regenerate';
import type { SQLiteAdapter } from '@/lib/vfs/adapters/sqlite-adapter';

/**
 * Publishing a deployment: quota, slug, build, metadata, route registration and Caddy.
 *
 * Extracted from the publish route so the route and the MCP tool run the same steps. The order
 * matters and is load-bearing:
 *
 * - The slug is resolved *before* the build, because the static builder uses it to decide asset
 *   path style. Assigning it afterwards made every first publish emit prefixed paths that then
 *   404'd once the subdomain served at root.
 * - The cross-workspace guard runs *before* the build too. `registerDeploymentRoute` refuses a
 *   deployment another workspace owns, and by the time it ran the site had been written and the
 *   record already carried a new `publishedAt`, so the caller was told the publish failed while
 *   the deployment was marked published.
 */

export type PublishOutcome =
  | { ok: true; deploymentId: string; projectId: string; filesWritten: number; outputPath: string; slug: string; lastPublishedVersion: number | null }
  | { ok: false; status: 403 | 409 | 500; error: string };

export async function publishDeployment(
  adapter: SQLiteAdapter,
  workspaceId: string,
  deploymentId: string,
): Promise<PublishOutcome> {
  const workspace = getWorkspaceById(workspaceId);
  if (workspace) {
    const actualDeployments = (await adapter.listDeployments?.()) || [];
    const quota = checkDeploymentQuota({
      isAlreadyRegistered: !!getDeploymentWorkspace(deploymentId),
      maxDeployments: workspace.max_deployments,
      actualDeploymentCount: actualDeployments.length,
    });
    if (!quota.allowed) return { ok: false, status: 403, error: quota.error ?? 'Deployment quota reached' };
  }

  const previousRoute = getDeploymentRoute(deploymentId);
  if (previousRoute && previousRoute.workspace_id !== workspaceId) {
    return {
      ok: false,
      status: 409,
      error:
        'This deployment is registered to another workspace, so it cannot be published from this one. That usually means the same deployment exists in two workspace databases, which happens when more than one workspace was created on an instance carrying a legacy data/osws.sqlite.',
    };
  }

  const oldSlug = previousRoute?.slug || null;
  const preBuildDeployment = await adapter.getDeployment?.(deploymentId);
  const slug = oldSlug || preBuildDeployment?.slug || generateUniqueSlug(s => !!getDeploymentBySlug(s));
  if (preBuildDeployment && adapter.updateDeployment && preBuildDeployment.slug !== slug) {
    preBuildDeployment.slug = slug;
    await adapter.updateDeployment(preBuildDeployment);
  }

  const result = await buildStaticDeployment(deploymentId, workspaceId);
  if (!result.success) {
    return { ok: false, status: 500, error: result.error || 'Failed to build deployment' };
  }

  const deployment = await adapter.getDeployment?.(deploymentId);
  if (deployment && adapter.updateDeployment) {
    deployment.lastPublishedVersion = deployment.settingsVersion;
    deployment.publishedAt = new Date();
    deployment.updatedAt = new Date();
    if (!deployment.databaseEnabled) {
      deployment.databaseEnabled = true;
      await adapter.enableDeploymentDatabase(deploymentId);
    }
    await adapter.updateDeployment(deployment);
  }

  registerDeploymentRoute(deploymentId, workspaceId, slug, deployment?.customDomain);
  regenerateInstanceCaddy().catch(() => {});

  return {
    ok: true,
    deploymentId: result.deploymentId,
    projectId: result.projectId,
    filesWritten: result.filesWritten,
    outputPath: result.outputPath,
    slug,
    lastPublishedVersion: deployment?.settingsVersion ?? null,
  };
}

export type UnpublishOutcome =
  | { ok: true; deploymentId: string }
  | { ok: false; status: 404 | 500; error: string };

/**
 * Unpublishing a deployment: remove what is served, and forget that it was published.
 *
 * The inverse of `publishDeployment`, and deliberately not a flag. A deployment is live when its
 * built files exist, so taking it off traffic means removing them; `cleanStaticDeployment` drops
 * both the public output and the review build, which is the whole of what a visitor can reach.
 *
 * What stays is everything the next publish would otherwise have to rebuild from nothing: the
 * deployment row and its settings, the runtime database with whatever edge functions wrote, the
 * analytics history, and the routing entry. Keeping the route matters twice over. The slug stays
 * reserved, so republishing returns the site to the same URL instead of rolling a new one; and the
 * per-slug Caddy block stays, so a request 404s there rather than falling through to the wildcard
 * block, which proxies to Node and would answer with the studio app instead of the missing site.
 *
 * `publishedAt` and `lastPublishedVersion` are cleared because they are what the UI reads to decide
 * whether anything is published. Leaving them set would show a published badge over a site that no
 * longer answers, which is the state this change exists to remove.
 */
export async function unpublishDeployment(
  adapter: SQLiteAdapter,
  deploymentId: string,
): Promise<UnpublishOutcome> {
  const deployment = await adapter.getDeployment?.(deploymentId);
  if (!deployment) return { ok: false, status: 404, error: 'Deployment not found' };

  const cleaned = await cleanStaticDeployment(deploymentId);
  if (!cleaned) return { ok: false, status: 500, error: 'Failed to remove the published files' };

  if (adapter.updateDeployment) {
    deployment.publishedAt = undefined;
    deployment.lastPublishedVersion = undefined;
    deployment.updatedAt = new Date();
    await adapter.updateDeployment(deployment);
  }

  return { ok: true, deploymentId };
}
