/**
 * Workspace-Scoped Projects API
 *
 * GET - Returns all projects from SQLite
 */

import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceContext } from '@/lib/api/workspace-context';
import { logger } from '@/lib/utils';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { adapter } = await getWorkspaceContext(params, 'viewer');

    // Check if fields parameter is present (for lightweight queries)
    const { searchParams } = new URL(request.url);
    const fieldsParam = searchParams.get('fields');

    const fields = fieldsParam ? fieldsParam.split(',').map(f => f.trim()) : undefined;
    const projects = await adapter.listProjects(fields);

    return NextResponse.json(projects);
  } catch (error) {
    logger.error('[API /api/w/[workspaceId]/projects] Error:', error);

    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    if (error instanceof Error && (error.message === 'Workspace access denied' || error.message === 'Insufficient workspace permissions')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch projects' },
      { status: 500 }
    );
  }
}
