/**
 * Workspace-Scoped Publish Deployment API
 *
 * POST   - Build and publish a deployment (with quota enforcement)
 * DELETE - Unpublish it: remove the served files, keep the deployment and its data
 *
 * The steps live in `lib/publishing/publish-deployment.ts` so this route and the MCP
 * `deployments_publish` / `deployments_unpublish` tools work the same way; this file is the HTTP
 * shell around them.
 */

import { logger } from '@/lib/utils';
import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceContext } from '@/lib/api/workspace-context';
import { publishDeployment, unpublishDeployment } from '@/lib/publishing/publish-deployment';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; id: string }> }
) {
  try {
    const { adapter, workspaceId } = await getWorkspaceContext(params);
    const { id } = await params;

    const outcome = await publishDeployment(adapter, workspaceId, id);
    if (!outcome.ok) {
      return NextResponse.json({ error: outcome.error }, { status: outcome.status });
    }

    return NextResponse.json({
      success: true,
      deploymentId: outcome.deploymentId,
      projectId: outcome.projectId,
      filesWritten: outcome.filesWritten,
      outputPath: outcome.outputPath,
      lastPublishedVersion: outcome.lastPublishedVersion,
      slug: outcome.slug,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && (error.message === 'Workspace access denied' || error.message === 'Insufficient workspace permissions')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    // A refusal, not a fault: the guard inside publishDeployment catches this before any work is
    // done, so reaching it here means the row was written between that check and the registration.
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

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; id: string }> }
) {
  try {
    const { adapter } = await getWorkspaceContext(params);
    const { id } = await params;

    const outcome = await unpublishDeployment(adapter, id);
    if (!outcome.ok) {
      return NextResponse.json({ error: outcome.error }, { status: outcome.status });
    }

    return NextResponse.json({ success: true, deploymentId: outcome.deploymentId });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && (error.message === 'Workspace access denied' || error.message === 'Insufficient workspace permissions')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    logger.error('[Deployments API] Error unpublishing deployment:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to unpublish deployment' },
      { status: 500 }
    );
  }
}
