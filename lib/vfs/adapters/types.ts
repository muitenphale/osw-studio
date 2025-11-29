import { Project, VirtualFile, FileTreeNode, CustomTemplate, PublishSettings, Site } from '../types';
import { Skill } from '../skills/types';

/**
 * Storage adapter interface
 *
 * Abstracts storage operations to support multiple backends:
 * - IndexedDB (browser mode - local storage)
 * - PostgreSQL (Server mode - server persistence)
 *
 * Note: Checkpoints and conversations are NOT part of this interface.
 * They remain browser-only in IndexedDB regardless of mode.
 */
export interface StorageAdapter {
  /**
   * Initialize the storage adapter
   * Sets up database connections, runs migrations, etc.
   */
  init(): Promise<void>;

  /**
   * Close the storage adapter
   * Cleanup resources, close connections
   */
  close?(): Promise<void>;

  // ============================================
  // Projects
  // ============================================

  createProject(project: Project): Promise<void>;
  getProject(id: string): Promise<Project | null>;
  updateProject(project: Project): Promise<void>;
  deleteProject(id: string): Promise<void>;
  listProjects(fields?: string[]): Promise<Project[]>;
  updateProjectPublishSettings?(projectId: string, settings: PublishSettings): Promise<void>;

  // ============================================
  // Files
  // ============================================

  createFile(file: VirtualFile): Promise<void>;
  getFile(projectId: string, path: string): Promise<VirtualFile | null>;
  updateFile(file: VirtualFile): Promise<void>;
  deleteFile(projectId: string, path: string): Promise<void>;
  listFiles(projectId: string): Promise<VirtualFile[]>;
  deleteProjectFiles(projectId: string): Promise<void>;

  // ============================================
  // File Tree
  // ============================================

  createTreeNode(node: FileTreeNode): Promise<void>;
  getTreeNode(projectId: string, path: string): Promise<FileTreeNode | null>;
  updateTreeNode(node: FileTreeNode): Promise<void>;
  deleteTreeNode(projectId: string, path: string): Promise<void>;
  getChildNodes(projectId: string, parentPath: string | null): Promise<FileTreeNode[]>;
  getAllTreeNodes(projectId: string): Promise<FileTreeNode[]>;

  // ============================================
  // Custom Templates
  // ============================================

  saveCustomTemplate(template: CustomTemplate): Promise<void>;
  getCustomTemplate(id: string): Promise<CustomTemplate | null>;
  getAllCustomTemplates(): Promise<CustomTemplate[]>;
  deleteCustomTemplate(id: string): Promise<void>;

  // ============================================
  // Custom Skills
  // ============================================

  createSkill(skill: Omit<Skill, 'isBuiltIn'>): Promise<void>;
  getSkill(id: string): Promise<Skill | null>;
  updateSkill(skill: Omit<Skill, 'isBuiltIn'>): Promise<void>;
  deleteSkill(id: string): Promise<void>;
  getAllSkills(): Promise<Skill[]>;

  // ============================================
  // Sites (Server Mode Only)
  // ============================================

  createSite?(site: Site): Promise<void>;
  getSite?(siteId: string): Promise<Site | null>;
  listSites?(): Promise<Site[]>;
  listSitesByProject?(projectId: string): Promise<Site[]>;
  updateSite?(site: Site): Promise<void>;
  deleteSite?(siteId: string): Promise<void>;
}
