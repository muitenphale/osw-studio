/**
 * API Route for Publishing Deployments
 * POST /api/deployments/[id]/publish - Build and publish a deployment
 */

import { NextRequest, NextResponse } from 'next/server';
import { buildStaticDeployment } from '@/lib/compiler/static-builder';
import { getSQLiteAdapter } from '@/lib/vfs/adapters/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Build the deployment
    const result = await buildStaticDeployment(id);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to build deployment' },
        { status: 500 }
      );
    }

    // Update deployment metadata after successful build
    const adapter = getSQLiteAdapter();
    await adapter.init();

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

    return NextResponse.json({
      success: true,
      deploymentId: result.deploymentId,
      projectId: result.projectId,
      filesWritten: result.filesWritten,
      outputPath: result.outputPath,
      lastPublishedVersion: deployment?.settingsVersion ?? null,
    });
  } catch (error) {
    console.error('[Deployments API] Error publishing deployment:', error);
    return NextResponse.json(
      { error: 'Failed to publish deployment' },
      { status: 500 }
    );
  }
}
