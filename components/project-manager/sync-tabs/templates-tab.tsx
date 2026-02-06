'use client';

import { useEffect, useRef } from 'react';
import { SyncableItem } from '@/lib/vfs/sync-types';
import { SummaryBar } from './summary-bar';
import { SyncItemRow } from '../sync-item-row';
import { vfs } from '@/lib/vfs';
import { getSyncManager } from '@/lib/vfs/sync-manager';
import { toast } from 'sonner';
import { logger } from '@/lib/utils';

interface TemplatesTabProps {
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

export function TemplatesTab({
  items,
  selectedIds,
  syncingIds,
  onSelectedIdsChange,
  onSyncingIdsChange,
  onRefresh,
  onSyncComplete,
  onRegisterPushSelected,
  onRegisterPullSelected,
}: TemplatesTabProps) {
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
      // Get template from IndexedDB
      await vfs.init();
      const template = await vfs.getStorageAdapter().getCustomTemplate(item.id);

      if (!template) {
        toast.error(`Template "${item.name}" not found`);
        return;
      }

      const result = await syncManager.pushTemplate(template);

      if (result.success) {
        toast.success(`Pushed "${item.name}" to server`);
        onRefresh();
        onSyncComplete();
      } else {
        toast.error(result.error || 'Failed to push template');
      }
    } catch (error) {
      logger.error('Push template error:', error);
      toast.error('Failed to push template');
    } finally {
      const next = new Set(syncingIdsRef.current);
      next.delete(item.id);
      onSyncingIdsChange(next);
    }
  };

  const handlePullSingle = async (item: SyncableItem) => {
    onSyncingIdsChange(new Set(syncingIdsRef.current).add(item.id));
    try {
      const result = await syncManager.pullTemplate(item.id);

      if (!result.success || !result.template) {
        toast.error(result.error || 'Failed to pull template');
        return;
      }

      // Save template to IndexedDB
      await vfs.init();

      // Restore Date objects
      const template = {
        ...result.template,
        importedAt: new Date(result.template.importedAt),
        updatedAt: result.template.updatedAt ? new Date(result.template.updatedAt) : new Date(),
      };

      await vfs.getStorageAdapter().saveCustomTemplate(template);

      toast.success(`Pulled "${item.name}" from server`);
      onRefresh();
      onSyncComplete();
    } catch (error) {
      logger.error('Pull template error:', error);
      toast.error('Failed to pull template');
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
        No custom templates to sync
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
