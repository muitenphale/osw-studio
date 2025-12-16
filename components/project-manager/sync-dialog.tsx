'use client';

import { useState, useEffect } from 'react';
import { Project } from '@/lib/vfs/types';
import { vfs } from '@/lib/vfs';
import { getSyncManager } from '@/lib/vfs/sync-manager';
import { getSyncOverviewStatus, SyncOverviewStatus } from '@/lib/vfs/auto-sync';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Cloud, CloudOff, Download, Upload, RefreshCw, AlertTriangle, Database, HardDrive, Globe } from 'lucide-react';
import { logger } from '@/lib/utils';

interface SyncDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSyncComplete?: () => void;
}

function formatRelativeTime(date: Date | null): string {
  if (!date) return 'Never';
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function SyncDialog({ open, onOpenChange, onSyncComplete }: SyncDialogProps) {
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [localProjects, setLocalProjects] = useState<Project[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncOverviewStatus | null>(null);
  const syncManager = getSyncManager();

  useEffect(() => {
    if (open) {
      checkAuth();
      loadData();
    }
  }, [open]);

  const checkAuth = async () => {
    try {
      const response = await fetch('/api/auth/me');
      const data = await response.json();
      setAuthenticated(data.authenticated);
    } catch (error) {
      setAuthenticated(false);
    } finally {
      setLoading(false);
    }
  };

  const loadData = async () => {
    try {
      await vfs.init();
      const projects = await vfs.listProjects();
      setLocalProjects(projects);

      // Get comprehensive sync status
      const status = await getSyncOverviewStatus();
      setSyncStatus(status);
    } catch (error) {
      logger.error('Failed to load sync data:', error);
    }
  };

  const handlePushAll = async () => {
    if (!authenticated) {
      toast.error('Not authenticated. Please login first.');
      return;
    }

    setSyncing(true);
    try {
      let successCount = 0;
      let errorCount = 0;

      for (const project of localProjects) {
        try {
          // Get all files for the project
          const files = await vfs.listFiles(project.id);

          // Push to server
          const result = await syncManager.pushProjectWithFiles(project, files);

          if (result.success) {
            successCount++;
          } else {
            errorCount++;
            logger.error(`Failed to sync project ${project.name}:`, result.error);
          }
        } catch (error) {
          errorCount++;
          logger.error(`Error syncing project ${project.name}:`, error);
        }
      }

      if (errorCount === 0) {
        toast.success(`Successfully synced ${successCount} project(s) to server`);
      } else {
        toast.warning(
          `Synced ${successCount} project(s), ${errorCount} failed`
        );
      }

      // Refresh status
      await loadData();
      onSyncComplete?.();
    } catch (error) {
      toast.error('Failed to sync projects');
      logger.error('Sync error:', error);
    } finally {
      setSyncing(false);
    }
  };

  const handlePullAll = async () => {
    if (!authenticated) {
      toast.error('Not authenticated. Please login first.');
      return;
    }

    setSyncing(true);
    try {
      // Get all projects from server
      const result = await syncManager.pullProjects();

      if (!result.success) {
        toast.error(result.error || 'Failed to fetch projects from server');
        return;
      }

      const serverProjects = result.projects || [];
      let successCount = 0;
      let errorCount = 0;

      for (const serverProject of serverProjects) {
        try {
          // Check if project already exists locally
          const existingProject = await vfs.getProject(serverProject.id);

          // Pull files
          const filesResult = await syncManager.pullFiles(serverProject.id);

          if (!filesResult.success) {
            errorCount++;
            logger.error(`Failed to pull files for ${serverProject.name}:`, filesResult.error);
            continue;
          }

          if (existingProject) {
            // Update existing project
            await vfs.updateProject(serverProject);

            // Delete existing files and recreate
            const existingFiles = await vfs.listFiles(serverProject.id);
            for (const file of existingFiles) {
              await vfs.deleteFile(serverProject.id, file.path);
            }
          } else {
            // Create new project
            await vfs.createProject(
              serverProject.name,
              serverProject.description || ''
            );
          }

          // Create all files
          for (const file of filesResult.files || []) {
            await vfs.createFile(serverProject.id, file.path, file.content || '');
          }

          successCount++;
        } catch (error) {
          errorCount++;
          logger.error(`Error pulling project ${serverProject.name}:`, error);
        }
      }

      if (errorCount === 0) {
        toast.success(`Successfully pulled ${successCount} project(s) from server`);
      } else {
        toast.warning(
          `Pulled ${successCount} project(s), ${errorCount} failed`
        );
      }

      // Refresh data
      await loadData();
      onSyncComplete?.();
    } catch (error) {
      toast.error('Failed to pull projects');
      logger.error('Pull error:', error);
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
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

  if (!authenticated) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              <CloudOff className="inline-block w-5 h-5 mr-2" />
              Not Authenticated
            </DialogTitle>
            <DialogDescription>
              You need to login to sync projects with the server.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                window.location.href = '/admin/login';
              }}
            >
              Go to Login
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  const showWarning = syncStatus?.needsSync || (syncStatus?.isUninitialized && localProjects.length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            <Cloud className="inline-block w-5 h-5 mr-2" />
            Server Sync
          </DialogTitle>
          <DialogDescription>
            Synchronize projects between your browser and the server database.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Warning Banner */}
          {showWarning && (
            <div className="flex items-start gap-3 p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-orange-600 dark:text-orange-400">
                  Server database is empty
                </p>
                <p className="text-muted-foreground mt-1">
                  Push your local projects to enable Sites functionality and publishing.
                </p>
              </div>
            </div>
          )}

          {/* Server Stats */}
          <div className="p-4 border rounded-lg space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Database className="w-4 h-4" />
              Server (SQLite)
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Projects:</span>{' '}
                <span className="font-medium">{syncStatus?.serverProjectCount ?? 0}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Sites:</span>{' '}
                <span className="font-medium">{syncStatus?.serverSiteCount ?? 0}</span>
              </div>
              <div className="col-span-2">
                <span className="text-muted-foreground">Last updated:</span>{' '}
                <span className="font-medium">
                  {formatRelativeTime(syncStatus?.serverLastUpdated ?? null)}
                </span>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={handlePullAll}
              disabled={syncing || (syncStatus?.serverProjectCount ?? 0) === 0}
            >
              {syncing ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              Pull from Server
            </Button>
          </div>

          {/* Local Stats */}
          <div className="p-4 border rounded-lg space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <HardDrive className="w-4 h-4" />
              Local (IndexedDB)
            </div>
            <div className="text-sm">
              <span className="text-muted-foreground">Projects:</span>{' '}
              <span className="font-medium">{localProjects.length}</span>
            </div>
            <Button
              variant={showWarning ? 'default' : 'outline'}
              size="sm"
              className="w-full"
              onClick={handlePushAll}
              disabled={syncing || localProjects.length === 0}
            >
              {syncing ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Upload className="w-4 h-4 mr-2" />
              )}
              Push to Server
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={syncing}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
