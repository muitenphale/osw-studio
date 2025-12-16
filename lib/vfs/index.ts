import { v4 as uuidv4 } from 'uuid';
import JSZip from 'jszip';
import { logger } from '@/lib/utils';
import {
  Project,
  VirtualFile,
  FileTreeNode,
  getFileTypeFromPath,
  getSpecificMimeType,
  FILE_SIZE_LIMITS,
  isFileSupported,
  PatchOperation
} from './types';
import { saveManager } from './save-manager';
import { VirtualServer } from '@/lib/preview/virtual-server';
import { skillsService } from './skills';
import { StorageAdapter } from './adapters/types';
import { createClientAdapter } from './adapters/factory';
import { IndexedDBAdapter } from './adapters/indexeddb-adapter';

export class VirtualFileSystem {
  private adapter: StorageAdapter;
  private initialized = false;
  private transientFiles: Map<string, VirtualFile> = new Map();
  private syncTimeouts: Map<string, NodeJS.Timeout> = new Map(); // Debounce sync calls

  constructor() {
    this.adapter = createClientAdapter();
  }

  async init(): Promise<void> {
    if (!this.initialized) {
      await this.adapter.init();
      await this.mountTransientSkills();
      this.initialized = true;
    }
  }

  /**
   * Get direct database access for checkpoint and conversation managers
   * Only works with IndexedDBAdapter
   */
  getDatabase(): IDBDatabase {
    if (!(this.adapter instanceof IndexedDBAdapter)) {
      throw new Error('Direct database access only available with IndexedDBAdapter');
    }
    return this.adapter.getDatabase();
  }

  /**
   * Mount skills as transient files at /.skills/
   */
  private async mountTransientSkills(): Promise<void> {
    try {
      const skills = await skillsService.getEnabledSkills();

      for (const skill of skills) {
        const path = `/.skills/${skill.id}.md`;
        const transientFile: VirtualFile = {
          id: `transient-skill-${skill.id}`,
          projectId: 'transient', // Not associated with any project
          path,
          name: `${skill.id}.md`,
          type: 'text',
          content: skill.content,
          mimeType: 'text/markdown',
          size: new Blob([skill.content]).size,
          createdAt: skill.createdAt,
          updatedAt: skill.updatedAt,
          metadata: {
            isTransient: true,
            isBuiltIn: skill.isBuiltIn
          }
        };

        this.transientFiles.set(path, transientFile);
      }

      logger.info(`[VFS] Mounted ${this.transientFiles.size} transient skill files`);
    } catch (error) {
      logger.error('[VFS] Failed to mount transient skills', error);
    }
  }

  /**
   * Check if a path is transient (starts with /.)
   */
  private isTransientPath(path: string): boolean {
    return path.startsWith('/.');
  }

