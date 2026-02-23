/**
 * API Route for Project Swap
 *
 * GET  /api/deployments/[id]/swap-project?projectId=xxx - Analyze swap diff
 * POST /api/deployments/[id]/swap-project - Execute swap + republish
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSQLiteAdapter } from '@/lib/vfs/adapters/server';
import { analyzeProjectSwap } from '@/lib/compiler/project-swap-analyzer';
import { buildStaticDeployment } from '@/lib/compiler/static-builder';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const newProjectId = request.nextUrl.searchParams.get('projectId');

    if (!newProjectId) {
      return NextResponse.json(
        { error: 'projectId query parameter is required' },
        { status: 400 }
      );
    }

    const adapter = getSQLiteAdapter();
    await adapter.init();

    const deployment = await adapter.getDeployment?.(id);
    if (!deployment) {
      return NextResponse.json({ error: 'Deployment not found' }, { status: 404 });
    }

    const project = await adapter.getProject(newProjectId);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const diff = await analyzeProjectSwap(newProjectId, id);

    return NextResponse.json({
      diff,
      currentProjectId: deployment.projectId,
      newProjectId,
      newProjectName: project.name,
    });
  } catch (error) {
    console.error('[Swap Project API] Error analyzing swap:', error);
    return NextResponse.json(
      { error: 'Failed to analyze project swap' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { projectId: newProjectId } = body;

    if (!newProjectId) {
      return NextResponse.json(
        { error: 'projectId is required' },
        { status: 400 }
      );
    }

    const adapter = getSQLiteAdapter();
    await adapter.init();

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

    // Rebuild: compile static files + extract backend features from new project
    const buildResult = await buildStaticDeployment(id);

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
    console.error('[Swap Project API] Error executing swap:', error);
    return NextResponse.json(
      { error: 'Failed to swap project' },
      { status: 500 }
    );
  }
}
