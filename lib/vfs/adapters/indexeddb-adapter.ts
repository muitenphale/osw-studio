/**
 * IndexedDB Storage Adapter
 *
 * Wraps the existing IndexedDB implementation to conform to StorageAdapter interface.
 * Used in both browser mode (only storage) and Server mode (working storage).
 */

import { Project, VirtualFile, FileTreeNode, CustomTemplate } from '../types';
import { Skill } from '../skills/types';
import { StorageAdapter } from './types';

const DB_NAME = 'osw-studio-db';
const DB_VERSION = 4; // Incremented to add skills store

export class IndexedDBAdapter implements StorageAdapter {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    // Re-init if the connection was lost (e.g., close() called, HMR, or browser eviction)
    if (this.initPromise && this.db) return this.initPromise;
    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // VFS object stores
        if (!db.objectStoreNames.contains('projects')) {
          const projectStore = db.createObjectStore('projects', { keyPath: 'id' });
          projectStore.createIndex('name', 'name', { unique: false });
          projectStore.createIndex('createdAt', 'createdAt', { unique: false });
        }

        if (!db.objectStoreNames.contains('files')) {
          const fileStore = db.createObjectStore('files', { keyPath: 'id' });
          fileStore.createIndex('projectId', 'projectId', { unique: false });
          fileStore.createIndex('path', ['projectId', 'path'], { unique: true });
          fileStore.createIndex('type', 'type', { unique: false });
        }

        if (!db.objectStoreNames.contains('fileTree')) {
          const treeStore = db.createObjectStore('fileTree', { keyPath: 'id' });
          treeStore.createIndex('projectId', 'projectId', { unique: false });
          treeStore.createIndex('path', ['projectId', 'path'], { unique: true });
          treeStore.createIndex('parentPath', ['projectId', 'parentPath'], { unique: false });
        }

        // Conversations object store (browser-only, not part of adapter interface)
        if (!db.objectStoreNames.contains('conversations')) {
          const conversationStore = db.createObjectStore('conversations', { keyPath: 'id' });
          conversationStore.createIndex('projectId', 'projectId', { unique: false });
          conversationStore.createIndex('lastUpdated', 'lastUpdated', { unique: false });
        }

        // Checkpoints object store (browser-only, not part of adapter interface)
        if (!db.objectStoreNames.contains('checkpoints')) {
          const checkpointStore = db.createObjectStore('checkpoints', { keyPath: 'id' });
          checkpointStore.createIndex('projectId', 'projectId', { unique: false });
          checkpointStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // Custom Templates object store
        if (!db.objectStoreNames.contains('customTemplates')) {
          const templateStore = db.createObjectStore('customTemplates', { keyPath: 'id' });
          templateStore.createIndex('name', 'name', { unique: false });
          templateStore.createIndex('importedAt', 'importedAt', { unique: false });
        }

        // Custom Skills object store (migrated from localStorage)
        if (!db.objectStoreNames.contains('skills')) {
          const skillsStore = db.createObjectStore('skills', { keyPath: 'id' });
          skillsStore.createIndex('name', 'name', { unique: false });
          skillsStore.createIndex('isBuiltIn', 'isBuiltIn', { unique: false });
        }

        // Debug Events object store
        if (!db.objectStoreNames.contains('debugEvents')) {
          const debugEventsStore = db.createObjectStore('debugEvents', { keyPath: 'id' });
          debugEventsStore.createIndex('projectId', 'projectId', { unique: false });
          debugEventsStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });
    return this.initPromise;
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  private getDB(): IDBDatabase {
    if (!this.db) {
      throw new Error('IndexedDB not initialized. Call init() first.');
    }
    return this.db;
  }

  /**
   * Public getter for shared database access (used by checkpoint and conversation managers)
   * This is NOT part of the StorageAdapter interface but needed for legacy compatibility
   */
  getDatabase(): IDBDatabase {
    return this.getDB();
  }

  // ============================================
  // Projects
  // ============================================

  async createProject(project: Project): Promise<void> {
    const tx = this.getDB().transaction(['projects'], 'readwrite');
    const store = tx.objectStore('projects');
    await this.promisify(store.add(project));
  }

