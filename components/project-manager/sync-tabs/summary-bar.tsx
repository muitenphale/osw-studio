'use client';

import { SyncableItem } from '@/lib/vfs/sync-types';

interface SummaryBarProps {
  items: SyncableItem[];
}

export function SummaryBar({ items }: SummaryBarProps) {
  const synced = items.filter((i) => i.status === 'synced').length;
  const localNewer = items.filter((i) => i.status === 'local-newer').length;
  const serverNewer = items.filter((i) => i.status === 'server-newer').length;
  const conflicts = items.filter((i) => i.status === 'conflict').length;
  const localOnly = items.filter((i) => i.status === 'local-only').length;
  const serverOnly = items.filter((i) => i.status === 'server-only').length;

  const parts: string[] = [];
  if (synced > 0) parts.push(`${synced} synced`);
  if (localNewer > 0) parts.push(`${localNewer} local newer`);
  if (serverNewer > 0) parts.push(`${serverNewer} server newer`);
  if (conflicts > 0) parts.push(`${conflicts} conflicts`);
  if (localOnly > 0) parts.push(`${localOnly} local only`);
  if (serverOnly > 0) parts.push(`${serverOnly} server only`);

  return (
    <div className="text-sm text-muted-foreground">
      {parts.join(', ')}
    </div>
  );
}
