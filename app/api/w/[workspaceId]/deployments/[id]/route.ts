/**
 * Workspace-Scoped Individual Deployment Operations
 *
 * GET - Get deployment by ID
 * PUT - Update deployment
 * DELETE - Delete deployment
 */

import { logger } from '@/lib/utils';
import { withPublicUrl } from '@/lib/api/deployment-url';
import { toPublicDeployment } from '@/lib/api/deployment-public';
import {
  InvalidReviewConfigError,
  mergeReviewConfig,
  readReviewPasswordUpdate,
  reviewChangeNeedsRepublish,
} from '@/lib/api/deployment-review-merge';
import { hashPassword } from '@/lib/auth/passwords';
import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceContext } from '@/lib/api/workspace-context';
import { cleanStaticDeployment } from '@/lib/compiler/static-builder';
import { removeDeploymentRoute } from '@/lib/auth/system-database';
import { regenerateInstanceCaddy } from '@/lib/caddy/regenerate';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; id: string }> }
) {
  try {
    const { adapter } = await getWorkspaceContext(params, 'viewer');
    const { id } = await params;

    const deployment = await adapter.getDeployment?.(id);

    if (!deployment) {
      return NextResponse.json(
        { error: 'Deployment not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(toPublicDeployment(withPublicUrl(deployment)));
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && (error.message === 'Workspace access denied' || error.message === 'Insufficient workspace permissions')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    logger.error('[Deployments API] Error getting deployment:', error);
    return NextResponse.json(
      { error: 'Failed to get deployment' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; id: string }> }
) {
  try {
    const { adapter } = await getWorkspaceContext(params);
    const { id } = await params;
    const body = await request.json();

    const existingDeployment = await adapter.getDeployment?.(id);
    if (!existingDeployment) {
      return NextResponse.json(
        { error: 'Deployment not found' },
        { status: 404 }
      );
    }

    const updatedDeployment = {
      ...existingDeployment,
      ...body,
      id, // Ensure ID doesn't change
      updatedAt: new Date(),
    };

    // The body's review block has been through `toPublicDeployment` and carries no password hash,
    // so the blanket spread above would clear it on any GET-then-PUT round trip. Merge instead:
    // the hash survives unless the body clears it explicitly with `password: null`.
    //
    // The password arrives as plaintext and is hashed here, so the server owns the cost factor and
    // the length rule; `mergeReviewConfig` stays synchronous and never reads a hash from a body.
    if (body && typeof body === 'object' && 'review' in body) {
      const update = readReviewPasswordUpdate(body.review);
      const resolvedHash =
        update.kind === 'set'
          ? await hashPassword(update.password)
          : update.kind === 'clear'
            ? null
            : undefined;

      updatedDeployment.review = mergeReviewConfig(existingDeployment.review, body.review, resolvedHash);

      // Enabling or disabling review mode changes what the next build writes, and nothing else in
      // the block does. Counted from the stored record so a stale or forged counter in the body
      // cannot desync the unpublished-changes comparison.
      if (reviewChangeNeedsRepublish(existingDeployment.review, updatedDeployment.review)) {
        updatedDeployment.settingsVersion = existingDeployment.settingsVersion + 1;
      }
    }

    if (adapter.updateDeployment) {
      await adapter.updateDeployment(updatedDeployment);
    }

    return NextResponse.json(toPublicDeployment(updatedDeployment));
  } catch (error) {
    // A malformed review block is the caller's mistake, not a server fault.
    if (error instanceof InvalidReviewConfigError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && (error.message === 'Workspace access denied' || error.message === 'Insufficient workspace permissions')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    logger.error('[Deployments API] Error updating deployment:', error);
    return NextResponse.json(
      { error: 'Failed to update deployment' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; id: string }> }
) {
  try {
    const { adapter } = await getWorkspaceContext(params);
    const { id } = await params;

    const deployment = await adapter.getDeployment?.(id);
    if (!deployment) {
      return NextResponse.json(
        { error: 'Deployment not found' },
        { status: 404 }
      );
    }

    if (adapter.deleteDeployment) {
      await adapter.deleteDeployment(id);
    }

    // Clean up static files and deployment routing (frees quota)
    await cleanStaticDeployment(id);
    removeDeploymentRoute(id);

    if (deployment.customDomain) {
      regenerateInstanceCaddy().catch(() => {});
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && (error.message === 'Workspace access denied' || error.message === 'Insufficient workspace permissions')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    logger.error('[Deployments API] Error deleting deployment:', error);
    return NextResponse.json(
      { error: 'Failed to delete deployment' },
      { status: 500 }
    );
  }
}
