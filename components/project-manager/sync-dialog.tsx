'use client';

import { useState, useEffect } from 'react';
import { Project } from '@/lib/vfs/types';
import { vfs } from '@/lib/vfs';
import { getSyncManager } from '@/lib/vfs/sync-manager';
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
import { Cloud, CloudOff, Download, Upload, RefreshCw } from 'lucide-react';
import { logger } from '@/lib/utils';

interface SyncDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSyncComplete?: () => void;
}

export function SyncDialog({ open, onOpenChange, onSyncComplete }: SyncDialogProps) {
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [localProjects, setLocalProjects] = useState<Project[]>([]);
  const syncManager = getSyncManager();

  useEffect(() => {
    if (open) {
      checkAuth();
      loadLocalProjects();
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

  const loadLocalProjects = async () => {
    try {
      await vfs.init();
      const projects = await vfs.listProjects();
      setLocalProjects(projects);
    } catch (error) {
      logger.error('Failed to load local projects:', error);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            <Cloud className="inline-block w-5 h-5 mr-2" />
            Bulk Sync Operations
          </DialogTitle>
          <DialogDescription>
            Projects auto-sync on save. Use this for troubleshooting or bulk operations.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div>
              <p className="font-medium">Local Projects</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {localProjects.length} project(s)
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
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

          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div>
              <p className="font-medium">Server Projects</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Pull from database
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handlePullAll}
              disabled={syncing}
            >
              {syncing ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              Pull from Server
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
