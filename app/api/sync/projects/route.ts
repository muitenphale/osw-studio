/**
 * Project Sync API Route
 *
 * Handles syncing projects between browser (IndexedDB) and server (SQLite)
 * GET: Pull projects from server → browser
 * POST: Push project from browser → server
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerAdapter } from '@/lib/vfs/adapters/server';
import { Project } from '@/lib/vfs/types';
import { requireAuth } from '@/lib/auth/session';
import { logger } from '@/lib/utils';

// GET /api/sync/projects - List all projects from server
export async function GET() {
  try {
    // Require authentication
    await requireAuth();

    const adapter = await createServerAdapter();
    await adapter.init();

    const projects = await adapter.listProjects();

    await adapter.close?.();

    return NextResponse.json({ projects });
  } catch (error) {
    logger.error('[API /api/sync/projects GET] Error:', error);

    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch projects' },
      { status: 500 }
    );
  }
}

// POST /api/sync/projects - Create or update project on server
export async function POST(request: NextRequest) {
  try {
    // Require authentication
    await requireAuth();

    const body = await request.json();
    const { project } = body as { project: Project };

    if (!project || !project.id) {
      return NextResponse.json(
        { error: 'Invalid project data' },
        { status: 400 }
      );
    }

    const adapter = await createServerAdapter();
    await adapter.init();

    // Check if project exists
    const existing = await adapter.getProject(project.id);

    if (existing) {
      // Update existing project
      await adapter.updateProject(project);
    } else {
      // Create new project
      await adapter.createProject(project);
    }

    await adapter.close?.();

    return NextResponse.json({ success: true, project });
  } catch (error) {
    logger.error('[API /api/sync/projects POST] Error:', error);

    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to sync project' },
      { status: 500 }
    );
  }
}
