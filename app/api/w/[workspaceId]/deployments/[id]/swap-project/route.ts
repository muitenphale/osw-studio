/**
 * Workspace-Scoped Project Swap API
 *
 * GET  - Analyze swap diff
 * POST - Execute swap + republish
 */

import { logger } from '@/lib/utils';
import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceContext } from '@/lib/api/workspace-context';
import { analyzeProjectSwap } from '@/lib/compiler/project-swap-analyzer';
import { buildStaticDeployment } from '@/lib/compiler/static-builder';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; id: string }> }
) {
  try {
    const { adapter, workspaceId } = await getWorkspaceContext(params, 'viewer');
    const { id } = await params;
    const newProjectId = request.nextUrl.searchParams.get('projectId');

    if (!newProjectId) {
      return NextResponse.json(
        { error: 'projectId query parameter is required' },
        { status: 400 }
      );
    }

    const deployment = await adapter.getDeployment?.(id);
    if (!deployment) {
      return NextResponse.json({ error: 'Deployment not found' }, { status: 404 });
    }

    const project = await adapter.getProject(newProjectId);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const diff = await analyzeProjectSwap(newProjectId, id, workspaceId);

    return NextResponse.json({
      diff,
      currentProjectId: deployment.projectId,
      newProjectId,
      newProjectName: project.name,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && (error.message === 'Workspace access denied' || error.message === 'Insufficient workspace permissions')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    logger.error('[Swap Project API] Error analyzing swap:', error);
    return NextResponse.json(
      { error: 'Failed to analyze project swap' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; id: string }> }
) {
  try {
    const { adapter, workspaceId } = await getWorkspaceContext(params);
    const { id } = await params;
    const body = await request.json();
    const { projectId: newProjectId } = body;

    if (!newProjectId) {
      return NextResponse.json(
        { error: 'projectId is required' },
        { status: 400 }
      );
    }

    const deployment = await adapter.getDeployment?.(id);
    if (!deployment) {
      return NextResponse.json({ error: 'Deployment not found' }, { status: 404 });
    }

    const project = await adapter.getProject(newProjectId);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const previousProjectId = deployment.projectId;

    // Update deployment's projectId
    if (adapter.updateDeployment) {
      deployment.projectId = newProjectId;
      deployment.updatedAt = new Date();
      await adapter.updateDeployment(deployment);
    }

    // Rebuild
    const buildResult = await buildStaticDeployment(id, workspaceId);

    if (!buildResult.success) {
      // Rollback projectId on build failure
      if (adapter.updateDeployment) {
        deployment.projectId = previousProjectId;
        deployment.updatedAt = new Date();
        await adapter.updateDeployment(deployment);
      }
      return NextResponse.json(
        { error: buildResult.error || 'Failed to rebuild deployment with new project' },
        { status: 500 }
      );
    }

    // Update publish metadata
    if (adapter.updateDeployment) {
      deployment.lastPublishedVersion = deployment.settingsVersion;
      deployment.publishedAt = new Date();
      deployment.updatedAt = new Date();
      await adapter.updateDeployment(deployment);
    }

    return NextResponse.json({
      success: true,
      previousProjectId,
      newProjectId,
      filesWritten: buildResult.filesWritten,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && (error.message === 'Workspace access denied' || error.message === 'Insufficient workspace permissions')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    logger.error('[Swap Project API] Error executing swap:', error);
    return NextResponse.json(
      { error: 'Failed to swap project' },
      { status: 500 }
    );
  }
}
