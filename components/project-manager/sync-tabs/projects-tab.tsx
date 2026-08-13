'use client';

import { Dispatch, SetStateAction, useEffect, useRef } from 'react';
import { SyncableItem } from '@/lib/vfs/sync-types';
import { SummaryBar } from './summary-bar';
import { SyncItemRow } from '../sync-item-row';
import { vfs, Project } from '@/lib/vfs';
import { getSyncManager } from '@/lib/vfs/sync-manager';
import { createSyncProgressToast } from '@/lib/vfs/sync-progress-toast';
import { logger } from '@/lib/utils';
import { track } from '@/lib/telemetry';

interface ProjectsTabProps {
  items: SyncableItem[];
  selectedIds: Set<string>;
  syncingIds: Set<string>;
  onSelectedIdsChange: (ids: Set<string>) => void;
  onSyncingIdsChange: Dispatch<SetStateAction<Set<string>>>;
  onRefresh: () => void;
  onSyncComplete: () => void;
  onRegisterPushSelected: (handler: (() => Promise<void>) | null) => void;
  onRegisterPullSelected: (handler: (() => Promise<void>) | null) => void;
}

export function ProjectsTab({
  items,
  selectedIds,
  syncingIds,
  onSelectedIdsChange,
  onSyncingIdsChange,
  onRefresh,
  onSyncComplete,
  onRegisterPushSelected,
  onRegisterPullSelected,
}: ProjectsTabProps) {
  const syncManager = getSyncManager();

  // Use refs to hold the latest values for use in mount-only handlers
  const selectedIdsRef = useRef(selectedIds);
  const itemsRef = useRef(items);

  // Keep refs up to date
  useEffect(() => {
    selectedIdsRef.current = selectedIds;
    itemsRef.current = items;
  }, [selectedIds, items]);

  const handleSelectChange = (id: string, selected: boolean) => {
    const newSelected = new Set(selectedIds);
    if (selected) {
      newSelected.add(id);
    } else {
      newSelected.delete(id);
    }
    onSelectedIdsChange(newSelected);
  };

  const handlePushSingle = async (item: SyncableItem, opts?: { silent?: boolean }) => {
    onSyncingIdsChange((prev: Set<string>) => new Set(prev).add(item.id));
    // A push is one request per batch, so a large project is a sequence of them. The toast
    // resolves to this push's own outcome, replacing the ones the code below used to raise.
    const progress = createSyncProgressToast(`Pushing "${item.name}"`);
    try {
      const project = await vfs.getProject(item.id);
      if (!project) {
        progress.error(`Project "${item.name}" not found`);
        return;
      }

      const files = await vfs.listFiles(item.id);
      // An explicit push from this dialog means "make the server match my copy", including when
      // both sides have changed — the row says Conflict and the tooltip offers exactly this. Only
      // background syncs leave the server's newer copy alone and report the conflict instead.
      const result = await syncManager.pushSingleProject(item.id, project, files, {
        force: true,
        onProgress: ({ batch, batches }) => progress.update(batch, batches),
      });

      if (result.success) {
        // Update local sync metadata to prevent conflict on refresh
        if (result.project) {
          const serverUpdatedAt = result.project.updatedAt
            ? new Date(result.project.updatedAt)
            : new Date();
          project.lastSyncedAt = new Date();
          project.serverUpdatedAt = serverUpdatedAt;
          await vfs.updateProject(project, { preserveUpdatedAt: true });
        }
        progress.success(`Pushed "${item.name}" to server`);
        if (!opts?.silent) {
          track('sync_manual', { item_type: 'project', direction: 'push', bulk: false, count: 1 });
        }
        onRefresh();
        onSyncComplete();
      } else {
        progress.error(result.error || 'Failed to push project');
        track('sync_fail', { item_type: 'project', direction: 'push' });
      }
    } catch (error) {
      logger.error('Push error:', error);
      progress.error('Failed to push project');
      track('sync_fail', { item_type: 'project', direction: 'push' });
    } finally {
      onSyncingIdsChange((prev: Set<string>) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  };

  const handlePullSingle = async (item: SyncableItem, opts?: { silent?: boolean }) => {
    onSyncingIdsChange((prev: Set<string>) => new Set(prev).add(item.id));
    // The download is one request, but writing the files back is one VFS call each — which is the
    // part that takes visible time on a large project and showed nothing until it finished.
    const progress = createSyncProgressToast(`Pulling "${item.name}"`);
    try {
      const result = await syncManager.pullSingleProject(item.id);

      if (!result.success || !result.project) {
        progress.error(result.error || 'Failed to pull project');
        track('sync_fail', { item_type: 'project', direction: 'pull' });
        return;
      }

      // Update or create local project
      let existingProject: Project | null = null;
      try {
        existingProject = await vfs.getProject(item.id);
      } catch {
        // Project doesn't exist locally yet
      }

      if (existingProject) {
        // Delete existing files first
        const existingFiles = await vfs.listFiles(item.id);
        for (const file of existingFiles) {
          await vfs.deleteFile(item.id, file.path);
        }
      } else {
        // Create project with the server's ID so files are linked correctly
        await vfs.createProject(result.project.name, result.project.description || '', item.id);
      }

      // Create all files
      const pulledFiles = result.files || [];
      let written = 0;
      for (const file of pulledFiles) {
        await vfs.createFile(item.id, file.path, file.content || '');
        progress.update(++written, pulledFiles.length);
      }

      // Update project with server data and sync metadata
      let pulledProject: Project | null = null;
      try {
        pulledProject = await vfs.getProject(item.id);
      } catch {
        // Should not happen at this point
      }
      if (pulledProject) {
        const serverUpdatedAt = result.project.updatedAt
          ? new Date(result.project.updatedAt)
          : new Date();
        pulledProject.name = result.project.name;
        pulledProject.description = result.project.description;
        pulledProject.updatedAt = serverUpdatedAt; // Match server timestamp
        pulledProject.lastSyncedAt = new Date();
        pulledProject.serverUpdatedAt = serverUpdatedAt;
        await vfs.updateProject(pulledProject, { preserveUpdatedAt: true });
      }

      progress.success(`Pulled "${item.name}" from server`);
      if (!opts?.silent) {
        track('sync_manual', { item_type: 'project', direction: 'pull', bulk: false, count: 1 });
      }
      onRefresh();
      onSyncComplete();
    } catch (error) {
      logger.error('Pull error:', error);
      progress.error('Failed to pull project');
      track('sync_fail', { item_type: 'project', direction: 'pull' });
    } finally {
      onSyncingIdsChange((prev: Set<string>) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  };

  // Register handlers on mount only
  useEffect(() => {
    const pushSelected = async () => {
      const currentItems = itemsRef.current;
      const currentSelectedIds = selectedIdsRef.current;

      const itemsToPush = currentItems.filter(
        (item) =>
          currentSelectedIds.has(item.id) &&
          ['local-newer', 'local-only', 'conflict'].includes(item.status)
      );

      for (const item of itemsToPush) {
        await handlePushSingle(item, { silent: true });
      }

      if (itemsToPush.length > 0) {
        track('sync_manual', { item_type: 'project', direction: 'push', bulk: true, count: itemsToPush.length });
      }

      onSelectedIdsChange(new Set());
    };

    const pullSelected = async () => {
      const currentItems = itemsRef.current;
      const currentSelectedIds = selectedIdsRef.current;

      const itemsToPull = currentItems.filter(
        (item) =>
          currentSelectedIds.has(item.id) &&
          ['server-newer', 'server-only', 'conflict'].includes(item.status)
      );

      for (const item of itemsToPull) {
        await handlePullSingle(item, { silent: true });
      }

      if (itemsToPull.length > 0) {
        track('sync_manual', { item_type: 'project', direction: 'pull', bulk: true, count: itemsToPull.length });
      }

      onSelectedIdsChange(new Set());
    };

    onRegisterPushSelected(pushSelected);
    onRegisterPullSelected(pullSelected);

    return () => {
      onRegisterPushSelected(null);
      onRegisterPullSelected(null);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  if (items.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No projects to sync
      </div>
    );
  }

  return (
    <div>
      {/* Summary */}
      <SummaryBar items={items} />

      {/* Item List - scrollable */}
      <div className="mt-3 border rounded-lg divide-y overflow-y-auto max-h-64">
        {items.map((item) => (
          <SyncItemRow
            key={item.id}
            item={item}
            selected={selectedIds.has(item.id)}
            onSelectChange={(selected) => handleSelectChange(item.id, selected)}
            onPush={() => handlePushSingle(item)}
            onPull={() => handlePullSingle(item)}
            syncing={syncingIds.has(item.id)}
            disabled={syncingIds.size > 0}
          />
        ))}
      </div>
    </div>
  );
}
