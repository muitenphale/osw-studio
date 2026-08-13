/**
 * Workspace-Scoped Per-Project Sync API
 *
 * POST - Push single project + files to server
 * GET - Pull single project + files from server
 * DELETE - Delete project from server
 */

import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceContext } from '@/lib/api/workspace-context';
import { Project, VirtualFile } from '@/lib/vfs/types';
import { serializeFilesForResponse, deserializeFilesFromRequest } from '@/lib/vfs/sync-utils';
import { logger } from '@/lib/utils';

interface PushRequestBody {
  project: Project;
  files: (VirtualFile & { _isBinaryBase64?: boolean })[];
  deletedPaths?: string[];
  partial?: boolean;
  /**
   * Push anyway when the server has moved on since this client last synced.
   *
   * Only ever set by an explicit push from Server Sync, where the user is looking at the conflict
   * and choosing to keep the local copy. Background syncs leave it unset so a conflict is still
   * reported rather than resolved behind the user's back.
   */
  force?: boolean;
  /**
   * Write the project row. Default true; a chunked push sends `false` on every batch but the last.
   *
   * The row is stored with the *client's* `updatedAt` rather than the server's clock, so a batch
   * that writes it moves `existingProject.updatedAt` up to a value the client's own
   * `lastSyncedAt` predates — and the next batch of the same push then fails the concurrency
   * check below against itself. Holding the write until the final batch keeps the check comparing
   * the same server state throughout, so it still catches a real concurrent change instead of
   * being forced past. It also means a push that dies half way leaves the project looking
   * un-synced, which is what makes a delta retry resend the remainder.
   *
   * A project the server does not have yet is created regardless: files carry a foreign key to it.
   */
  writeProject?: boolean;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; id: string }> }
) {
  try {
    const { adapter } = await getWorkspaceContext(params);
    const { id } = await params;
    const body: PushRequestBody = await request.json();
    const { project, files, deletedPaths = [], partial = false, force = false, writeProject = true } = body;

    if (!project || project.id !== id || !Array.isArray(files) || !Array.isArray(deletedPaths)) {
      return NextResponse.json(
        { error: 'Invalid project data' },
        { status: 400 }
      );
    }

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
    let storedProject = existingProject ?? syncedProject;

    if (existingProject) {
      // Optimistic concurrency: reject if server has newer changes than client last saw, unless the
      // user has explicitly chosen to keep the local copy.
      const clientLastSynced = project.lastSyncedAt ? new Date(project.lastSyncedAt).getTime() : 0;
      const serverUpdated = new Date(existingProject.updatedAt).getTime();
      // The server holding exactly this client's `updatedAt` means it holds *this* push, not
      // someone else's change: a later batch of a chunked push whose first batch had to create the
      // row, or a retry of a push that already landed. Treating that as a conflict would make a
      // push conflict with itself, which is invisible on a first upload (`lastSyncedAt` is unset,
      // so the check below is skipped) and only surfaces on the re-push weeks later.
      const serverHoldsThisPush = serverUpdated === new Date(project.updatedAt).getTime();
      if (!force && !serverHoldsThisPush && clientLastSynced > 0 && serverUpdated > clientLastSynced) {
        return NextResponse.json(
          { error: 'conflict', serverUpdatedAt: existingProject.updatedAt },
          { status: 409 }
        );
      }
      if (writeProject) {
        await adapter.updateProject(syncedProject);
        storedProject = syncedProject;
      }
    } else {
      // Created even when the batch asked not to write the row: files carry a foreign key to it.
      //
      // A row a non-final batch had to create is stamped at the epoch rather than with the
      // client's `updatedAt`. Sync status compares those two timestamps and reads an equal pair as
      // 'synced' (`calculateItemSyncStatus`, with no `lastSyncedAt` to go on yet), so a first push
      // that died after its first batch would describe a project whose files never arrived as
      // finished. Epoch reads as 'local-newer' instead: push it again. The final batch overwrites
      // the row with the real timestamp.
      const created = writeProject ? syncedProject : { ...syncedProject, updatedAt: new Date(0) };
      await adapter.createProject(created);
      storedProject = created;
    }

    if (partial) {
      for (const filePath of deletedPaths) {
        await adapter.deleteFile(id, filePath);
      }
      for (const file of deserializeFilesFromRequest(files)) {
        const fileData = { ...file, projectId: id };
        const existing = await adapter.getFile(id, fileData.path);
        if (existing) await adapter.updateFile(fileData);
        else await adapter.createFile(fileData);
      }
    } else {
      // Full sync is retained for the initial import and backward compatibility.
      const existingFiles = await adapter.listFiles(id);
      for (const file of existingFiles) {
        await adapter.deleteFile(id, file.path);
      }

      for (const file of deserializeFilesFromRequest(files)) {
        await adapter.createFile({ ...file, projectId: id });
      }
    }

    logger.debug(`[API /api/w/[workspaceId]/sync/projects/${id}] Project synced successfully`);

    return NextResponse.json({
      success: true,
      // What the server now holds. On a batch that did not write the row this is the existing
      // record, so a client cannot read its own unwritten metadata back as though it had landed.
      project: storedProject,
      fileCount: files.length
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && (error.message === 'Workspace access denied' || error.message === 'Insufficient workspace permissions')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    logger.error('[API /api/w/[workspaceId]/sync/projects/[id] POST] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to push project' },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; id: string }> }
) {
  try {
    const { adapter } = await getWorkspaceContext(params, 'viewer');
    const { id } = await params;

    const project = await adapter.getProject(id);
    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    const files = await adapter.listFiles(id);

    if (request.nextUrl.searchParams.get('manifest') === '1') {
      return NextResponse.json({
        success: true,
        project,
        files: files.map((file) => ({ path: file.path, updatedAt: file.updatedAt, size: file.size })),
      });
    }

    logger.debug(`[API /api/w/[workspaceId]/sync/projects/${id}] Project pulled successfully`);

    return NextResponse.json({
      success: true,
      project,
      files: serializeFilesForResponse(files)
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && (error.message === 'Workspace access denied' || error.message === 'Insufficient workspace permissions')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    logger.error('[API /api/w/[workspaceId]/sync/projects/[id] GET] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to pull project' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; id: string }> }
) {
  try {
    const { adapter } = await getWorkspaceContext(params);
    const { id } = await params;

    const existing = await adapter.getProject(id);
    if (!existing) {
      return NextResponse.json({ success: true });
    }

    await adapter.deleteProject(id);

    logger.debug(`[API /api/w/[workspaceId]/sync/projects/${id}] Project deleted from server`);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && (error.message === 'Workspace access denied' || error.message === 'Insufficient workspace permissions')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    logger.error('[API /api/w/[workspaceId]/sync/projects/[id] DELETE] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete project from server' },
      { status: 500 }
    );
  }
}
