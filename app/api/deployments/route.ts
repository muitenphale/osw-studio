/**
 * API Routes for Deployments (published versions of projects)
 * GET /api/deployments - List all deployments
 * POST /api/deployments - Create a new deployment
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerAdapter } from '@/lib/vfs/adapters/server';
import { Deployment } from '@/lib/vfs/types';
import { v4 as uuidv4 } from 'uuid';

export async function GET() {
  try {
    const adapter = await createServerAdapter();
    await adapter.init();

    const deployments = await adapter.listDeployments?.() || [];

    await adapter.close?.();

    return NextResponse.json(deployments);
  } catch (error) {
    console.error('[Deployments API] Error listing deployments:', error);
    return NextResponse.json(
      { error: 'Failed to list deployments' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, name, slug } = body;

    if (!projectId || !name) {
      return NextResponse.json(
        { error: 'projectId and name are required' },
        { status: 400 }
      );
    }

    const adapter = await createServerAdapter();
    await adapter.init();

    // Check if project exists
    const project = await adapter.getProject(projectId);
    if (!project) {
      await adapter.close?.();
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    // Create new deployment
    const deployment: Deployment = {
      id: uuidv4(),
      projectId,
      name,
      slug: slug || undefined,
      enabled: false,
      underConstruction: false,
      headScripts: [],
      bodyScripts: [],
      cdnLinks: [],
      analytics: {
        enabled: false,
        provider: 'builtin',
        privacyMode: true,
      },
      seo: {},
      compliance: {
        enabled: false,
        bannerPosition: 'bottom' as const,
        bannerStyle: 'bar' as const,
        message: '',
        acceptButtonText: 'Accept',
        declineButtonText: 'Decline',
        mode: 'opt-in' as const,
        blockAnalytics: true,
      },
      settingsVersion: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (adapter.createDeployment) {
      await adapter.createDeployment(deployment);
    }
    await adapter.close?.();

    return NextResponse.json(deployment, { status: 201 });
  } catch (error) {
    console.error('[Deployments API] Error creating deployment:', error);
    return NextResponse.json(
      { error: 'Failed to create deployment' },
      { status: 500 }
    );
  }
}
