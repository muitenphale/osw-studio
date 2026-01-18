'use client';

import { cn } from '@/lib/utils';
import { ItemSyncStatus } from '@/lib/vfs/sync-types';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  CheckCircle,
  ArrowUp,
  ArrowDown,
  AlertTriangle,
  HardDrive,
  Cloud,
  RefreshCw,
  XCircle,
} from 'lucide-react';

interface SyncStatusBadgeProps {
  status: ItemSyncStatus;
  showLabel?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

const STATUS_CONFIG: Record<
  ItemSyncStatus,
  {
    label: string;
    description: string;
    icon: typeof CheckCircle;
    colorClass: string;
    bgClass: string;
  }
> = {
  synced: {
    label: 'Synced',
    description: 'Local and server are in sync. No action needed.',
    icon: CheckCircle,
    colorClass: 'text-green-600 dark:text-green-400',
    bgClass: 'bg-green-500/10',
  },
  'local-newer': {
    label: 'Local newer',
    description: 'You have local changes not yet on the server. Push to sync.',
    icon: ArrowUp,
    colorClass: 'text-blue-600 dark:text-blue-400',
    bgClass: 'bg-blue-500/10',
  },
  'server-newer': {
    label: 'Server newer',
    description: 'Server has updates you don\'t have locally. Pull to get latest.',
    icon: ArrowDown,
    colorClass: 'text-orange-600 dark:text-orange-400',
    bgClass: 'bg-orange-500/10',
  },
  conflict: {
    label: 'Conflict',
    description: 'Both local and server have changes. Push to overwrite server, or pull to discard local changes.',
    icon: AlertTriangle,
    colorClass: 'text-red-600 dark:text-red-400',
    bgClass: 'bg-red-500/10',
  },
  'local-only': {
    label: 'Local only',
    description: 'Only exists in your browser. Push to save to server.',
    icon: HardDrive,
    colorClass: 'text-gray-600 dark:text-gray-400',
    bgClass: 'bg-gray-500/10',
  },
  'server-only': {
    label: 'Server only',
    description: 'Only exists on server. Pull to download locally.',
    icon: Cloud,
    colorClass: 'text-purple-600 dark:text-purple-400',
    bgClass: 'bg-purple-500/10',
  },
  syncing: {
    label: 'Syncing...',
    description: 'Currently syncing with server.',
    icon: RefreshCw,
    colorClass: 'text-blue-600 dark:text-blue-400',
    bgClass: 'bg-blue-500/10',
  },
  error: {
    label: 'Error',
    description: 'Sync failed. Try again.',
    icon: XCircle,
    colorClass: 'text-red-600 dark:text-red-400',
    bgClass: 'bg-red-500/10',
  },
};

export function SyncStatusBadge({
  status,
  showLabel = true,
  size = 'sm',
  className,
}: SyncStatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;

  const iconSize = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm';
  const padding = size === 'sm' ? 'px-1.5 py-0.5' : 'px-2 py-1';

  const badge = (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full font-medium cursor-help',
        padding,
        config.bgClass,
        config.colorClass,
        textSize,
        className
      )}
    >
      <Icon
        className={cn(iconSize, status === 'syncing' && 'animate-spin')}
      />
      {showLabel && <span>{config.label}</span>}
    </span>
  );

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p className="text-sm">{config.description}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function getStatusPriority(status: ItemSyncStatus): number {
  const priorities: Record<ItemSyncStatus, number> = {
    conflict: 0,
    error: 1,
    'local-newer': 2,
    'server-newer': 3,
    syncing: 4,
    'local-only': 5,
    'server-only': 6,
    synced: 7,
  };
  return priorities[status];
}
