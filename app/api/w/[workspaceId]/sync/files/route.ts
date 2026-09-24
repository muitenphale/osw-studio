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
import { serializeFilesForResponse, deserializeFilesFromRequest } from '@/lib/vfs/sync-utils';
import { logger } from '@/lib/utils';
import { combinedDirectorySize } from '@/lib/api/directory-size';
import { isSafeVirtualPath } from '@/lib/vfs/path-safety';
import path from 'path';

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
    /**
     * `replace` clears the project's files before writing, which is what a push of the whole file
     * set means. A push too large for one request body arrives as a sequence of them, and only
     * the first carries it: clearing on every batch would delete what the batch before it wrote.
     * Defaults to false: omitting the flag must not wipe the project. Callers that mean a
     * whole-set replace (publish's first batch) pass `replace: true` explicitly.
     */
    const { projectId, files, replace = false, baseRevision } = body as {
      projectId: string;
      files: (VirtualFile & { _isBinaryBase64?: boolean })[];
      replace?: boolean;
      baseRevision?: number;
    };

    if (!projectId || !Array.isArray(files)) {
      return NextResponse.json(
        { error: 'Invalid request: projectId and files array required' },
        { status: 400 }
      );
    }

    // Rejected here rather than sanitized: a path with a `..` segment is not a file anyone meant to
    // push, and publishing turns it into a filesystem path. The whole batch is refused so a caller
    // cannot half-write a project and be told it succeeded.
    const unsafe = files.find((file) => !isSafeVirtualPath(file?.path));
    if (unsafe) {
      logger.warn(`[API sync/files] Rejected push with unsafe path: ${String(unsafe?.path).slice(0, 120)}`);
      return NextResponse.json(
        { error: 'Invalid request: file paths must be absolute and contain no "." or ".." segments' },
        { status: 400 }
      );
    }

    // Check storage quota before writing. Once per push rather than once per batch:
    // `combinedDirectorySize` walks the whole workspace synchronously, and a chunked push
    // would repeat that walk per batch. The first batch is the one that carries `replace`.
    if (replace) {
      const workspace = getWorkspaceById(workspaceId);
      if (workspace) {
        const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
        const wsDir = path.join(dataDir, 'workspaces', workspaceId);
        const usedMb = combinedDirectorySize([wsDir]) / (1024 * 1024);
        if (usedMb >= workspace.max_storage_mb) {
          return NextResponse.json(
            { error: `Storage limit reached (${workspace.max_storage_mb} MB). Free up space or contact your admin.` },
            { status: 403 }
          );
        }
      }
    }

    if (replace && files.length === 0) {
      return NextResponse.json(
        { error: 'Invalid request: a replace push must include the files that replace the project' },
        { status: 400 }
      );
    }

    const incoming = deserializeFilesFromRequest(files);
    const base = typeof baseRevision === 'number' ? baseRevision : 0;
    let revision: number | undefined;
    try {
      revision = adapter.runTransaction(() => {
        const existing = adapter.getProjectSync(projectId);
        const currentRev = existing?.revision ?? 0;
        if (existing && base !== currentRev) {
          const err = new Error('stale-revision') as Error & { revision: number; serverUpdatedAt: Date };
          err.revision = currentRev;
          err.serverUpdatedAt = existing.updatedAt;
          throw err;
        }

        if (replace) {
          void adapter.deleteProjectFiles(projectId);
        }
        for (const fileData of incoming) {
          if (replace) {
            void adapter.createFile(fileData);
            continue;
          }
          if (adapter.getFileSync(projectId, fileData.path)) void adapter.updateFile(fileData);
          else void adapter.createFile(fileData);
        }

        if (!existing) return currentRev;
        const next = adapter.bumpRevision(projectId, currentRev);
        if (next == null) {
          const err = new Error('stale-revision') as Error & { revision: number; serverUpdatedAt: Date };
          err.revision = currentRev;
          err.serverUpdatedAt = existing.updatedAt;
          throw err;
        }
        return next;
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'stale-revision') {
        const stale = error as Error & { revision: number; serverUpdatedAt: Date };
        return NextResponse.json(
          { error: 'conflict', reason: 'stale', revision: stale.revision, serverUpdatedAt: stale.serverUpdatedAt },
          { status: 409 }
        );
      }
      throw error;
    }

    return NextResponse.json({ success: true, count: files.length, revision });
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
