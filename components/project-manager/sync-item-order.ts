import type { ItemSyncStatus, SyncableItem } from '@/lib/vfs/sync-types';

/** Conflicts first so a "1 conflicts" summary is not buried in a long synced list. */
const STATUS_RANK: Record<ItemSyncStatus, number> = {
  conflict: 0,
  'server-newer': 1,
  'local-newer': 2,
  'server-only': 3,
  'local-only': 4,
  synced: 5,
  syncing: 6,
  error: 7,
};

export function sortSyncItems<T extends Pick<SyncableItem, 'status' | 'name'>>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const rank = (STATUS_RANK[a.status] ?? 99) - (STATUS_RANK[b.status] ?? 99);
    if (rank !== 0) return rank;
    return a.name.localeCompare(b.name);
  });
}
