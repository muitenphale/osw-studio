'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Cloud, CloudOff, RefreshCw, AlertTriangle, CheckSquare, ArrowUp, ArrowDown } from 'lucide-react';
import { SyncTabs, BulkActionState } from './sync-tabs';
import { useSyncStatus } from './hooks/use-sync-status';

interface SyncDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSyncComplete?: () => void;
}

export function SyncDialog({ open, onOpenChange, onSyncComplete }: SyncDialogProps) {
  const [authenticated, setAuthenticated] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const { status, refresh, loading, refreshing, error } = useSyncStatus();
  const [bulkState, setBulkState] = useState<BulkActionState | null>(null);

  useEffect(() => {
    if (open) {
      checkAuth();
      refresh();
    }
  }, [open, refresh]);

  const checkAuth = async () => {
    setAuthLoading(true);
    try {
      const response = await fetch('/api/auth/me');
      const data = await response.json();
      setAuthenticated(data.authenticated);
    } catch {
      setAuthenticated(false);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSyncComplete = () => {
    refresh();
    onSyncComplete?.();
  };

  const dialogContentClass = "sm:max-w-2xl";

  // Loading state
  if (authLoading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className={dialogContentClass}>
          <DialogHeader>
            <DialogTitle>Server Sync</DialogTitle>
            <DialogDescription>
              Checking authentication status...
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
  }

  // Not authenticated
  if (!authenticated) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className={dialogContentClass}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CloudOff className="w-5 h-5" />
              Not Authenticated
            </DialogTitle>
            <DialogDescription>
              You need to login to sync projects, skills, and templates with the server.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={() => (window.location.href = '/admin/login')}>
              Go to Login
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={dialogContentClass}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cloud className="w-5 h-5" />
            Server Sync
          </DialogTitle>
          <DialogDescription>
            Synchronize projects, skills, and templates between your browser and the server.
          </DialogDescription>
        </DialogHeader>

        <div>
          {/* Error Banner */}
          {error && (
            <div className="flex items-start gap-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-red-600 dark:text-red-400">
                  Error loading sync status
                </p>
                <p className="text-muted-foreground mt-1">{error}</p>
              </div>
            </div>
          )}

          {/* Initial Loading */}
          {loading && (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">Loading sync status...</span>
            </div>
          )}

          {/* Tabbed Content (kept visible during refresh) */}
          {!loading && !error && (
            <div className="relative">
              {refreshing && (
                <div className="absolute inset-0 bg-background/60 z-10 flex items-center justify-center rounded-lg">
                  <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              )}
              <SyncTabs
                syncStatus={status}
                onRefresh={refresh}
                onSyncComplete={handleSyncComplete}
                onBulkActionStateChange={setBulkState}
              />
            </div>
          )}
        </div>

        <DialogFooter className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          {/* Bulk Actions - left side */}
          <div className="flex items-center gap-2 flex-wrap flex-1">
            {bulkState && bulkState.selectableCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={bulkState.onSelectAll}
                disabled={bulkState.isSyncing}
              >
                <CheckSquare className="h-3.5 w-3.5 mr-1.5" />
                {bulkState.selectedCount === bulkState.selectableCount ? 'Deselect' : 'Select All'}
              </Button>
            )}

            {bulkState && bulkState.pushableCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={bulkState.onPushSelected}
                disabled={bulkState.isSyncing}
              >
                <ArrowUp className="h-3.5 w-3.5 mr-1.5" />
                Push ({bulkState.pushableCount})
              </Button>
            )}

            {bulkState && bulkState.pullableCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={bulkState.onPullSelected}
                disabled={bulkState.isSyncing}
              >
                <ArrowDown className="h-3.5 w-3.5 mr-1.5" />
                Pull ({bulkState.pullableCount})
              </Button>
            )}
          </div>

          {/* Right side buttons */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={refresh}
              disabled={loading || refreshing}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading || refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
