/**
 * API Routes for Sites by Project
 * GET /api/projects/[id]/sites - List all sites for a project
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerAdapter } from '@/lib/vfs/adapters/server';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { id: projectId } = await params;

    if (!projectId) {
      return NextResponse.json(
        { error: 'Project ID is required' },
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

    // Get sites for this project
    const sites = await adapter.listSitesByProject?.(projectId) || [];

    await adapter.close?.();

    return NextResponse.json({ sites });
  } catch (error) {
    console.error('[Projects Sites API] Error listing sites:', error);
    return NextResponse.json(
      { error: 'Failed to list sites for project' },
      { status: 500 }
    );
  }
}
