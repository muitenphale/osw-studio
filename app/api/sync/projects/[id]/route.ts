/**
 * Per-Project Sync API
 *
 * Handles syncing individual projects between browser (IndexedDB) and server (SQLite).
 * POST - Push single project + files to server
 * GET - Pull single project + files from server
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerAdapter } from '@/lib/vfs/adapters/server';
import { Project, VirtualFile } from '@/lib/vfs/types';
import { serializeFilesForResponse } from '@/lib/vfs/sync-utils';
import { logger } from '@/lib/utils';

interface PushRequestBody {
  project: Project;
  files: (VirtualFile & { _isBinaryBase64?: boolean })[];
}

/**
 * POST /api/sync/projects/[id]
 * Push a single project and its files to the server
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body: PushRequestBody = await request.json();
    const { project, files } = body;

    if (!project || project.id !== id) {
      return NextResponse.json(
        { error: 'Invalid project data' },
        { status: 400 }
      );
    }

    let adapter;
    try {
      adapter = await createServerAdapter();
    } catch (error) {
      logger.error('[API /api/sync/projects/[id] POST] Server adapter initialization failed:', error);
      return NextResponse.json(
        { error: 'Server mode not configured. Set NEXT_PUBLIC_SERVER_MODE=true to enable.' },
        { status: 500 }
      );
    }

    await adapter.init();

    // Update sync tracking fields
    const now = new Date();
    const syncedProject: Project = {
      ...project,
      lastSyncedAt: now,
      serverUpdatedAt: project.updatedAt,
      syncStatus: 'synced'
    };

    // Check if project exists
    const existingProject = await adapter.getProject(id);

    if (existingProject) {
      // Update existing project
      await adapter.updateProject(syncedProject);
    } else {
      // Create new project
      await adapter.createProject(syncedProject);
    }

    // Sync files - delete all existing files and recreate
    const existingFiles = await adapter.listFiles(id);
    for (const file of existingFiles) {
      await adapter.deleteFile(id, file.path);
    }

    for (const file of files) {
      // Remove the _isBinaryBase64 flag before storing (it's just for transport)
      const { _isBinaryBase64, ...fileData } = file;
      await adapter.createFile(fileData);
    }

    logger.debug(`[API /api/sync/projects/${id}] Project synced successfully`);

    return NextResponse.json({
      success: true,
      project: syncedProject,
      fileCount: files.length
    });
  } catch (error) {
    logger.error('[API /api/sync/projects/[id] POST] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to push project' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/sync/projects/[id]
 * Pull a single project and its files from the server
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    let adapter;
    try {
      adapter = await createServerAdapter();
    } catch (error) {
      logger.error('[API /api/sync/projects/[id] GET] Server adapter initialization failed:', error);
      return NextResponse.json(
        { error: 'Server mode not configured. Set NEXT_PUBLIC_SERVER_MODE=true to enable.' },
        { status: 500 }
      );
    }

    await adapter.init();

    // Get project
    const project = await adapter.getProject(id);
    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    // Get all files
    const files = await adapter.listFiles(id);

    logger.debug(`[API /api/sync/projects/${id}] Project pulled successfully`);

    // Serialize ArrayBuffer content to base64 for JSON response
    return NextResponse.json({
      success: true,
      project,
      files: serializeFilesForResponse(files)
    });
  } catch (error) {
    logger.error('[API /api/sync/projects/[id] GET] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to pull project' },
      { status: 500 }
    );
  }
}
