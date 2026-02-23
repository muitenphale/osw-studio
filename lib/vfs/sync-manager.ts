/**
 * Sync Manager
 *
 * Handles synchronization between browser (IndexedDB) and server (SQLite) in Server mode.
 * Provides methods to push local data to server and pull server data to browser.
 */

import { Project, VirtualFile, CustomTemplate } from './types';
import { Skill } from './skills/types';
import { EnhancedSyncStatusResponse } from './sync-types';

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

export interface SkillSyncResult extends SyncResult {
  skill?: Skill;
  action?: 'created' | 'updated';
}

export interface SkillsListSyncResult extends SyncResult {
  skills?: Skill[];
  created?: number;
  updated?: number;
}

export interface TemplateSyncResult extends SyncResult {
  template?: CustomTemplate;
  action?: 'created' | 'updated';
}

export interface TemplatesListSyncResult extends SyncResult {
  templates?: CustomTemplate[];
  created?: number;
  updated?: number;
}

// Helper: Convert ArrayBuffer to base64 for JSON transport
function serializeFileContent(file: VirtualFile): VirtualFile & { _isBinaryBase64?: boolean } {
  if (file.content instanceof ArrayBuffer) {
    const bytes = new Uint8Array(file.content);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return { ...file, content: btoa(binary), _isBinaryBase64: true };
  }
  return file;
}