  /**
   * Reload transient skills (call after adding/updating/deleting skills)
   */
  async reloadTransientSkills(): Promise<void> {
    this.transientFiles.clear();
    await this.mountTransientSkills();

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('filesChanged'));
    }
  }

  private ensureInitialized() {
    if (!this.initialized) {
      throw new Error('VirtualFileSystem not initialized. Call init() first.');
    }
  }

  /**
   * Trigger auto-sync in background (debounced)
   * Only runs in Server Mode and in browser environment
   */
  private triggerAutoSync(projectId: string) {
    // Only sync in browser and Server Mode
    if (typeof window === 'undefined' || process.env.NEXT_PUBLIC_SERVER_MODE !== 'true') {
      return;
    }

    // Clear existing timeout for this project (debounce)
    const existingTimeout = this.syncTimeouts.get(projectId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Schedule sync after 2 seconds of inactivity
    const timeout = setTimeout(async () => {
      try {
        const { autoSyncProject } = await import('./auto-sync');
        await autoSyncProject(projectId);
      } catch (error) {
        logger.error(`[VFS] Auto-sync failed for project ${projectId}:`, error);
      } finally {
        this.syncTimeouts.delete(projectId);
      }
    }, 2000);

    this.syncTimeouts.set(projectId, timeout);
  }

  /**
   * Clear any pending sync timeout for a project
   * Called when leaving a project to prevent stale timeout references
   */
  clearSyncTimeout(projectId: string): void {
    const timeout = this.syncTimeouts.get(projectId);
    if (timeout) {
      clearTimeout(timeout);
      this.syncTimeouts.delete(projectId);
      logger.debug(`[VFS] Cleared sync timeout for project ${projectId}`);
    }
  }

  async createFile(projectId: string, path: string, content: string | ArrayBuffer): Promise<VirtualFile> {
    this.ensureInitialized();
    
    try {
      // Clean path of any trailing newlines or escape sequences
      const cleanPath = path.replace(/\\n$|\\r$|\n$|\r$/, '').trim();
      path = cleanPath;
      
      const existing = await this.adapter.getFile(projectId, path);
      if (existing) {
        logger.error('VFS: File already exists', { projectId, path });
        throw new Error(`File already exists: ${path}`);
      }

      if (!isFileSupported(path)) {
        throw new Error(`Unsupported file type: ${path}`);
      }

      const type = getFileTypeFromPath(path);

      const size = content instanceof ArrayBuffer ? content.byteLength : new Blob([content]).size;
      const sizeLimit = FILE_SIZE_LIMITS[type];
      if (size > sizeLimit) {
        throw new Error(`File too large. Maximum size for ${type} files is ${Math.round(sizeLimit / 1024 / 1024)}MB`);
      }

      const file: VirtualFile = {
        id: uuidv4(),
        projectId,
        path,
        name: path.split('/').pop() || '',
        type,
        content,
        mimeType: getSpecificMimeType(path),
        size,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {
          isEntry: path === '/index.html'
        }
      };

      await this.adapter.createFile(file);

      await this.updateFileTree(projectId, path, 'create');
      saveManager.markDirty(projectId);

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('filesChanged'));
      }

      return file;
    } catch (error) {
      throw error;
    }
  }

  async readFile(projectId: string, path: string): Promise<VirtualFile> {
    this.ensureInitialized();

    // Validate inputs
    if (!projectId || typeof projectId !== 'string') {
      logger.error('VFS: Invalid projectId for readFile', { projectId, path });
      throw new Error('Invalid projectId provided');
    }

    if (!path || typeof path !== 'string') {
      logger.error('VFS: Invalid path for readFile', { projectId, path });
      throw new Error('Invalid file path provided');
    }

    // Clean path of any trailing newlines or escape sequences
    const cleanPath = path.replace(/\\n$|\\r$|\n$|\r$/, '').trim();

    if (!cleanPath) {
      logger.error('VFS: Empty path after cleaning for readFile', { projectId, originalPath: path, cleanPath });
      throw new Error('Empty file path after cleaning');
    }

    // Check transient files first (for /.skills/, /.agents/, etc.)
    if (this.isTransientPath(cleanPath)) {
      const transientFile = this.transientFiles.get(cleanPath);
      if (transientFile) {
        return transientFile;
      }
      throw new Error(`Transient file not found: ${cleanPath}`);
    }

    const file = await this.adapter.getFile(projectId, cleanPath);
    if (!file) {
      logger.error('VFS: File not found for read', { projectId, path: cleanPath, originalPath: path });
      throw new Error(`File not found: ${cleanPath}`);
    }

    return file;
  }

  async fileExists(projectId: string, path: string): Promise<boolean> {
    this.ensureInitialized();

    try {
      // Check transient files first
      if (this.isTransientPath(path)) {
        return this.transientFiles.has(path);
      }

      const file = await this.adapter.getFile(projectId, path);
      return !!file;
    } catch {
      return false;
    }
  }

  async updateFile(projectId: string, path: string, content: string | ArrayBuffer): Promise<VirtualFile> {
    this.ensureInitialized();
    
    try {
      // Clean and validate path before database operation
      const cleanPath = path.replace(/\\n$|\\r$|\n$|\r$/, '').trim();
      if (cleanPath.includes('\n') || cleanPath.includes('@@') || cleanPath.includes('\\n') || cleanPath.length > 200) {
        logger.error('VFS: Invalid path detected', { projectId, path: path.slice(0, 100) + '...' });
        throw new Error(`Invalid file path: ${path.slice(0, 50)}...`);
      }
      
      // Use cleaned path for lookup
      path = cleanPath;
      
      const file = await this.adapter.getFile(projectId, path);
      if (!file) {
        logger.error('VFS: File not found for update', { projectId, path });
        throw new Error(`File not found: ${path}`);
      }

      file.content = content;
      file.size = content instanceof ArrayBuffer ? content.byteLength : new Blob([content]).size;
      file.updatedAt = new Date();

      await this.adapter.updateFile(file);
      saveManager.markDirty(projectId);

      if (typeof window !== 'undefined') {
        const detail = { projectId, path };
        window.dispatchEvent(new CustomEvent('fileContentChanged', { detail }));
        window.dispatchEvent(new Event('filesChanged'));
      }

      return file;
    } catch (error) {
      throw error;
    }
  }

  async patchFile(projectId: string, path: string, patches: PatchOperation[]): Promise<VirtualFile> {
    this.ensureInitialized();
    
    const file = await this.readFile(projectId, path);
    let content = file.content as string;
    
    for (const patch of patches) {
      if (!content.includes(patch.search)) {
        logger.error('VFS: Pattern not found in file', {
          path,
          searchPattern: patch.search.substring(0, 100),
          contentSnippet: content.substring(0, 300)
        });
        throw new Error(`Pattern not found in file: ${patch.search.substring(0, 50)}...`);
      }
      content = content.replace(patch.search, patch.replace);
    }
    
    return await this.updateFile(projectId, path, content);
  }

  async deleteFile(projectId: string, path: string): Promise<void> {
    this.ensureInitialized();

    try {
      await this.adapter.deleteFile(projectId, path);
      await this.updateFileTree(projectId, path, 'delete');
      saveManager.markDirty(projectId);
    } catch (error) {
      throw error;
    }
  }

  async renameFile(projectId: string, oldPath: string, newPath: string): Promise<VirtualFile> {
    this.ensureInitialized();
    
    const file = await this.readFile(projectId, oldPath);
    await this.deleteFile(projectId, oldPath);
    return await this.createFile(projectId, newPath, file.content as string);
  }

  async createDirectory(projectId: string, path: string): Promise<void> {
    this.ensureInitialized();
    
    const existing = await this.adapter.getTreeNode(projectId, path);
    if (existing) {
      return;
    }
    
    const name = path.split('/').pop() || path;
    const node: FileTreeNode = {
      id: uuidv4(),
      projectId,
      path,
      name,
      type: 'directory',
      parentPath: this.getParentPath(path),
      children: []
    };

      await this.adapter.createTreeNode(node);
      saveManager.markDirty(projectId);
      
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('filesChanged'));
      }
  }

  async listDirectory(projectId: string, path: string, options?: { includeTransient?: boolean }): Promise<VirtualFile[]> {
    this.ensureInitialized();

    const allFiles = await this.adapter.listFiles(projectId);

    let files: VirtualFile[];
    if (path === '/') {
      files = allFiles;
    } else {
      files = allFiles.filter(file => {
        const filePath = file.path;
        const dirPath = path.endsWith('/') ? path : path + '/';
        return filePath.startsWith(dirPath) &&
               filePath.slice(dirPath.length).indexOf('/') === -1;
      });
    }

    // Include transient files if requested
    if (options?.includeTransient) {
      const transientFilesArray = Array.from(this.transientFiles.values());

      if (path === '/') {
        // Root: include all transient files
        files = [...files, ...transientFilesArray];
      } else {
        // Subdirectory: filter transient files by path
        const dirPath = path.endsWith('/') ? path : path + '/';
        const matchingTransient = transientFilesArray.filter(file => {
          return file.path.startsWith(dirPath) &&
                 file.path.slice(dirPath.length).indexOf('/') === -1;
        });
        files = [...files, ...matchingTransient];
      }
    }

    return files;
  }

  async getAllFilesAndDirectories(projectId: string, options?: { includeTransient?: boolean }): Promise<Array<VirtualFile | { path: string; name: string; type: 'directory' }>> {
    this.ensureInitialized();

    const allFiles = await this.adapter.listFiles(projectId);

    const treeNodes = await this.adapter.getAllTreeNodes(projectId);

    const directories = treeNodes
      .filter(node => node.type === 'directory')
      .map(node => ({
        path: node.path,
        name: node.path.split('/').filter(Boolean).pop() || node.path,
        type: 'directory' as const
      }));

    let result: Array<VirtualFile | { path: string; name: string; type: 'directory' }> = [...allFiles, ...directories];

    // Include transient files if requested
    if (options?.includeTransient) {
      const transientFilesArray = Array.from(this.transientFiles.values());
      result = [...result, ...transientFilesArray];
    }

    return result;
  }

  async deleteDirectory(projectId: string, path: string): Promise<void> {
    this.ensureInitialized();
    
    const allFiles = await this.adapter.listFiles(projectId);
    const dirPath = path.endsWith('/') ? path : path + '/';
    
    for (const file of allFiles) {
      if (file.path.startsWith(dirPath)) {
        await this.deleteFile(projectId, file.path);
      }
    }
    
    await this.adapter.deleteTreeNode(projectId, path);
    saveManager.markDirty(projectId);
    
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('filesChanged'));
    }
  }

  async renameDirectory(projectId: string, oldPath: string, newPath: string): Promise<void> {
    this.ensureInitialized();
    
    const oldNode = await this.adapter.getTreeNode(projectId, oldPath);
    if (oldNode) {
      await this.adapter.deleteTreeNode(projectId, oldPath);
      
      const newNode: FileTreeNode = {
        id: uuidv4(),
        projectId,
        path: newPath,
        name: newPath.split('/').pop() || newPath,
        type: 'directory',
        parentPath: this.getParentPath(newPath),
        children: oldNode.children
      };
      await this.adapter.createTreeNode(newNode);
      saveManager.markDirty(projectId);
    }
    
    const oldDirPath = oldPath.endsWith('/') ? oldPath : oldPath + '/';
    const newDirPath = newPath.endsWith('/') ? newPath : newPath + '/';
    
    const allFiles = await this.adapter.listFiles(projectId);
    const filesToMove = allFiles.filter(file => file.path.startsWith(oldDirPath));
    
    for (const file of filesToMove) {
      const relativePath = file.path.substring(oldDirPath.length);
      const newFilePath = newDirPath + relativePath;
      await this.renameFile(projectId, file.path, newFilePath);
    }
    
    const allTreeNodes = await this.adapter.getAllTreeNodes(projectId);
    const subdirNodes = allTreeNodes.filter(node => 
      node.type === 'directory' && 
      node.path.startsWith(oldDirPath) &&
      node.path !== oldPath
    );
    
    for (const node of subdirNodes) {
      const relativePath = node.path.substring(oldDirPath.length);
      const newSubdirPath = newDirPath + relativePath;
      
      await this.adapter.deleteTreeNode(projectId, node.path);
      const newNode: FileTreeNode = {
        id: uuidv4(),
        projectId,
        path: newSubdirPath,
        name: newSubdirPath.split('/').pop() || newSubdirPath,
        type: 'directory',
        parentPath: this.getParentPath(newSubdirPath),
        children: node.children
      };
      await this.adapter.createTreeNode(newNode);
    }
    
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('filesChanged'));
    }
  }

  async moveFile(projectId: string, oldPath: string, newPath: string): Promise<VirtualFile> {
    this.ensureInitialized();
    
    const existing = await this.adapter.getFile(projectId, newPath);
    if (existing) {
      throw new Error(`File already exists at destination: ${newPath}`);
    }
    
    const file = await this.readFile(projectId, oldPath);
    
    const movedFile = await this.createFile(projectId, newPath, file.content);
    
    await this.deleteFile(projectId, oldPath);
    
    return movedFile;
  }

  async moveDirectory(projectId: string, oldPath: string, newPath: string): Promise<void> {
    this.ensureInitialized();
    
    const normalizedNew = newPath.endsWith('/') ? newPath : newPath + '/';
    const normalizedOld = oldPath.endsWith('/') ? oldPath : oldPath + '/';
    
    if (normalizedNew.startsWith(normalizedOld)) {
      throw new Error('Cannot move a directory into itself');
    }
    
    await this.renameDirectory(projectId, oldPath, newPath);
    
    
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('filesChanged'));
    }
  }

  async createProject(name: string, description?: string): Promise<Project> {
    this.ensureInitialized();
    
    try {
      const project: Project = {
        id: uuidv4(),
        name,
        description,
        createdAt: new Date(),
        updatedAt: new Date(),
        settings: {},
        lastSavedCheckpointId: null,
        lastSavedAt: null,
        costTracking: {
          totalCost: 0,
          providerBreakdown: {},
          sessionHistory: []
        }
      };

      await this.adapter.createProject(project);
      
      const rootNode: FileTreeNode = {
        id: uuidv4(),
        projectId: project.id,
        path: '/',
        name: '/',
        type: 'directory',
        parentPath: null,
        children: []
      };
      
      await this.adapter.createTreeNode(rootNode);
      
      return project;
    } catch (error) {
      throw error;
    }
  }

  async getProject(id: string): Promise<Project> {
    this.ensureInitialized();
    
    const project = await this.adapter.getProject(id);
    if (!project) {
      throw new Error(`Project not found: ${id}`);
    }
    
    return project;
  }

  async updateProject(project: Project, skipSync = false): Promise<void> {
    this.ensureInitialized();

    project.updatedAt = new Date();
    await this.adapter.updateProject(project);

    // Note: skipSync parameter kept for backward compatibility but no longer used
    // Auto-sync is now only triggered explicitly from saveManager.save()
  }

  async updateProjectCost(
    projectId: string, 
    usage: { 
      cost: number; 
      provider: string; 
      tokenUsage?: { input: number; output: number };
      sessionId?: string;
      mode?: 'absolute' | 'delta';
    }
  ): Promise<void> {
    this.ensureInitialized();

    const project = await this.getProject(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    if (!project.costTracking) {
      project.costTracking = {
        totalCost: 0,
        providerBreakdown: {},
        sessionHistory: []
      };
    }

    project.costTracking.totalCost += usage.cost;

    if (!project.costTracking.providerBreakdown[usage.provider]) {
      project.costTracking.providerBreakdown[usage.provider] = {
        totalCost: 0,
        tokenUsage: { input: 0, output: 0 },
        requestCount: 0,
        lastUpdated: new Date()
      };
    }

    const providerStats = project.costTracking.providerBreakdown[usage.provider];
    providerStats.totalCost += usage.cost;
    if (usage.mode !== 'delta') {
      providerStats.requestCount += 1;
    }
    providerStats.lastUpdated = new Date();

    if (usage.tokenUsage) {
      providerStats.tokenUsage.input += usage.tokenUsage.input;
      providerStats.tokenUsage.output += usage.tokenUsage.output;
    }

    if (usage.sessionId && usage.mode !== 'delta') {
      if (!project.costTracking.sessionHistory) {
        project.costTracking.sessionHistory = [];
      }
      
      project.costTracking.sessionHistory.push({
        sessionId: usage.sessionId,
        cost: usage.cost,
        provider: usage.provider,
        timestamp: new Date(),
        tokenUsage: usage.tokenUsage
      });

      if (project.costTracking.sessionHistory.length > 100) {
        project.costTracking.sessionHistory = project.costTracking.sessionHistory.slice(-100);
      }
    }

    await this.updateProject(project);
  }

  async applyProjectCostDelta(
    projectId: string,
    usage: {
      costDelta: number;
      provider: string;
      tokenUsageDelta?: { input: number; output: number };
      sessionId?: string;
    }
  ): Promise<void> {
    this.ensureInitialized();

    const project = await this.getProject(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    if (!project.costTracking) {
      project.costTracking = {
        totalCost: 0,
        providerBreakdown: {},
        sessionHistory: []
      };
    }

    project.costTracking.totalCost += usage.costDelta;

    if (!project.costTracking.providerBreakdown[usage.provider]) {
      project.costTracking.providerBreakdown[usage.provider] = {
        totalCost: 0,
        tokenUsage: { input: 0, output: 0 },
        requestCount: 0,
        lastUpdated: new Date()
      };
    }

    const providerStats = project.costTracking.providerBreakdown[usage.provider];
    providerStats.totalCost += usage.costDelta;
    providerStats.lastUpdated = new Date();

    if (usage.tokenUsageDelta) {
      providerStats.tokenUsage.input += usage.tokenUsageDelta.input;
      providerStats.tokenUsage.output += usage.tokenUsageDelta.output;
    }

    if (usage.sessionId) {
      if (!project.costTracking.sessionHistory) {
        project.costTracking.sessionHistory = [];
      }

      project.costTracking.sessionHistory.push({
        sessionId: usage.sessionId,
        cost: usage.costDelta,
        provider: usage.provider,
        timestamp: new Date(),
        tokenUsage: usage.tokenUsageDelta,
        correction: true
      });

      if (project.costTracking.sessionHistory.length > 100) {
        project.costTracking.sessionHistory = project.costTracking.sessionHistory.slice(-100);
      }
    }

    await this.updateProject(project);
  }

  async deleteProject(id: string): Promise<void> {
    this.ensureInitialized();
    
    await this.adapter.deleteProject(id);
  }

  async listProjects(): Promise<Project[]> {
    this.ensureInitialized();

    return await this.adapter.listProjects();
  }

  async listFiles(projectId: string): Promise<VirtualFile[]> {
    this.ensureInitialized();

    return await this.adapter.listFiles(projectId);
  }

  async getFileTree(projectId: string): Promise<FileTreeNode | null> {
    this.ensureInitialized();
    
    return await this.adapter.getTreeNode(projectId, '/');
  }

  async searchFiles(
    projectId: string, 
    query: string,
    options?: {
      regex?: boolean;
      fileType?: string;
      limit?: number;
      searchIn?: 'content' | 'filename' | 'both';
    }
  ): Promise<VirtualFile[]> {
    this.ensureInitialized();
    
    const allFiles = await this.adapter.listFiles(projectId);
    const { 
      regex = false, 
      fileType, 
      limit = 20, 
      searchIn = 'both' 
    } = options || {};
    
    let filesToSearch = allFiles;
    if (fileType) {
      const extension = fileType.startsWith('.') ? fileType : `.${fileType}`;
      filesToSearch = allFiles.filter(file => file.path.endsWith(extension));
    }
    
    const searchFunction = regex 
      ? (text: string) => {
          try {
            const pattern = new RegExp(query, 'i');
            return pattern.test(text);
          } catch {
            return text.toLowerCase().includes(query.toLowerCase());
          }
        }
      : (text: string) => text.toLowerCase().includes(query.toLowerCase());
    
    const results = filesToSearch.filter(file => {
      if (searchIn === 'filename') {
        return searchFunction(file.name) || searchFunction(file.path);
      } else if (searchIn === 'content') {
        return typeof file.content === 'string' && searchFunction(file.content);
      } else {
        return searchFunction(file.name) || 
               searchFunction(file.path) ||
               (typeof file.content === 'string' && searchFunction(file.content));
      }
    });
    
    return results.slice(0, limit);
  }

  async findReferences(
    projectId: string,
    identifier: string,
    type: 'class' | 'id' | 'function' | 'variable' | 'any' = 'any'
  ): Promise<Array<{ file: VirtualFile; matches: Array<{ line: number; text: string }> }>> {
    this.ensureInitialized();
    
    const allFiles = await this.adapter.listFiles(projectId);
    const results: Array<{ file: VirtualFile; matches: Array<{ line: number; text: string }> }> = [];
    
    const patterns: RegExp[] = [];
    
    switch (type) {
      case 'class':
        patterns.push(new RegExp(`class=["'][^"']*\\b${identifier}\\b[^"']*["']`, 'gi'));
        patterns.push(new RegExp(`\\.${identifier}\\b`, 'g'));
        patterns.push(new RegExp(`classList\\.(add|remove|toggle|contains)\\(['"\`]${identifier}['"\`]`, 'g'));
        break;
      
      case 'id':
        patterns.push(new RegExp(`id=["']${identifier}["']`, 'gi'));
        patterns.push(new RegExp(`#${identifier}\\b`, 'g'));
        patterns.push(new RegExp(`getElementById\\(['"\`]${identifier}['"\`]`, 'g'));
        patterns.push(new RegExp(`querySelector\\(['"\`]#${identifier}['"\`]`, 'g'));
        break;
      
      case 'function':
        patterns.push(new RegExp(`function\\s+${identifier}\\s*\\(`, 'g'));
        patterns.push(new RegExp(`(?:const|let|var)\\s+${identifier}\\s*=\\s*(?:\\([^)]*\\)|[^=])\\s*=>`, 'g'));
        patterns.push(new RegExp(`${identifier}\\s*\\(`, 'g'));
        break;
      
      case 'variable':
        patterns.push(new RegExp(`(?:const|let|var)\\s+${identifier}\\b`, 'g'));
        patterns.push(new RegExp(`\\b${identifier}\\b`, 'g'));
        break;
      
      case 'any':
      default:
        patterns.push(new RegExp(`\\b${identifier}\\b`, 'gi'));
        break;
    }
    
    for (const file of allFiles) {
      if (typeof file.content !== 'string') continue;
      
      const matches: Array<{ line: number; text: string }> = [];
      const lines = file.content.split('\n');
      
      lines.forEach((line, index) => {
        for (const pattern of patterns) {
          if (pattern.test(line)) {
            matches.push({
              line: index + 1,
              text: line.trim()
            });
            break;
          }
        }
      });
      
      if (matches.length > 0) {
        results.push({ file, matches });
      }
    }
    
    return results;
  }

  async getFileStats(projectId: string, path: string): Promise<{
    path: string;
    size: number;
    lines: number;
    type: string;
    preview: string[];
    lastModified: Date;
  }> {
    this.ensureInitialized();
    
    const file = await this.adapter.getFile(projectId, path);
    if (!file) {
      throw new Error(`File not found: ${path}`);
    }
    
    const content = typeof file.content === 'string' ? file.content : '';
    const lines = content.split('\n');
    
    return {
      path: file.path,
      size: file.size,
      lines: lines.length,
      type: file.type,
      preview: lines.slice(0, 10),
      lastModified: file.updatedAt
    };
  }

  async getProjectSize(projectId: string): Promise<number> {
    this.ensureInitialized();
    
    const files = await this.adapter.listFiles(projectId);
    return files.reduce((total, file) => total + file.size, 0);
  }

  async getProjectStats(projectId: string): Promise<{
    fileCount: number;
    totalSize: number;
    fileTypes: Record<string, number>;
    formattedSize: string;
  }> {
    this.ensureInitialized();
    
    const files = await this.adapter.listFiles(projectId);
    
    let totalSize = 0;
    const fileTypes: Record<string, number> = {};
    
    for (const file of files) {
      totalSize += file.size;
      
      const ext = file.path.split('.').pop()?.toUpperCase() || 'OTHER';
      fileTypes[ext] = (fileTypes[ext] || 0) + 1;
    }
    
    let formattedSize: string;
    if (totalSize < 1024) {
      formattedSize = `${totalSize} B`;
    } else if (totalSize < 1024 * 1024) {
      formattedSize = `${(totalSize / 1024).toFixed(1)} KB`;
    } else {
      formattedSize = `${(totalSize / (1024 * 1024)).toFixed(2)} MB`;
    }
    
    return {
      fileCount: files.length,
      totalSize,
      fileTypes,
      formattedSize
    };
  }

  async exportProject(projectId: string): Promise<{ project: Project; files: VirtualFile[] }> {
    this.ensureInitialized();
    
    const project = await this.getProject(projectId);
    const files = await this.adapter.listFiles(projectId);
    
    return { project, files };
  }

  async exportProjectAsZip(projectId: string): Promise<Blob> {
    this.ensureInitialized();
    
    const zip = new JSZip();
    
    try {
      // Create VirtualServer instance and compile the project through Handlebars
      const server = new VirtualServer(this, projectId);
      const compiledProject = await server.compileProject();
      
      // Add compiled files to ZIP, filtering out template-related files
      for (const file of compiledProject.files) {
        const zipPath = file.path.startsWith('/') ? file.path.slice(1) : file.path;
        
        // Skip template files, data files, and template directories
        if (this.shouldExcludeFromExport(file.path)) {
          continue;
        }
        
        if (typeof file.content === 'string') {
          zip.file(zipPath, file.content);
        } else {
          zip.file(zipPath, file.content);
        }
      }
      
      // Clean up VirtualServer resources
      server.cleanupBlobUrls();
      
    } catch (error) {
      logger.warn('Failed to compile Handlebars templates during export, falling back to raw files:', error);
      
      // Fallback to original behavior if Handlebars compilation fails
      const files = await this.adapter.listFiles(projectId);
      
      for (const file of files) {
        const zipPath = file.path.startsWith('/') ? file.path.slice(1) : file.path;
        
        // Skip template files even in fallback mode
        if (this.shouldExcludeFromExport(file.path)) {
          continue;
        }
        
        if (typeof file.content === 'string') {
          zip.file(zipPath, file.content);
        } else {
          zip.file(zipPath, file.content);
        }
      }
    }
    
    const blob = await zip.generateAsync({ 
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: {
        level: 6
      }
    });
    
    return blob;
  }

  private shouldExcludeFromExport(filePath: string): boolean {
    // Exclude template files and related development files
    if (filePath.endsWith('.hbs') || filePath.endsWith('.handlebars')) {
      return true;
    }
    
    // Exclude templates directory
    if (filePath.startsWith('/templates/')) {
      return true;
    }
    
    // Exclude data.json file (since it's compiled into HTML)
    if (filePath === '/data.json') {
      return true;
    }
    
    return false;
  }

  async duplicateProject(projectId: string): Promise<Project> {
    this.ensureInitialized();
    
    const originalProject = await this.getProject(projectId);
    const files = await this.adapter.listFiles(projectId);
    
    const newName = `${originalProject.name} (Copy)`.slice(0, 50);
    const newProject = await this.createProject(
      newName,
      originalProject.description
    );
    
    await saveManager.runWithSuppressedDirty(newProject.id, async () => {
      for (const file of files) {
        await this.createFile(newProject.id, file.path, file.content);
      }
    });

    return newProject;
  }

  async importProject(data: { project: Project; files: VirtualFile[] }): Promise<Project> {
    this.ensureInitialized();
    
    const newProject = await this.createProject(data.project.name, data.project.description);
    
    await saveManager.runWithSuppressedDirty(newProject.id, async () => {
      for (const file of data.files) {
        await this.createFile(newProject.id, file.path, file.content as string);
      }
    });

    return newProject;
  }

  private getParentPath(path: string): string | null {
    if (path === '/') return null;
    
    const parts = path.split('/').filter(Boolean);
    if (parts.length === 1) return '/';
    
    parts.pop();
    return '/' + parts.join('/');
  }

  private async updateFileTree(projectId: string, path: string, operation: 'create' | 'delete'): Promise<void> {
    const parentPath = this.getParentPath(path);
    if (parentPath === null) return;
    
    let parentNode = await this.adapter.getTreeNode(projectId, parentPath);
    
    if (!parentNode && operation === 'create') {
      await this.createDirectory(projectId, parentPath);
      parentNode = await this.adapter.getTreeNode(projectId, parentPath);
    }
    
    if (parentNode) {
      const children = parentNode.children || [];
      
      if (operation === 'create' && !children.includes(path)) {
        children.push(path);
      } else if (operation === 'delete') {
        const index = children.indexOf(path);
        if (index > -1) {
          children.splice(index, 1);
        }
      }
      
      parentNode.children = children;
      await this.adapter.updateTreeNode(parentNode);

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('filesChanged'));
      }
    }
  }
}

export const vfs = new VirtualFileSystem();

export * from './types';
