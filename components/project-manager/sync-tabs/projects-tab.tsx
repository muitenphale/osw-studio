'use client';

import { useEffect, useRef } from 'react';
import { SyncableItem } from '@/lib/vfs/sync-types';
import { SummaryBar } from './summary-bar';
import { SyncItemRow } from '../sync-item-row';
import { vfs, Project } from '@/lib/vfs';
import { getSyncManager } from '@/lib/vfs/sync-manager';
import { toast } from 'sonner';
import { logger } from '@/lib/utils';

interface ProjectsTabProps {
  items: SyncableItem[];
  selectedIds: Set<string>;
  syncingIds: Set<string>;
  onSelectedIdsChange: (ids: Set<string>) => void;
  onSyncingIdsChange: (ids: Set<string>) => void;
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

  // Use refs to hold the latest values for use in handlers
  const selectedIdsRef = useRef(selectedIds);
  const syncingIdsRef = useRef(syncingIds);
  const itemsRef = useRef(items);

  // Keep refs up to date
  useEffect(() => {
    selectedIdsRef.current = selectedIds;
    syncingIdsRef.current = syncingIds;
    itemsRef.current = items;
  }, [selectedIds, syncingIds, items]);

  const handleSelectChange = (id: string, selected: boolean) => {
    const newSelected = new Set(selectedIds);
    if (selected) {
      newSelected.add(id);
    } else {
      newSelected.delete(id);
    }
    onSelectedIdsChange(newSelected);
  };

  const handlePushSingle = async (item: SyncableItem) => {
    onSyncingIdsChange(new Set(syncingIdsRef.current).add(item.id));
    try {
      const project = await vfs.getProject(item.id);
      if (!project) {
        toast.error(`Project "${item.name}" not found`);
        return;
      }

      const files = await vfs.listFiles(item.id);
      const result = await syncManager.pushSingleProject(item.id, project, files);

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
        toast.success(`Pushed "${item.name}" to server`);
        onRefresh();
        onSyncComplete();
      } else {
        toast.error(result.error || 'Failed to push project');
      }
    } catch (error) {
      logger.error('Push error:', error);
      toast.error('Failed to push project');
    } finally {
      const next = new Set(syncingIdsRef.current);
      next.delete(item.id);
      onSyncingIdsChange(next);
    }
  };

  const handlePullSingle = async (item: SyncableItem) => {
    onSyncingIdsChange(new Set(syncingIdsRef.current).add(item.id));
    try {
      const result = await syncManager.pullSingleProject(item.id);

      if (!result.success || !result.project) {
        toast.error(result.error || 'Failed to pull project');
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
      for (const file of result.files || []) {
        await vfs.createFile(item.id, file.path, file.content || '');
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

      toast.success(`Pulled "${item.name}" from server`);
      onRefresh();
      onSyncComplete();
    } catch (error) {
      logger.error('Pull error:', error);
      toast.error('Failed to pull project');
    } finally {
      const next = new Set(syncingIdsRef.current);
      next.delete(item.id);
      onSyncingIdsChange(next);
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
        await handlePushSingle(item);
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
        await handlePullSingle(item);
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
