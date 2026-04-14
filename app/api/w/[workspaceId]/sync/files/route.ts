/**
 * Workspace-Scoped Files Sync API Route
 *
 * GET: Pull files for a project from server
 * POST: Push files for a project to server
 */

import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceContext } from '@/lib/api/workspace-context';
import { getWorkspaceById } from '@/lib/auth/system-database';
import { VirtualFile } from '@/lib/vfs/types';
import { serializeFilesForResponse } from '@/lib/vfs/sync-utils';
import { logger } from '@/lib/utils';
import fs from 'fs';
import path from 'path';

function getDirSize(dir: string): number {
  let total = 0;
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      total += entry.isDirectory() ? getDirSize(p) : fs.statSync(p).size;
    }
  } catch {}
  return total;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { adapter } = await getWorkspaceContext(params, 'viewer');

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');

    if (!projectId) {
      return NextResponse.json(
        { error: 'projectId parameter required' },
        { status: 400 }
      );
    }

    const files = await adapter.listFiles(projectId);

    return NextResponse.json({ files: serializeFilesForResponse(files) });
  } catch (error) {
    logger.error('[API /api/w/[workspaceId]/sync/files GET] Error:', error);

    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && (error.message === 'Workspace access denied' || error.message === 'Insufficient workspace permissions')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch files' },
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
    const { projectId, files } = body as { projectId: string; files: (VirtualFile & { _isBinaryBase64?: boolean })[] };

    if (!projectId || !Array.isArray(files)) {
      return NextResponse.json(
        { error: 'Invalid request: projectId and files array required' },
        { status: 400 }
      );
    }

    // Check storage quota before writing
    const workspace = getWorkspaceById(workspaceId);
    if (workspace) {
      const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
      const wsDir = path.join(dataDir, 'workspaces', workspaceId);
      const usedMb = getDirSize(wsDir) / (1024 * 1024);
      if (usedMb >= workspace.max_storage_mb) {
        return NextResponse.json(
          { error: `Storage limit reached (${workspace.max_storage_mb} MB). Free up space or contact your admin.` },
          { status: 403 }
        );
      }
    }

    // Delete existing files for the project
    await adapter.deleteProjectFiles(projectId);

    // Create all files
    for (const file of files) {
      const { _isBinaryBase64, ...fileData } = file as VirtualFile & { _isBinaryBase64?: boolean };
      await adapter.createFile(fileData);
    }

    return NextResponse.json({ success: true, count: files.length });
  } catch (error) {
    logger.error('[API /api/w/[workspaceId]/sync/files POST] Error:', error);

    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && (error.message === 'Workspace access denied' || error.message === 'Insufficient workspace permissions')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to sync files' },
      { status: 500 }
    );
  }
}