// Helper: Convert base64 back to ArrayBuffer after JSON transport
function deserializeFileContent(file: VirtualFile & { _isBinaryBase64?: boolean }): VirtualFile {
  if (file._isBinaryBase64 && typeof file.content === 'string') {
    const binaryString = atob(file.content);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const { _isBinaryBase64, ...rest } = file;
    return { ...rest, content: bytes.buffer };
  }
  const { _isBinaryBase64, ...rest } = file;
  return rest;
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
   * Push project to server (IndexedDB -> SQLite)
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
   * Pull all projects from server (SQLite -> IndexedDB)
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
   * Push files for a project to server (IndexedDB -> SQLite)
   */
  async pushFiles(projectId: string, files: VirtualFile[]): Promise<FilesSyncResult> {
    try {
      const serializedFiles = files.map(serializeFileContent);

      const response = await fetch(`${this.baseUrl}/api/sync/files`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ projectId, files: serializedFiles }),
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
   * Pull files for a project from server (SQLite -> IndexedDB)
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
        files: (data.files || []).map(deserializeFileContent),
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
      const serializedFiles = files.map(serializeFileContent);

      const response = await fetch(`${this.baseUrl}/api/sync/projects/${projectId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ project, files: serializedFiles }),
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
        files: (data.files || []).map(deserializeFileContent),
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

  // ============================================
  // Skills Sync Methods
  // ============================================

  /**
   * Pull all custom skills from server
   */
  async pullSkills(): Promise<SkillsListSyncResult> {
    try {
      const response = await fetch(`${this.baseUrl}/api/sync/skills`, {
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
        skills: data.skills || [],
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error',
      };
    }
  }

  /**
   * Push multiple skills to server
   */
  async pushSkills(skills: Skill[]): Promise<SkillsListSyncResult> {
    try {
      const response = await fetch(`${this.baseUrl}/api/sync/skills`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ skills }),
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
        success: data.success,
        created: data.created,
        updated: data.updated,
        error: data.errors?.join(', '),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error',
      };
    }
  }

  /**
   * Pull a single skill from server
   */
  async pullSkill(id: string): Promise<SkillSyncResult> {
    try {
      const response = await fetch(`${this.baseUrl}/api/sync/skills/${encodeURIComponent(id)}`, {
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
        skill: data.skill,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error',
      };
    }
  }

  /**
   * Push a single skill to server
   */
  async pushSkill(skill: Skill): Promise<SkillSyncResult> {
    try {
      const response = await fetch(`${this.baseUrl}/api/sync/skills/${encodeURIComponent(skill.id)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ skill }),
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
        skill: data.skill,
        action: data.action,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error',
      };
    }
  }

  /**
   * Delete a skill from server
   */
  async deleteSkillFromServer(id: string): Promise<SyncResult> {
    try {
      const response = await fetch(`${this.baseUrl}/api/sync/skills/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        return {
          success: false,
          error: errorData.error || `HTTP ${response.status}`,
        };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error',
      };
    }
  }

  // ============================================
  // Templates Sync Methods
  // ============================================

  /**
   * Pull all custom templates from server
   */
  async pullTemplates(): Promise<TemplatesListSyncResult> {
    try {
      const response = await fetch(`${this.baseUrl}/api/sync/templates`, {
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
        templates: data.templates || [],
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error',
      };
    }
  }

  /**
   * Push multiple templates to server
   */
  async pushTemplates(templates: CustomTemplate[]): Promise<TemplatesListSyncResult> {
    try {
      const response = await fetch(`${this.baseUrl}/api/sync/templates`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ templates }),
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
        success: data.success,
        created: data.created,
        updated: data.updated,
        error: data.errors?.join(', '),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error',
      };
    }
  }

  /**
   * Pull a single template from server
   */
  async pullTemplate(id: string): Promise<TemplateSyncResult> {
    try {
      const response = await fetch(`${this.baseUrl}/api/sync/templates/${encodeURIComponent(id)}`, {
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
        template: data.template,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error',
      };
    }
  }

  /**
   * Push a single template to server
   */
  async pushTemplate(template: CustomTemplate): Promise<TemplateSyncResult> {
    try {
      const response = await fetch(`${this.baseUrl}/api/sync/templates/${encodeURIComponent(template.id)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ template }),
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
        template: data.template,
        action: data.action,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error',
      };
    }
  }

  /**
   * Delete a template from server
   */
  async deleteTemplateFromServer(id: string): Promise<SyncResult> {
    try {
      const response = await fetch(`${this.baseUrl}/api/sync/templates/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        return {
          success: false,
          error: errorData.error || `HTTP ${response.status}`,
        };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error',
      };
    }
  }

  // ============================================
  // Backend Features Sync (Project-scoped)
  // ============================================

  /**
   * Push backend features from IndexedDB to server (core SQLite)
   * Called after backend feature modifications in the workspace
   */
  async pushBackendFeatures(
    projectId: string,
    features?: {
      edgeFunctions: import('./types').EdgeFunction[];
      serverFunctions: import('./types').ServerFunction[];
      secrets: import('./types').Secret[];
      scheduledFunctions: import('./types').ScheduledFunction[];
    }
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/sync/backend-features/${projectId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(features || {
          edgeFunctions: [],
          serverFunctions: [],
          secrets: [],
          scheduledFunctions: [],
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return { success: false, error: errorData.error || `HTTP ${response.status}` };
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Network error' };
    }
  }

  /**
   * Pull backend features from server (core SQLite) to IndexedDB
   * Called during project sync/pull operations
   */
  async pullBackendFeatures(projectId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/sync/backend-features/${projectId}`, {
        method: 'GET',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return { success: false, error: errorData.error || `HTTP ${response.status}` };
      }

      const data = await response.json() as {
        edgeFunctions?: import('./types').EdgeFunction[];
        serverFunctions?: import('./types').ServerFunction[];
        secrets?: import('./types').Secret[];
        scheduledFunctions?: import('./types').ScheduledFunction[];
      };

      // Write pulled features to IndexedDB via the VFS adapter
      try {
        const { vfs } = await import('@/lib/vfs');
        const adapter = vfs.getStorageAdapter();

        // Clear existing features for this project, then re-create from server data
        if (adapter.listEdgeFunctions && adapter.deleteEdgeFunction && adapter.createEdgeFunction) {
          const existing = await adapter.listEdgeFunctions(projectId);
          for (const fn of existing) {
            await adapter.deleteEdgeFunction(fn.id);
          }
          for (const fn of data.edgeFunctions || []) {
            await adapter.createEdgeFunction({ ...fn, projectId });
          }
        }

        if (adapter.listServerFunctions && adapter.deleteServerFunction && adapter.createServerFunction) {
          const existing = await adapter.listServerFunctions(projectId);
          for (const fn of existing) {
            await adapter.deleteServerFunction(fn.id);
          }
          for (const fn of data.serverFunctions || []) {
            await adapter.createServerFunction({ ...fn, projectId });
          }
        }

        if (adapter.listSecrets && adapter.deleteSecret && adapter.createSecret) {
          const existing = await adapter.listSecrets(projectId);
          for (const s of existing) {
            await adapter.deleteSecret(s.id);
          }
          for (const s of data.secrets || []) {
            await adapter.createSecret({ ...s, projectId });
          }
        }

        if (adapter.listScheduledFunctions && adapter.deleteScheduledFunction && adapter.createScheduledFunction) {
          const existing = await adapter.listScheduledFunctions(projectId);
          for (const fn of existing) {
            await adapter.deleteScheduledFunction(fn.id);
          }
          for (const fn of data.scheduledFunctions || []) {
            await adapter.createScheduledFunction({ ...fn, projectId });
          }
        }
      } catch (writeError) {
        console.error('[SyncManager] Failed to write pulled backend features to IndexedDB:', writeError);
        return { success: false, error: writeError instanceof Error ? writeError.message : 'Failed to write to IndexedDB' };
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Network error' };
    }
  }

  // ============================================
  // Detailed Sync Status
  // ============================================

  /**
   * Get enhanced sync status including skills and templates
   */
  async getEnhancedSyncStatus(): Promise<{
    success: boolean;
    error?: string;
    data?: EnhancedSyncStatusResponse;
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
        data: data as EnhancedSyncStatusResponse,
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
