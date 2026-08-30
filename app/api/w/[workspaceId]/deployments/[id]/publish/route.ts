/**
 * Workspace-Scoped Publish Deployment API
 *
 * POST - Build and publish a deployment (with quota enforcement)
 */

import { logger } from '@/lib/utils';
import { NextRequest, NextResponse } from 'next/server';
import { buildStaticDeployment } from '@/lib/compiler/static-builder';
import { getWorkspaceContext } from '@/lib/api/workspace-context';
import { getWorkspaceById, getDeploymentWorkspace, getDeploymentBySlug, registerDeploymentRoute, getDeploymentRoute } from '@/lib/auth/system-database';
import { checkDeploymentQuota } from '@/lib/publishing/quota';
import { regenerateInstanceCaddy } from '@/lib/caddy/regenerate';
import { generateUniqueSlug } from '@/lib/publishing/slug-generator';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; id: string }> }
) {
  try {
    const { adapter, workspaceId } = await getWorkspaceContext(params);
    const { id } = await params;

    const workspace = getWorkspaceById(workspaceId);
    if (workspace) {
      const actualDeployments = await adapter.listDeployments?.() || [];
      const quota = checkDeploymentQuota({
        isAlreadyRegistered: !!getDeploymentWorkspace(id),
        maxDeployments: workspace.max_deployments,
        actualDeploymentCount: actualDeployments.length,
      });
      if (!quota.allowed) {
        return NextResponse.json({ error: quota.error }, { status: 403 });
      }
    }

    // Resolve the deployment's slug BEFORE building. The static builder uses the
    // slug to decide asset path style: a deployment with a slug is served at its
    // subdomain root and needs root-relative asset paths, while one without is
    // served under /deployments/{id}/ and needs that prefix. Generating the slug
    // after the build (as it was) meant the first publish always emitted prefixed
    // paths that then 404'd once the subdomain (serving at root) was created.
    const previousRoute = getDeploymentRoute(id);

    // Before the build, not after. registerDeploymentRoute below refuses a deployment another
    // workspace owns, and by the time it runs the site has been compiled and written and the
    // deployment record already carries a new publishedAt — so the caller was told the publish
    // failed while the deployment was left marked as published.
    if (previousRoute && previousRoute.workspace_id !== workspaceId) {
      return NextResponse.json(
        {
          error:
            'This deployment is registered to another workspace, so it cannot be published from this one. That usually means the same deployment exists in two workspace databases, which happens when more than one workspace was created on an instance carrying a legacy data/osws.sqlite.',
        },
        { status: 409 }
      );
    }

    const oldSlug = previousRoute?.slug || null;
    const preBuildDeployment = await adapter.getDeployment?.(id);
    const slug = oldSlug || preBuildDeployment?.slug || generateUniqueSlug(s => !!getDeploymentBySlug(s));
    if (preBuildDeployment && adapter.updateDeployment && preBuildDeployment.slug !== slug) {
      preBuildDeployment.slug = slug;
      await adapter.updateDeployment(preBuildDeployment);
    }

    // Build the deployment using workspace adapter
    const result = await buildStaticDeployment(id, workspaceId);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to build deployment' },
        { status: 500 }
      );
    }

    // Update deployment metadata after successful build
    const deployment = await adapter.getDeployment?.(id);
    if (deployment && adapter.updateDeployment) {
      deployment.lastPublishedVersion = deployment.settingsVersion;
      deployment.publishedAt = new Date();
      deployment.updatedAt = new Date();

      // Enable deployment database for analytics when publishing
      if (!deployment.databaseEnabled) {
        deployment.databaseEnabled = true;
        await adapter.enableDeploymentDatabase(id);
      }

      await adapter.updateDeployment(deployment);
    }

    // Register deployment route for subdomain routing (slug resolved pre-build)
    registerDeploymentRoute(id, workspaceId, slug, deployment?.customDomain);

    // Regenerate Caddy config on every publish (no-op without STATIC_PROXY)
    regenerateInstanceCaddy().catch(() => {});

    return NextResponse.json({
      success: true,
      deploymentId: result.deploymentId,
      projectId: result.projectId,
      filesWritten: result.filesWritten,
      outputPath: result.outputPath,
      lastPublishedVersion: deployment?.settingsVersion ?? null,
      slug,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && (error.message === 'Workspace access denied' || error.message === 'Insufficient workspace permissions')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    // A refusal, not a fault: the guard above catches this before any work is done, so reaching it
    // here means the row was written between that check and the registration.
    if (error instanceof Error && error.message === 'Deployment is owned by another workspace') {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    logger.error('[Deployments API] Error publishing deployment:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to publish deployment' },
      { status: 500 }
    );
  }
}
