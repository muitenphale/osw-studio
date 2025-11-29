/**
 * Sync Manager
 *
 * Handles synchronization between browser (IndexedDB) and server (PostgreSQL) in Server mode.
 * Provides methods to push local data to server and pull server data to browser.
 */

import { Project, VirtualFile } from './types';

export interface SyncResult {
  success: boolean;
  error?: string;
}

export interface ProjectSyncResult extends SyncResult {
  project?: Project;
}

export interface FilesSyncResult extends SyncResult {
  count?: number;
}

export interface ProjectListSyncResult extends SyncResult {
  projects?: Project[];
}

export interface FilesListSyncResult extends SyncResult {
  files?: VirtualFile[];
}

/**
 * SyncManager - Client-side sync utility for Server mode
 */
export class SyncManager {
  private baseUrl: string;

  constructor(baseUrl = '') {
    this.baseUrl = baseUrl;
  }

  /**
   * Push project to server (IndexedDB → PostgreSQL)
   */
  async pushProject(project: Project): Promise<ProjectSyncResult> {
    try {
      const response = await fetch(`${this.baseUrl}/api/sync/projects`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ project }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        return {
          success: false,
          error: errorData.error || `HTTP ${response.status}`,
        };
      }

      const data = await response.json();
      return {
        success: true,
        project: data.project,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error',
      };
    }
  }

  /**
   * Pull all projects from server (PostgreSQL → IndexedDB)
   */
  async pullProjects(): Promise<ProjectListSyncResult> {
    try {
      const response = await fetch(`${this.baseUrl}/api/sync/projects`, {
        method: 'GET',
      });

      if (!response.ok) {
        const errorData = await response.json();
        return {
          success: false,
          error: errorData.error || `HTTP ${response.status}`,
        };
      }

      const data = await response.json();
      return {
        success: true,
        projects: data.projects,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error',
      };
    }
  }

  /**
   * Push files for a project to server (IndexedDB → PostgreSQL)
   */
  async pushFiles(projectId: string, files: VirtualFile[]): Promise<FilesSyncResult> {
    try {
      const response = await fetch(`${this.baseUrl}/api/sync/files`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ projectId, files }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        return {
          success: false,
          error: errorData.error || `HTTP ${response.status}`,
        };
      }

      const data = await response.json();
      return {
        success: true,
        count: data.count,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error',
      };
    }
  }

  /**
   * Pull files for a project from server (PostgreSQL → IndexedDB)
   */
  async pullFiles(projectId: string): Promise<FilesListSyncResult> {
    try {
      const response = await fetch(
        `${this.baseUrl}/api/sync/files?projectId=${encodeURIComponent(projectId)}`,
        {
          method: 'GET',
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        return {
          success: false,
          error: errorData.error || `HTTP ${response.status}`,
        };
      }

      const data = await response.json();
      return {
        success: true,
        files: data.files,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error',
      };
    }
  }

  /**
   * Full project sync: push project + files to server
   */
  async pushProjectWithFiles(
    project: Project,
    files: VirtualFile[]
  ): Promise<SyncResult> {
    // Push project metadata first
    const projectResult = await this.pushProject(project);
    if (!projectResult.success) {
      return projectResult;
    }

    // Then push all files
    const filesResult = await this.pushFiles(project.id, files);
    if (!filesResult.success) {
      return filesResult;
    }

    return { success: true };
  }

  /**
   * Full project sync: pull project + files from server to IndexedDB
   * Returns the project and files for the caller to insert into IndexedDB
   */
  async pullProjectWithFiles(projectId: string): Promise<{
    success: boolean;
    error?: string;
    project?: Project;
    files?: VirtualFile[];
  }> {
    // Pull all projects and find the one we need
    const projectsResult = await this.pullProjects();
    if (!projectsResult.success || !projectsResult.projects) {
      return {
        success: false,
        error: projectsResult.error || 'Failed to pull projects',
      };
    }

    const project = projectsResult.projects.find((p) => p.id === projectId);
    if (!project) {
      return {
        success: false,
        error: `Project ${projectId} not found on server`,
      };
    }

    // Pull files for the project
    const filesResult = await this.pullFiles(projectId);
    if (!filesResult.success) {
      return {
        success: false,
        error: filesResult.error || 'Failed to pull files',
      };
    }

    return {
      success: true,
      project,
      files: filesResult.files || [],
    };
  }

  /**
   * Push single project to server (new API endpoint)
   */
  async pushSingleProject(projectId: string, project: Project, files: VirtualFile[]): Promise<ProjectSyncResult> {
    try {
      const response = await fetch(`${this.baseUrl}/api/sync/projects/${projectId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ project, files }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        return {
          success: false,
          error: errorData.error || `HTTP ${response.status}`,
        };
      }

      const data = await response.json();
      return {
        success: true,
        project: data.project,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error',
      };
    }
  }

  /**
   * Pull single project from server (new API endpoint)
   */
  async pullSingleProject(projectId: string): Promise<{
    success: boolean;
    error?: string;
    project?: Project;
    files?: VirtualFile[];
  }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/sync/projects/${projectId}`, {
        method: 'GET',
      });

      if (!response.ok) {
        const errorData = await response.json();
        return {
          success: false,
          error: errorData.error || `HTTP ${response.status}`,
        };
      }

      const data = await response.json();
      return {
        success: true,
        project: data.project,
        files: data.files || [],
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error',
      };
    }
  }

  /**
   * Get sync status for all projects on server
   */
  async getSyncStatus(): Promise<{
    success: boolean;
    error?: string;
    projects?: Array<{ id: string; updatedAt: string }>;
  }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/sync/status`, {
        method: 'GET',
      });

      if (!response.ok) {
        const errorData = await response.json();
        return {
          success: false,
          error: errorData.error || `HTTP ${response.status}`,
        };
      }

      const data = await response.json();
      return {
        success: true,
        projects: data.projects || [],
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error',
      };
    }
  }
}

/**
 * Global singleton instance
 */
let syncManager: SyncManager | null = null;

/**
 * Get or create SyncManager instance
 */
export function getSyncManager(): SyncManager {
  if (!syncManager) {
    syncManager = new SyncManager();
  }
  return syncManager;
}
