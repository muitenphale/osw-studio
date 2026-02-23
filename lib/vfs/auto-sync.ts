/**
 * Auto-Sync Utility
 *
 * Handles automatic background synchronization of projects to server.
 * Provides sync status calculation and conflict detection.
 */

import { Project } from './types';
import { vfs } from './index';
import { logger } from '@/lib/utils';
import { toast } from 'sonner';

export type SyncStatus = 'synced' | 'local-newer' | 'server-newer' | 'conflict' | 'never-synced' | 'local-only' | 'server-only';

interface SyncStatusResult {
  status: SyncStatus;
  message: string;
}

/**
 * Comprehensive sync status info for UI display
 */
export interface SyncOverviewStatus {
  serverProjectCount: number;
  serverDeploymentCount: number;
  serverLastUpdated: Date | null;
  localProjectCount: number;
  isUninitialized: boolean;  // Server has no projects
  needsSync: boolean;        // Local has projects but server is empty or out of sync
  loading: boolean;
  error: string | null;
}

/**
 * Calculate sync status using three-way timestamp comparison
 */
export function calculateSyncStatus(
  localProject: Project,
  serverUpdatedAt?: Date
): SyncStatusResult {
  const { updatedAt, lastSyncedAt } = localProject;

  // If no server timestamp available, it's local-only
  if (!serverUpdatedAt) {
    return {
      status: 'local-only',
      message: 'Project exists only locally'
    };
  }

  // If never synced before
  if (!lastSyncedAt) {
    // Compare local and server times
    if (updatedAt > serverUpdatedAt) {
      return {
        status: 'local-newer',
        message: 'Local changes not yet synced'
      };
    } else if (serverUpdatedAt > updatedAt) {
      return {
        status: 'server-newer',
        message: 'Server has updates'
      };
    } else {
      return {
        status: 'synced',
        message: 'In sync with server'
      };
    }
  }

  // Three-way comparison
  const localChanged = updatedAt > lastSyncedAt;
  const serverChanged = serverUpdatedAt > lastSyncedAt;

  if (localChanged && serverChanged) {
    return {
      status: 'conflict',
      message: 'Both local and server have changes'
    };
  }

  if (localChanged) {
    return {
      status: 'local-newer',
      message: 'Local changes not yet synced'
    };
  }

  if (serverChanged) {
    return {
      status: 'server-newer',
      message: 'Server has updates'
    };
  }

  return {
    status: 'synced',
    message: 'In sync with server'
  };
}

/**
 * Auto-sync a project to the server (non-blocking)
 */
