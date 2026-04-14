/**
 * Workspace-Scoped Project Sync API Route
 *
 * GET: Pull projects from server
 * POST: Push project from browser to server (with quota enforcement)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceContext } from '@/lib/api/workspace-context';
import { Project } from '@/lib/vfs/types';
import { getWorkspaceById } from '@/lib/auth/system-database';
import { logger } from '@/lib/utils';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { adapter } = await getWorkspaceContext(params);

    const projects = await adapter.listProjects();

    return NextResponse.json({ projects });
  } catch (error) {
    logger.error('[API /api/w/[workspaceId]/sync/projects GET] Error:', error);

    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { adapter, workspaceId } = await getWorkspaceContext(params);

    const body = await request.json();
    const { project } = body as { project: Project };

    if (!project || !project.id) {
      return NextResponse.json(
        { error: 'Invalid project data' },
        { status: 400 }
      );
    }

    // Check if project exists
    const existing = await adapter.getProject(project.id);

    // Quota enforcement for new projects
    if (!existing) {
      const workspace = getWorkspaceById(workspaceId);
      if (workspace) {
        const projects = await adapter.listProjects();
        if (projects.length >= workspace.max_projects) {
          return NextResponse.json(
            { error: `Project limit reached (${workspace.max_projects}).` },
            { status: 403 }
          );
        }
      }
    }

    if (existing) {
      await adapter.updateProject(project);
    } else {
      await adapter.createProject(project);
    }

    return NextResponse.json({ success: true, project });
  } catch (error) {
    logger.error('[API /api/w/[workspaceId]/sync/projects POST] Error:', error);

    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && (error.message === 'Workspace access denied' || error.message === 'Insufficient workspace permissions')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to sync project' },
      { status: 500 }
    );
  }
}