  async getProject(id: string): Promise<Project | null> {
    const tx = this.getDB().transaction(['projects'], 'readonly');
    const store = tx.objectStore('projects');
    const result = await this.promisify(store.get(id));
    return result ? this.hydrateProject(result as Project) : null;
  }

  async updateProject(project: Project): Promise<void> {
    const tx = this.getDB().transaction(['projects'], 'readwrite');
    const store = tx.objectStore('projects');
    await this.promisify(store.put(project));
  }

  async deleteProject(id: string): Promise<void> {
    const db = this.getDB();

    // Delete all associated files first
    await this.deleteProjectFiles(id);

    const tx = db.transaction(['projects'], 'readwrite');
    const store = tx.objectStore('projects');
    await this.promisify(store.delete(id));
  }

  async listProjects(fields?: string[]): Promise<Project[]> {
    const tx = this.getDB().transaction(['projects'], 'readonly');
    const store = tx.objectStore('projects');
    const result = await this.promisify(store.getAll());
    const projects = (result as Project[] | undefined)?.map((project) => this.hydrateProject(project)) || [];

    // If specific fields requested, filter them (client-side for IndexedDB)
    if (fields && fields.length > 0) {
      return projects.map(project => {
        const filtered: any = {};
        fields.forEach(field => {
          if (field in project) {
            filtered[field] = project[field as keyof typeof project];
          }
        });
        return filtered;
      });
    }

    return projects;
  }

  // ============================================
  // Files
  // ============================================

  async createFile(file: VirtualFile): Promise<void> {
    const tx = this.getDB().transaction(['files'], 'readwrite');
    const store = tx.objectStore('files');
    await this.promisify(store.add(file));
  }

  async getFile(projectId: string, path: string): Promise<VirtualFile | null> {
    const tx = this.getDB().transaction(['files'], 'readonly');
    const store = tx.objectStore('files');
    const index = store.index('path');
    const result = await this.promisify(index.get([projectId, path]));
    return result || null;
  }

  async updateFile(file: VirtualFile): Promise<void> {
    const tx = this.getDB().transaction(['files'], 'readwrite');
    const store = tx.objectStore('files');
    await this.promisify(store.put(file));
  }

  async deleteFile(projectId: string, path: string): Promise<void> {
    const file = await this.getFile(projectId, path);
    if (file) {
      const tx = this.getDB().transaction(['files'], 'readwrite');
      const store = tx.objectStore('files');
      await this.promisify(store.delete(file.id));
    }
  }

  async listFiles(projectId: string): Promise<VirtualFile[]> {
    const tx = this.getDB().transaction(['files'], 'readonly');
    const store = tx.objectStore('files');
    const index = store.index('projectId');
    const result = await this.promisify(index.getAll(projectId));
    return result || [];
  }

  async deleteProjectFiles(projectId: string): Promise<void> {
    const files = await this.listFiles(projectId);
    const tx = this.getDB().transaction(['files'], 'readwrite');
    const store = tx.objectStore('files');

    for (const file of files) {
      await this.promisify(store.delete(file.id));
    }
  }

  // ============================================
  // File Tree
  // ============================================

  async createTreeNode(node: FileTreeNode): Promise<void> {
    const tx = this.getDB().transaction(['fileTree'], 'readwrite');
    const store = tx.objectStore('fileTree');
    await this.promisify(store.add(node));
  }

  async getTreeNode(projectId: string, path: string): Promise<FileTreeNode | null> {
    const tx = this.getDB().transaction(['fileTree'], 'readonly');
    const store = tx.objectStore('fileTree');
    const index = store.index('path');
    const result = await this.promisify(index.get([projectId, path]));
    return result || null;
  }

  async updateTreeNode(node: FileTreeNode): Promise<void> {
    const tx = this.getDB().transaction(['fileTree'], 'readwrite');
    const store = tx.objectStore('fileTree');
    await this.promisify(store.put(node));
  }

  async deleteTreeNode(projectId: string, path: string): Promise<void> {
    const node = await this.getTreeNode(projectId, path);
    if (node) {
      const tx = this.getDB().transaction(['fileTree'], 'readwrite');
      const store = tx.objectStore('fileTree');
      await this.promisify(store.delete(node.id));
    }
  }

