import { vfs } from '@/lib/vfs';
import { getSyncManager, type PushProgress } from '@/lib/vfs/sync-manager';
import { createSyncProgressToast, silentProgressToast } from '@/lib/vfs/sync-progress-toast';
import { logger } from '@/lib/utils';

/**
 * Push a project to the server so it becomes deployable.
 *
 * In Server Mode a project only reaches the server (and the server-backed
 * deployment picker) when it is pushed. Newly imported or duplicated projects
 * live in IndexedDB only until then. Uses the same binary-safe push as the
 * Server Sync dialog. No-op in browser mode.
 */
export async function pushProjectToServer(
  projectId: string,
  workspaceId?: string,
  options?: { delta?: boolean; silent?: boolean }
): Promise<void> {
  if (process.env.NEXT_PUBLIC_SERVER_MODE !== 'true') return;

  let project;
  try {
    project = await vfs.getProject(projectId);
  } catch (error) {
    logger.error('[pushProjectToServer] Failed to push project to server:', error);
    return;
  }
  if (!project) return;

  // A first upload is chunked into as many requests as the project needs, so a visible push
  // reports where it is. It stays invisible until the push turns out to need more than one
  // request. A background reconcile stays silent either way.
  const progress = options?.silent
    ? silentProgressToast
    : createSyncProgressToast(`Syncing "${project.name}" to the server`);

  try {
    const files = await vfs.listFiles(projectId);
    const syncManager = getSyncManager(workspaceId);
    const onProgress = ({ batch, batches }: PushProgress) => progress.update(batch, batches);

    // Delta mode for routine reconciles: a full push sends every file, which is the right thing
    // for a first upload and far too much for a metadata change.
    const result = options?.delta
      ? await syncManager.pushProjectDelta(projectId, project, files, { onProgress })
      : await syncManager.pushSingleProject(projectId, project, files, { onProgress });

    if (!result.success) {
      logger.error('[pushProjectToServer] Failed to push project to server:', result.error);
      // A background reconcile stays quiet: it retries on its own, and 'conflict' is a state the
      // user resolves in Server Sync, not an error to interrupt them with.
      progress.error('Saved locally, but syncing to the server failed. Use Server Sync to retry.');
      return;
    }

    if (result.project) {
      // Record sync metadata so a later refresh doesn't flag a false conflict. Only reached when
      // the final batch landed: a push that died part way has to keep reading as un-synced, so the
      // retry is a delta that resends the remainder rather than a no-op.
      project.lastSyncedAt = new Date();
      project.serverUpdatedAt = result.project.updatedAt
        ? new Date(result.project.updatedAt)
        : new Date();
      await vfs.updateProject(project, { preserveUpdatedAt: true });
    }
    // No success toast: every caller that shows this one announces the result itself, and a push
    // that needed no progress toast never raised one to resolve.
    progress.dismiss();
  } catch (error) {
    // Every exit resolves the toast. A loading toast is not dismissible, so leaving one behind
    // pins a spinner to the corner of the app for the rest of the session.
    logger.error('[pushProjectToServer] Failed to push project to server:', error);
    progress.error('Saved locally, but syncing to the server failed. Use Server Sync to retry.');
  }
}