export async function autoSyncProject(projectId: string): Promise<void> {
  // Only sync in Server Mode
  if (process.env.NEXT_PUBLIC_SERVER_MODE !== 'true') {
    return;
  }

  try {
    const project = await vfs.getProject(projectId);
    if (!project) {
      logger.error(`[AutoSync] Project ${projectId} not found`);
      return;
    }

    // Don't sync if already syncing
    if (project.syncStatus === 'syncing') {
      return;
    }

    // Get all files
    const files = await vfs.listFiles(projectId);

    // Push to server
    const response = await fetch(`/api/sync/projects/${projectId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ project, files }),
    });

    if (!response.ok) {
      throw new Error(`Sync failed: ${response.status}`);
    }

    const data = await response.json();
    const syncedProject = data.project;

    // Update local project with sync metadata (preserve updatedAt)
    project.lastSyncedAt = new Date(syncedProject.lastSyncedAt);
    project.serverUpdatedAt = new Date(syncedProject.serverUpdatedAt);
    project.syncStatus = 'synced';
    await vfs.updateProject(project, { preserveUpdatedAt: true });

    logger.debug(`[AutoSync] Project ${projectId} synced successfully`);

    // Show subtle success notification
    toast.success('Project synced ✓', {
      duration: 2000,
      position: 'bottom-right'
    });
  } catch (error) {
    logger.error(`[AutoSync] Failed to sync project ${projectId}:`, error);

    // Update sync status to error (preserve updatedAt)
    try {
      const project = await vfs.getProject(projectId);
      if (project) {
        project.syncStatus = 'error';
        await vfs.updateProject(project, { preserveUpdatedAt: true });
      }
    } catch (updateError) {
      logger.error(`[AutoSync] Failed to update project status:`, updateError);
    }

    // Only show error if it's not a "server not enabled" error
    const errorMessage = error instanceof Error ? error.message : '';
    if (!errorMessage.includes('Server mode not enabled')) {
      toast.error('Sync failed - will retry', {
        duration: 4000,
        position: 'bottom-right'
      });
    }
  }
}

/**
 * Check if server has updates for a project
 */
export async function checkServerUpdates(projectId: string): Promise<boolean> {
  if (process.env.NEXT_PUBLIC_SERVER_MODE !== 'true') {
    return false;
  }

  try {
    const response = await fetch(`/api/sync/projects/${projectId}`);
    if (!response.ok) {
      if (response.status === 404) {
        // Project doesn't exist on server
        return false;
      }
      throw new Error(`Failed to check server updates: ${response.status}`);
    }

    const data = await response.json();
    const serverProject: Project = data.project;

    const localProject = await vfs.getProject(projectId);
    if (!localProject) {
      return false;
    }

    // Server has updates if its updatedAt is newer than our last sync
    if (localProject.lastSyncedAt) {
      return new Date(serverProject.updatedAt) > localProject.lastSyncedAt;
    }

    // If never synced, compare with local updatedAt
    return new Date(serverProject.updatedAt) > localProject.updatedAt;
  } catch (error) {
    logger.error(`[AutoSync] Failed to check server updates for ${projectId}:`, error);
    return false;
  }
}

/**
 * Pull updates from server for a project
 */
export async function pullServerUpdates(projectId: string, showToast = true): Promise<boolean> {
  if (process.env.NEXT_PUBLIC_SERVER_MODE !== 'true') {
    return false;
  }

  try {
    const response = await fetch(`/api/sync/projects/${projectId}`);
    if (!response.ok) {
      throw new Error(`Failed to pull updates: ${response.status}`);
    }

    const data = await response.json();
    const serverProject: Project = data.project;
    const serverFiles = data.files;

    // Update project
    await vfs.updateProject(serverProject);

    // Delete existing files and recreate
    const existingFiles = await vfs.listFiles(projectId);
    for (const file of existingFiles) {
      await vfs.deleteFile(projectId, file.path);
    }

    for (const file of serverFiles) {
      await vfs.createFile(projectId, file.path, file.content || '');
    }

    // Update sync metadata
    const localProject = await vfs.getProject(projectId);
    if (localProject) {
      localProject.lastSyncedAt = new Date();
      localProject.serverUpdatedAt = new Date(serverProject.updatedAt);
      localProject.syncStatus = 'synced';
      await vfs.updateProject(localProject);
    }

    logger.debug(`[AutoSync] Pulled updates for project ${projectId}`);
    if (showToast) {
      toast.success('Project updated from server ✓');
    }

    return true;
  } catch (error) {
    logger.error(`[AutoSync] Failed to pull updates for ${projectId}:`, error);
    if (showToast) {
      toast.error('Failed to pull server updates');
    }
    return false;
  }
}

/**
 * Get comprehensive sync overview status for UI display
 * Compares local IndexedDB with server SQLite state
 */
export async function getSyncOverviewStatus(): Promise<SyncOverviewStatus> {
  // Only available in Server Mode
  if (process.env.NEXT_PUBLIC_SERVER_MODE !== 'true') {
    return {
      serverProjectCount: 0,
      serverDeploymentCount: 0,
      serverLastUpdated: null,
      localProjectCount: 0,
      isUninitialized: false,
      needsSync: false,
      loading: false,
      error: 'Server mode not enabled',
    };
  }

  try {
    // Fetch server status
    const response = await fetch('/api/sync/status');
    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }

    const data = await response.json();
    const summary = data.summary || {
      projectCount: 0,
      deploymentCount: 0,
      lastUpdated: null,
      isUninitialized: true,
    };

    // Get local project count from IndexedDB
    await vfs.init();
    const localProjects = await vfs.listProjects();
    const localProjectCount = localProjects.length;

    // Determine if sync is needed
    const isUninitialized = summary.projectCount === 0;
    const needsSync = isUninitialized && localProjectCount > 0;

    return {
      serverProjectCount: summary.projectCount,
      serverDeploymentCount: summary.deploymentCount,
      serverLastUpdated: summary.lastUpdated ? new Date(summary.lastUpdated) : null,
      localProjectCount,
      isUninitialized,
      needsSync,
      loading: false,
      error: null,
    };
  } catch (error) {
    logger.error('[AutoSync] Failed to get sync overview status:', error);
    return {
      serverProjectCount: 0,
      serverDeploymentCount: 0,
      serverLastUpdated: null,
      localProjectCount: 0,
      isUninitialized: true,
      needsSync: false,
      loading: false,
      error: error instanceof Error ? error.message : 'Failed to fetch sync status',
    };
  }
}

/**
 * Auto-pull all projects from server on Project Manager load
 * Silently checks for server updates and pulls newer versions
 */
export async function autoPullAllProjects(): Promise<{
  pulled: number;
  skipped: number;
  errors: number;
}> {
  if (process.env.NEXT_PUBLIC_SERVER_MODE !== 'true') {
    return { pulled: 0, skipped: 0, errors: 0 };
  }

  let pulled = 0;
  let skipped = 0;
  let errors = 0;

  try {
    // Get all server project statuses
    const response = await fetch('/api/sync/status');
    if (!response.ok) {
      logger.debug('[AutoSync] Server not available for pull');
      return { pulled: 0, skipped: 0, errors: 0 };
    }

    const data = await response.json();
    const serverStatuses = data.projects || [];

    // Check each server project against local
    for (const serverStatus of serverStatuses) {
      try {
        const localProject = await vfs.getProject(serverStatus.id);
        const serverUpdatedAt = new Date(serverStatus.updatedAt);

        if (!localProject) {
          // Project doesn't exist locally - pull it
          const pullResponse = await fetch(`/api/sync/projects/${serverStatus.id}`);
          if (!pullResponse.ok) {
            errors++;
            continue;
          }

          const pullData = await pullResponse.json();
          const serverProject: Project = pullData.project;
          const serverFiles = pullData.files;

          // Create project
          await vfs.createProject(serverProject.name, serverProject.description || '');

          // Create all files
          for (const file of serverFiles) {
            await vfs.createFile(serverStatus.id, file.path, file.content || '');
          }

          // Update sync metadata (preserve updatedAt)
          const newProject = await vfs.getProject(serverStatus.id);
          if (newProject) {
            newProject.lastSyncedAt = new Date();
            newProject.serverUpdatedAt = serverUpdatedAt;
            newProject.syncStatus = 'synced';
            await vfs.updateProject(newProject, { preserveUpdatedAt: true });
          }

          pulled++;
          logger.debug(`[AutoSync] Pulled new project: ${serverProject.name}`);
        } else {
          // Project exists locally - check if server is newer
          const syncStatus = calculateSyncStatus(localProject, serverUpdatedAt);

          if (syncStatus.status === 'server-newer') {
            // Server has updates - pull them (silently, no toast)
            await pullServerUpdates(serverStatus.id, false);
            pulled++;
          } else {
            skipped++;
          }
        }
      } catch (error) {
        logger.error(`[AutoSync] Failed to process project ${serverStatus.id}:`, error);
        errors++;
      }
    }

    if (pulled > 0) {
      logger.debug(`[AutoSync] Auto-pull complete: ${pulled} updated, ${skipped} skipped, ${errors} errors`);
    }

    return { pulled, skipped, errors };
  } catch (error) {
    logger.error('[AutoSync] Failed to auto-pull projects:', error);
    return { pulled, skipped, errors };
  }
}
