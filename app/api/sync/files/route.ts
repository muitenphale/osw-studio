/**
 * Files Sync API Route
 *
 * Handles syncing files between browser (IndexedDB) and server (PostgreSQL)
 * GET: Pull files for a project from server → browser
 * POST: Push files for a project from browser → server
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerAdapter } from '@/lib/vfs/adapters/server';
import { VirtualFile } from '@/lib/vfs/types';
import { requireAuth } from '@/lib/auth/session';
import { logger } from '@/lib/utils';

// GET /api/sync/files?projectId=xxx - Get all files for a project
export async function GET(request: NextRequest) {
  try {
    // Require authentication
    await requireAuth();

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');

    if (!projectId) {
      return NextResponse.json(
        { error: 'projectId parameter required' },
        { status: 400 }
      );
    }

    const adapter = await createServerAdapter();
    await adapter.init();

    const files = await adapter.listFiles(projectId);

    await adapter.close?.();

    return NextResponse.json({ files });
  } catch (error) {
    logger.error('[API /api/sync/files GET] Error:', error);

    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch files' },
      { status: 500 }
    );
  }
}

// POST /api/sync/files - Sync files for a project to server
export async function POST(request: NextRequest) {
  try {
    // Require authentication
    await requireAuth();

    const body = await request.json();
    const { projectId, files } = body as { projectId: string; files: VirtualFile[] };

    if (!projectId || !Array.isArray(files)) {
      return NextResponse.json(
        { error: 'Invalid request: projectId and files array required' },
        { status: 400 }
      );
    }

    const adapter = await createServerAdapter();
    await adapter.init();

    // Delete existing files for the project
    await adapter.deleteProjectFiles(projectId);

    // Create all files
    for (const file of files) {
      await adapter.createFile(file);
    }

    await adapter.close?.();

    return NextResponse.json({ success: true, count: files.length });
  } catch (error) {
    logger.error('[API /api/sync/files POST] Error:', error);

    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to sync files' },
      { status: 500 }
    );
  }
}