  async getChildNodes(projectId: string, parentPath: string | null): Promise<FileTreeNode[]> {
    const tx = this.getDB().transaction(['fileTree'], 'readonly');
    const store = tx.objectStore('fileTree');
    const index = store.index('parentPath');
    const key = parentPath === null ? [projectId] : [projectId, parentPath];
    const result = await this.promisify(index.getAll(key));
    return result || [];
  }

  async getAllTreeNodes(projectId: string): Promise<FileTreeNode[]> {
    const tx = this.getDB().transaction(['fileTree'], 'readonly');
    const store = tx.objectStore('fileTree');
    const index = store.index('projectId');
    const result = await this.promisify(index.getAll(projectId));
    return result || [];
  }

  // ============================================
  // Custom Templates
  // ============================================

  async saveCustomTemplate(template: CustomTemplate): Promise<void> {
    const tx = this.getDB().transaction(['customTemplates'], 'readwrite');
    const store = tx.objectStore('customTemplates');
    await this.promisify(store.put(template));
  }

  async getCustomTemplate(id: string): Promise<CustomTemplate | null> {
    const tx = this.getDB().transaction(['customTemplates'], 'readonly');
    const store = tx.objectStore('customTemplates');
    const result = await this.promisify(store.get(id));
    return result ? this.hydrateCustomTemplate(result as CustomTemplate) : null;
  }

  async getAllCustomTemplates(): Promise<CustomTemplate[]> {
    const tx = this.getDB().transaction(['customTemplates'], 'readonly');
    const store = tx.objectStore('customTemplates');
    const results = await this.promisify(store.getAll());
    return results.map(t => this.hydrateCustomTemplate(t as CustomTemplate));
  }

  async deleteCustomTemplate(id: string): Promise<void> {
    const tx = this.getDB().transaction(['customTemplates'], 'readwrite');
    const store = tx.objectStore('customTemplates');
    await this.promisify(store.delete(id));
  }

  // ============================================
  // Custom Skills
  // ============================================

  async createSkill(skill: Omit<Skill, 'isBuiltIn'>): Promise<void> {
    const tx = this.getDB().transaction(['skills'], 'readwrite');
    const store = tx.objectStore('skills');
    const skillToStore: Skill = { ...skill, isBuiltIn: false };
    await this.promisify(store.add(skillToStore));
  }

  async getSkill(id: string): Promise<Skill | null> {
    const tx = this.getDB().transaction(['skills'], 'readonly');
    const store = tx.objectStore('skills');
    const result = await this.promisify(store.get(id));
    return result ? this.hydrateSkill(result as Skill) : null;
  }

  async updateSkill(skill: Omit<Skill, 'isBuiltIn'>): Promise<void> {
    const tx = this.getDB().transaction(['skills'], 'readwrite');
    const store = tx.objectStore('skills');
    const skillToStore: Skill = { ...skill, isBuiltIn: false };
    await this.promisify(store.put(skillToStore));
  }

  async deleteSkill(id: string): Promise<void> {
    const tx = this.getDB().transaction(['skills'], 'readwrite');
    const store = tx.objectStore('skills');
    await this.promisify(store.delete(id));
  }

  async getAllSkills(): Promise<Skill[]> {
    const tx = this.getDB().transaction(['skills'], 'readonly');
    const store = tx.objectStore('skills');
    const result = await this.promisify(store.getAll());
    // Filter to only custom skills (isBuiltIn: false)
    const customSkills = result.filter((s: Skill) => !s.isBuiltIn);
    return customSkills.map(s => this.hydrateSkill(s as Skill));
  }

  // ============================================
  // Helper Methods
  // ============================================

  private promisify<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  private hydrateProject(project: Project): Project {
    return {
      ...project,
      createdAt: project.createdAt ? new Date(project.createdAt) : new Date(),
      updatedAt: project.updatedAt ? new Date(project.updatedAt) : new Date(),
      lastSavedAt: project.lastSavedAt ? new Date(project.lastSavedAt) : null
    };
  }

  private hydrateCustomTemplate(template: CustomTemplate): CustomTemplate {
    return {
      ...template,
      importedAt: template.importedAt ? new Date(template.importedAt) : new Date()
    };
  }

  private hydrateSkill(skill: Skill): Skill {
    return {
      ...skill,
      createdAt: skill.createdAt ? new Date(skill.createdAt) : new Date(),
      updatedAt: skill.updatedAt ? new Date(skill.updatedAt) : new Date()
    };
  }
}
