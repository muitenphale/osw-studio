/**
 * Sync Manager
 *
 * Handles synchronization between browser (IndexedDB) and server (SQLite) in Server mode.
 * Provides methods to push local data to server and pull server data to browser.
 */

import { Project, VirtualFile, CustomTemplate } from './types';
import { Skill } from './skills/types';
import type { ModelTemplate } from '@/lib/llm/models/assignment';
import type { CustomConnection } from '@/lib/llm/providers/connection-record';
import { EnhancedSyncStatusResponse } from './sync-types';
import { encodeTemplateFiles, decodeTemplateFiles } from './binary-encoding';

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

interface FileManifestEntry {
  path: string;
  updatedAt: string | Date;
  size?: number;
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

export interface ModelTemplateSyncResult extends SyncResult {
  modelTemplate?: ModelTemplate;
  action?: 'created' | 'updated';
}

export interface ModelTemplatesListSyncResult extends SyncResult {
  modelTemplates?: ModelTemplate[];
  created?: number;
  updated?: number;
}

export interface InterviewTemplateSyncResult extends SyncResult {
  interviewTemplate?: import('@/lib/interview/types').InterviewTemplate;
  action?: 'created' | 'updated';
}
export interface InterviewTemplatesListSyncResult extends SyncResult {
  interviewTemplates?: import('@/lib/interview/types').InterviewTemplate[];
  created?: number;
  updated?: number;
}

export interface ConnectionSyncResult extends SyncResult {
  connection?: CustomConnection;
  action?: 'created' | 'updated';
}

export interface ConnectionsListSyncResult extends SyncResult {
  connections?: CustomConnection[];
}

// Helper: Convert ArrayBuffer to base64 for JSON transport.
// Exported because auto-sync pushes over its own transport: JSON.stringify turns an ArrayBuffer
// into {}, and the push route recreates the server's files from what it receives, so skipping this
// silently blanks every binary asset in the project.
export function serializeFileContent(file: VirtualFile): VirtualFile & { _isBinaryBase64?: boolean } {
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

// Helper: Convert base64 back to ArrayBuffer after JSON transport.
// Exported for the same reason as serializeFileContent: auto-sync pulls over its own transport,
// and writing the base64 string straight to the VFS turns every image and font into a text file.
export function deserializeFileContent(file: VirtualFile & { _isBinaryBase64?: boolean }): VirtualFile {
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
  workspaceId?: string;

  constructor(baseUrl = '') {
    this.baseUrl = baseUrl;
  }

  /**
   * Build an API URL, scoped to a workspace when workspaceId is set.
   *
   * With workspaceId:  /api/w/{workspaceId}{path}
   * Without:          /api{path}
   *
   * @param path - must start with '/' (e.g. '/sync/projects')
   */
  private getApiUrl(path: string): string {
    if (this.workspaceId) {
      return `/api/w/${this.workspaceId}${path}`;
    }
    return `/api${path}`;
  }

  /**
   * Push project to server (IndexedDB -> SQLite)
   */
  async pushProject(project: Project): Promise<ProjectSyncResult> {
    try {
      const response = await fetch(`${this.baseUrl}${this.getApiUrl('/sync/projects')}`, {
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
      const response = await fetch(`${this.baseUrl}${this.getApiUrl('/sync/projects')}`, {
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

      const response = await fetch(`${this.baseUrl}${this.getApiUrl('/sync/files')}`, {
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
        `${this.baseUrl}${this.getApiUrl('/sync/files')}?projectId=${encodeURIComponent(projectId)}`,
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

      const response = await fetch(`${this.baseUrl}${this.getApiUrl(`/sync/projects/${projectId}`)}`, {
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
   * Sync only files whose VFS revision differs from the server manifest. The
   * first sync still sends the full project; later generations avoid sending
   * unchanged source and binary assets over the network.
   */
  async pushProjectDelta(projectId: string, project: Project, files: VirtualFile[]): Promise<ProjectSyncResult> {
    try {
      const manifestResponse = await fetch(
        `${this.baseUrl}${this.getApiUrl(`/sync/projects/${projectId}`)}?manifest=1`,
      );

      if (manifestResponse.status === 404) {
        return this.pushSingleProject(projectId, project, files);
      }
      if (!manifestResponse.ok) {
        const errorData = await manifestResponse.json().catch(() => ({}));
        return { success: false, error: errorData.error || `HTTP ${manifestResponse.status}` };
      }

      const manifestData = await manifestResponse.json() as {
        project: Project;
        files: FileManifestEntry[];
      };
      const serverProject = manifestData.project;
      const clientLastSynced = project.lastSyncedAt ? new Date(project.lastSyncedAt).getTime() : 0;
      const serverUpdated = new Date(serverProject.updatedAt).getTime();
      if (clientLastSynced > 0 && serverUpdated > clientLastSynced) {
        return { success: false, error: 'conflict' };
      }

      const serverFiles = new Map(manifestData.files.map((file) => [file.path, file]));
      const changedFiles = files.filter((file) => {
        const serverFile = serverFiles.get(file.path);
        if (!serverFile) return true;
        return new Date(serverFile.updatedAt).getTime() !== new Date(file.updatedAt).getTime()
          || (serverFile.size ?? 0) !== (file.size ?? 0);
      });
      const localPaths = new Set(files.map((file) => file.path));
      const deletedPaths = manifestData.files
        .filter((file) => !localPaths.has(file.path))
        .map((file) => file.path);
      const projectChanged = new Date(project.updatedAt).getTime() !== serverUpdated;

      if (changedFiles.length === 0 && deletedPaths.length === 0 && !projectChanged) {
        return { success: true, project: serverProject };
      }

      const response = await fetch(`${this.baseUrl}${this.getApiUrl(`/sync/projects/${projectId}`)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project,
          files: changedFiles.map(serializeFileContent),
          deletedPaths,
          partial: true,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return { success: false, error: errorData.error || `HTTP ${response.status}` };
      }

      const data = await response.json();
      return { success: true, project: data.project };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Network error' };
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
      const response = await fetch(`${this.baseUrl}${this.getApiUrl(`/sync/projects/${projectId}`)}`, {
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
      const response = await fetch(`${this.baseUrl}${this.getApiUrl('/sync/status')}`, {
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
      const response = await fetch(`${this.baseUrl}${this.getApiUrl('/sync/skills')}`, {
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
      const response = await fetch(`${this.baseUrl}${this.getApiUrl('/sync/skills')}`, {
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
      const response = await fetch(`${this.baseUrl}${this.getApiUrl(`/sync/skills/${encodeURIComponent(id)}`)}`, {
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
      const response = await fetch(`${this.baseUrl}${this.getApiUrl(`/sync/skills/${encodeURIComponent(skill.id)}`)}`, {
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
      const response = await fetch(`${this.baseUrl}${this.getApiUrl(`/sync/skills/${encodeURIComponent(id)}`)}`, {
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
  // Model Template Sync Methods
  // ============================================

  /** Pull all model templates from server */
  async pullModelTemplates(): Promise<ModelTemplatesListSyncResult> {
    try {
      const response = await fetch(`${this.baseUrl}${this.getApiUrl('/sync/model-templates')}`, { method: 'GET' });
      if (!response.ok) {
        const errorData = await response.json();
        return { success: false, error: errorData.error || `HTTP ${response.status}` };
      }
      const data = await response.json();
      return { success: true, modelTemplates: data.modelTemplates || [] };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Network error' };
    }
  }

  /** Push multiple model templates to server */
  async pushModelTemplates(modelTemplates: ModelTemplate[]): Promise<ModelTemplatesListSyncResult> {
    try {
      const response = await fetch(`${this.baseUrl}${this.getApiUrl('/sync/model-templates')}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelTemplates }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        return { success: false, error: errorData.error || `HTTP ${response.status}` };
      }
      const data = await response.json();
      return { success: data.success, created: data.created, updated: data.updated, error: data.errors?.join(', ') };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Network error' };
    }
  }

  /** Pull a single model template from server */
  async pullModelTemplate(id: string): Promise<ModelTemplateSyncResult> {
    try {
      const response = await fetch(`${this.baseUrl}${this.getApiUrl(`/sync/model-templates/${encodeURIComponent(id)}`)}`, { method: 'GET' });
      if (!response.ok) {
        const errorData = await response.json();
        return { success: false, error: errorData.error || `HTTP ${response.status}` };
      }
      const data = await response.json();
      return { success: true, modelTemplate: data.modelTemplate };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Network error' };
    }
  }

  /** Push a single model template to server */
  async pushModelTemplate(modelTemplate: ModelTemplate): Promise<ModelTemplateSyncResult> {
    try {
      const response = await fetch(`${this.baseUrl}${this.getApiUrl(`/sync/model-templates/${encodeURIComponent(modelTemplate.id)}`)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelTemplate }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        return { success: false, error: errorData.error || `HTTP ${response.status}` };
      }
      const data = await response.json();
      return { success: true, modelTemplate: data.modelTemplate, action: data.action };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Network error' };
    }
  }

  /** Delete a model template from server */
  async deleteModelTemplateFromServer(id: string): Promise<SyncResult> {
    try {
      const response = await fetch(`${this.baseUrl}${this.getApiUrl(`/sync/model-templates/${encodeURIComponent(id)}`)}`, { method: 'DELETE' });
      if (!response.ok) {
        const errorData = await response.json();
        return { success: false, error: errorData.error || `HTTP ${response.status}` };
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Network error' };
    }
  }

  // ============================================
  // Interview Template Sync Methods
  // ============================================

  /** Pull all interview templates from server */
  async pullInterviewTemplates(): Promise<InterviewTemplatesListSyncResult> {
    try {
      const response = await fetch(`${this.baseUrl}${this.getApiUrl('/sync/interview-templates')}`, { method: 'GET' });
      if (!response.ok) {
        const errorData = await response.json();
        return { success: false, error: errorData.error || `HTTP ${response.status}` };
      }
      const data = await response.json();
      return { success: true, interviewTemplates: data.interviewTemplates || [] };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Network error' };
    }
  }

  /** Push multiple interview templates to server */
  async pushInterviewTemplates(interviewTemplates: import('@/lib/interview/types').InterviewTemplate[]): Promise<InterviewTemplatesListSyncResult> {
    try {
      const response = await fetch(`${this.baseUrl}${this.getApiUrl('/sync/interview-templates')}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interviewTemplates }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        return { success: false, error: errorData.error || `HTTP ${response.status}` };
      }
      const data = await response.json();
      return { success: data.success, created: data.created, updated: data.updated, error: data.errors?.join(', ') };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Network error' };
    }
  }

  /** Pull a single interview template from server */
  async pullInterviewTemplate(id: string): Promise<InterviewTemplateSyncResult> {
    try {
      const response = await fetch(`${this.baseUrl}${this.getApiUrl(`/sync/interview-templates/${encodeURIComponent(id)}`)}`, { method: 'GET' });
      if (!response.ok) {
        const errorData = await response.json();
        return { success: false, error: errorData.error || `HTTP ${response.status}` };
      }
      const data = await response.json();
      return { success: true, interviewTemplate: data.interviewTemplate };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Network error' };
    }
  }

  /** Push a single interview template to server */
  async pushInterviewTemplate(interviewTemplate: import('@/lib/interview/types').InterviewTemplate): Promise<InterviewTemplateSyncResult> {
    try {
      const response = await fetch(`${this.baseUrl}${this.getApiUrl(`/sync/interview-templates/${encodeURIComponent(interviewTemplate.id)}`)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interviewTemplate }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        return { success: false, error: errorData.error || `HTTP ${response.status}` };
      }
      const data = await response.json();
      return { success: true, interviewTemplate: data.interviewTemplate, action: data.action };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Network error' };
    }
  }

  /** Delete an interview template from server */
  async deleteInterviewTemplateFromServer(id: string): Promise<SyncResult> {
    try {
      const response = await fetch(`${this.baseUrl}${this.getApiUrl(`/sync/interview-templates/${encodeURIComponent(id)}`)}`, { method: 'DELETE' });
      if (!response.ok) {
        const errorData = await response.json();
        return { success: false, error: errorData.error || `HTTP ${response.status}` };
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Network error' };
    }
  }

  // ============================================
  // Connection Sync Methods
  // ============================================

  /** Pull all custom connections from server */
  async pullConnections(): Promise<ConnectionsListSyncResult> {
    try {
      const response = await fetch(`${this.baseUrl}${this.getApiUrl('/sync/connections')}`, { method: 'GET' });
      if (!response.ok) {
        const errorData = await response.json();
        return { success: false, error: errorData.error || `HTTP ${response.status}` };
      }
      const data = await response.json();
      return { success: true, connections: data.connections || [] };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Network error' };
    }
  }

  /** Push a single custom connection to server */
  async pushConnection(connection: CustomConnection): Promise<ConnectionSyncResult> {
    try {
      const response = await fetch(`${this.baseUrl}${this.getApiUrl(`/sync/connections/${encodeURIComponent(connection.id)}`)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        return { success: false, error: errorData.error || `HTTP ${response.status}` };
      }
      const data = await response.json();
      return { success: true, connection: data.connection, action: data.action };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Network error' };
    }
  }

  /** Delete a custom connection from server */
  async deleteConnectionFromServer(id: string): Promise<SyncResult> {
    try {
      const response = await fetch(`${this.baseUrl}${this.getApiUrl(`/sync/connections/${encodeURIComponent(id)}`)}`, { method: 'DELETE' });
      if (!response.ok) {
        const errorData = await response.json();
        return { success: false, error: errorData.error || `HTTP ${response.status}` };
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Network error' };
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
      const response = await fetch(`${this.baseUrl}${this.getApiUrl('/sync/templates')}`, {
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
        templates: (data.templates || []).map((t: CustomTemplate) => ({ ...t, files: decodeTemplateFiles(t.files) })),
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
      const response = await fetch(`${this.baseUrl}${this.getApiUrl('/sync/templates')}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        // Binary template files must be encoded: JSON.stringify turns an ArrayBuffer into {}.
        body: JSON.stringify({
          templates: templates.map((t) => ({ ...t, files: encodeTemplateFiles(t.files) })),
        }),
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
      const response = await fetch(`${this.baseUrl}${this.getApiUrl(`/sync/templates/${encodeURIComponent(id)}`)}`, {
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
        template: data.template && { ...data.template, files: decodeTemplateFiles(data.template.files) },
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
      const response = await fetch(`${this.baseUrl}${this.getApiUrl(`/sync/templates/${encodeURIComponent(template.id)}`)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          template: { ...template, files: encodeTemplateFiles(template.files) },
        }),
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
        template: data.template && { ...data.template, files: decodeTemplateFiles(data.template.files) },
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
      const response = await fetch(`${this.baseUrl}${this.getApiUrl(`/sync/templates/${encodeURIComponent(id)}`)}`, {
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
      const response = await fetch(`${this.baseUrl}${this.getApiUrl(`/sync/backend-features/${projectId}`)}`, {
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
      const response = await fetch(`${this.baseUrl}${this.getApiUrl(`/sync/backend-features/${projectId}`)}`, {
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
      const response = await fetch(`${this.baseUrl}${this.getApiUrl('/sync/status')}`, {
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
 * Get or create SyncManager instance.
 *
 * When workspaceId is provided the singleton's workspaceId is updated so all
 * subsequent API calls are scoped to `/api/w/{workspaceId}/…`.  Pass
 * `undefined` (or omit) to keep the current workspaceId unchanged, or pass
 * `null` explicitly to clear it (reverts to unscoped `/api/…` paths).
 */
export function getSyncManager(workspaceId?: string | null): SyncManager {
  if (!syncManager) {
    syncManager = new SyncManager();
  }
  if (workspaceId !== undefined) {
    syncManager.workspaceId = workspaceId ?? undefined;
  }
  return syncManager;
}
