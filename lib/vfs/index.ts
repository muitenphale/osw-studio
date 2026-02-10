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
  private initPromise: Promise<void> | null = null;
  private transientFiles: Map<string, VirtualFile> = new Map();
  private syncTimeouts: Map<string, NodeJS.Timeout> = new Map(); // Debounce sync calls

  constructor() {
    this.adapter = createClientAdapter();
  }

  async init(): Promise<void> {
    if (!this.initialized) {
      if (!this.initPromise) {
        this.initPromise = (async () => {
          await this.adapter.init();
          await this.mountTransientSkills();
          this.initialized = true;
        })();
      }
      await this.initPromise;
    } else {
      // Already initialized — re-check adapter connection (handles HMR / connection loss)
      await this.adapter.init();
    }
  }

  /**
   * Get the underlying storage adapter for direct template/skill operations
   */
  getStorageAdapter(): StorageAdapter {
    if (!this.initialized) {
      throw new Error('VirtualFileSystem not initialized. Call init() first.');
    }
    return this.adapter;
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
    // Preserve server context files when reloading skills
    const serverContextFiles = new Map<string, VirtualFile>();
    for (const [path, file] of this.transientFiles) {
      if (path.startsWith('/.server/')) {
        serverContextFiles.set(path, file);
      }
    }

    this.transientFiles.clear();
    await this.mountTransientSkills();

    // Restore server context files
    for (const [path, file] of serverContextFiles) {
      this.transientFiles.set(path, file);
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('filesChanged'));
    }
  }

  // Track current server context site
  private serverContextSiteId: string | null = null;
  private serverContextMetadata: {
    siteName: string;
    siteId: string;
    hasDatabase: boolean;
    edgeFunctionCount: number;
    serverFunctionCount: number;
    secretCount: number;
    scheduledFunctionCount: number;
  } | null = null;

  /**
   * Get current server context site ID
   */
  getServerContextSiteId(): string | null {
    return this.serverContextSiteId;
  }

  /**
   * Check if server context is mounted
   */
  hasServerContext(): boolean {
    return this.serverContextSiteId !== null;
  }

  /**
   * Get server context metadata
   */
  getServerContextMetadata(): {
    siteName: string;
    siteId: string;
    hasDatabase: boolean;
    edgeFunctionCount: number;
    serverFunctionCount: number;
    secretCount: number;
    scheduledFunctionCount: number;
  } | null {
    return this.serverContextMetadata;
  }

  /**
   * Mount server context for a site
   * Creates transient files at /.server/ with database schema, edge functions, etc.
   */
  async mountServerContext(siteId: string, siteName: string): Promise<void> {
    // Only works in Server Mode on client side
    if (process.env.NEXT_PUBLIC_SERVER_MODE !== 'true') {
      logger.warn('[VFS] Server context only available in Server Mode');
      return;
    }

    // On client side, we need to fetch server context via API
    if (typeof window !== 'undefined') {
      await this.fetchServerContextFromAPI(siteId, siteName);
      return;
    }

    // Server-side: directly import modules
    try {
      // Clear existing server context
      this.unmountServerContext();

      // Import server modules (webpackIgnore prevents client bundling)
      const { getSQLiteAdapter } = await import(/* webpackIgnore: true */ './adapters/server');
      const {
        generateEdgeFunctionFile,
        generateServerFunctionFile,
        generateSecretFile,
        generateScheduledFunctionFile,
      } = await import('./server-context');

      const adapter = getSQLiteAdapter();
      await adapter.init();

      // Get site database
      const siteDb = adapter.getSiteDatabaseForAnalytics(siteId);
      if (!siteDb) {
        logger.warn(`[VFS] Site database not available for ${siteId}`);
        return;
      }

      // Mount database schema (read-only)
      const schema = siteDb.getSchemaForExport();
      this.mountTransientFile('/.server/db/schema.sql', schema, true);

      // Mount secrets - individual files per secret (SCREAMING_SNAKE_CASE names)
      const secrets = siteDb.listSecrets();
      for (const secret of secrets) {
        this.mountTransientFile(`/.server/secrets/${secret.name}.json`, generateSecretFile(secret), false);
      }

      // Mount edge functions - individual files
      const edgeFunctions = siteDb.listFunctions();
      for (const fn of edgeFunctions) {
        this.mountTransientFile(`/.server/edge-functions/${fn.name}.json`, generateEdgeFunctionFile(fn), false);
      }

      // Mount server functions - individual files
      const serverFunctions = siteDb.listServerFunctions();
      for (const fn of serverFunctions) {
        this.mountTransientFile(`/.server/server-functions/${fn.name}.json`, generateServerFunctionFile(fn), false);
      }

      // Mount scheduled functions - individual files
      const scheduledFunctions = siteDb.listScheduledFunctions();
      for (const fn of scheduledFunctions) {
        const edgeFn = siteDb.getFunction(fn.functionId);
        this.mountTransientFile(
          `/.server/scheduled-functions/${fn.name}.json`,
          generateScheduledFunctionFile(fn, edgeFn?.name ?? 'unknown'),
          false
        );
      }

      // Store metadata for the orchestrator
      this.serverContextSiteId = siteId;
      this.serverContextMetadata = {
        siteName,
        siteId,
        hasDatabase: true,
        edgeFunctionCount: edgeFunctions.filter(f => f.enabled).length,
        serverFunctionCount: serverFunctions.filter(f => f.enabled).length,
        secretCount: secrets.length,
        scheduledFunctionCount: scheduledFunctions.filter(f => f.enabled).length,
      };

      logger.info(`[VFS] Mounted server context for site ${siteId} (${siteName})`);
    } catch (error) {
      logger.error('[VFS] Failed to mount server context', error);
    }
  }

  /**
   * Fetch server context from API (client-side)
   * Creates transient files from API response
   */
  private async fetchServerContextFromAPI(siteId: string, siteName: string): Promise<void> {
    try {
      this.unmountServerContext();

      const response = await fetch(`/api/admin/sites/${siteId}/server-context`);
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Failed to fetch server context' }));
        throw new Error(error.error || 'Failed to fetch server context');
      }

      const data = await response.json();

      // Mount all files from the API response
      for (const file of data.files) {
        const virtualFile: VirtualFile = {
          id: `transient-server-${file.path.replace(/[^a-z0-9]/gi, '-')}`,
          projectId: 'transient',
          path: file.path,
          name: file.path.split('/').pop() || '',
          type: 'text',
          content: file.content,
          mimeType: file.path.endsWith('.sql') ? 'text/sql' :
                    file.path.endsWith('.json') ? 'application/json' :
                    file.path.endsWith('.js') ? 'application/javascript' :
                    'text/markdown',
          size: new Blob([file.content]).size,
          createdAt: new Date(),
          updatedAt: new Date(),
          metadata: {
            isTransient: true,
            isServerContext: true,
            isReadOnly: file.isReadOnly,
          }
        };
        this.transientFiles.set(file.path, virtualFile);
      }

      // Store metadata
      this.serverContextSiteId = siteId;
      this.serverContextMetadata = data.metadata;

      // Persist siteId to sessionStorage for HMR resilience
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem('vfs_serverContextSiteId', siteId);
      }

      logger.info(`[VFS] Mounted server context for site ${siteId} (${siteName}) via API`);

      window.dispatchEvent(new Event('filesChanged'));
    } catch (error) {
      logger.error('[VFS] Failed to fetch server context from API', error);
    }
  }

  /**
   * Unmount server context
   */
  unmountServerContext(): void {
    const removed: string[] = [];

    for (const path of this.transientFiles.keys()) {
      if (path.startsWith('/.server/')) {
        this.transientFiles.delete(path);
        removed.push(path);
      }
    }

    if (this.serverContextSiteId) {
      logger.info(`[VFS] Unmounted server context (${removed.length} files)`);
      this.serverContextSiteId = null;
      this.serverContextMetadata = null;

      // Clear sessionStorage when unmounting
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem('vfs_serverContextSiteId');
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('filesChanged'));
      }
    }
  }

  /**
   * Get all transient files in a directory
   */
  getTransientFilesInDirectory(dirPath: string): VirtualFile[] {
    const normalizedPath = dirPath.endsWith('/') ? dirPath : dirPath + '/';
    const files: VirtualFile[] = [];

    for (const [path, file] of this.transientFiles) {
      if (path.startsWith(normalizedPath)) {
        files.push(file);
      }
    }

    return files;
  }

  /**
   * Mount a single transient file
   * @param isReadOnly - If false, the file can be edited via json_patch (edge functions, server functions)
   */
  private mountTransientFile(path: string, content: string, isReadOnly = true): void {
    const file: VirtualFile = {
      id: `transient-server-${path.replace(/[^a-z0-9]/gi, '-')}`,
      projectId: 'transient',
      path,
      name: path.split('/').pop() || '',
      type: 'text',
      content,
      mimeType: path.endsWith('.sql') ? 'text/sql' :
                path.endsWith('.json') ? 'application/json' :
                path.endsWith('.js') ? 'application/javascript' :
                'text/markdown',
      size: new Blob([content]).size,
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {
        isTransient: true,
        isServerContext: true,
        isReadOnly,
      }
    };

    this.transientFiles.set(path, file);
  }

  /**
   * Update a server context file (/.server/)
   * Validates content and syncs to site database
   * On client side, routes through API; on server side, uses direct imports
   */
  private async updateServerContextFile(path: string, content: string): Promise<VirtualFile> {
    // Try to recover siteId from sessionStorage if not set (HMR resilience)
    if (!this.serverContextSiteId && typeof sessionStorage !== 'undefined') {
      const storedSiteId = sessionStorage.getItem('vfs_serverContextSiteId');
      if (storedSiteId) {
        logger.info(`[VFS] Recovered serverContextSiteId from sessionStorage: ${storedSiteId}`);
        this.serverContextSiteId = storedSiteId;
      }
    }

    if (!this.serverContextSiteId) {
      throw new Error('No site selected. Select a site from the Site Selector.');
    }

    // Check for read-only files
    if (path === '/.server/db/schema.sql') {
      throw new Error(`Cannot modify ${path} - read-only file`);
    }

    // On client side, use API
    if (typeof window !== 'undefined') {
      return await this.mutateServerContextViaAPI('update', path, content);
    }

    // Server-side: direct implementation
    // Handle individual secret files
    if (path.startsWith('/.server/secrets/') && path.endsWith('.json')) {
      return await this.updateSecretFromFile(path, content);
    }

    // Handle edge functions
    if (path.startsWith('/.server/edge-functions/') && path.endsWith('.json')) {
      return await this.updateEdgeFunctionFromFile(path, content);
    }

    // Handle server functions
    if (path.startsWith('/.server/server-functions/') && path.endsWith('.json')) {
      return await this.updateServerFunctionFromFile(path, content);
    }

    throw new Error(`Cannot modify ${path} - unrecognized server context path`);
  }

  /**
   * Mutate server context via API (client-side)
   */
  private async mutateServerContextViaAPI(
    operation: 'update' | 'create' | 'delete',
    path: string,
    content?: string
  ): Promise<VirtualFile> {
    if (!this.serverContextSiteId) {
      throw new Error('No site selected. Select a site from the Site Selector.');
    }

    const response = await fetch(`/api/admin/sites/${this.serverContextSiteId}/server-context/mutate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operation, path, content }),
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Mutation failed');
    }

    // For delete operations, remove the transient file
    if (operation === 'delete') {
      this.transientFiles.delete(path);
      window.dispatchEvent(new Event('filesChanged'));
      // Return a placeholder file for delete operations
      return {
        id: 'deleted',
        projectId: 'transient',
        path,
        name: path.split('/').pop() || '',
        type: 'text',
        content: '',
        mimeType: 'text/plain',
        size: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {
          isTransient: true,
          isServerContext: true,
          isReadOnly: false,
        },
      };
    }

    // For create/update, update the transient file with the response
    if (result.file) {
      const oldPath = path;
      const newPath = result.file.path;

      // If path changed (e.g., function renamed), remove old entry
      if (oldPath !== newPath) {
        this.transientFiles.delete(oldPath);
      }

      // Create the virtual file
      const virtualFile: VirtualFile = {
        id: `transient-server-${newPath.replace(/[^a-z0-9]/gi, '-')}`,
        projectId: 'transient',
        path: newPath,
        name: newPath.split('/').pop() || '',
        type: 'text',
        content: result.file.content,
        mimeType: newPath.endsWith('.json') ? 'application/json' :
                  newPath.endsWith('.sql') ? 'text/sql' :
                  'text/markdown',
        size: new Blob([result.file.content]).size,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {
          isTransient: true,
          isServerContext: true,
          isReadOnly: result.file.isReadOnly,
        }
      };

      this.transientFiles.set(newPath, virtualFile);
      window.dispatchEvent(new Event('filesChanged'));
      return virtualFile;
    }

    throw new Error('No file returned from mutation');
  }

  /**
   * Update edge function from file content
   */
  private async updateEdgeFunctionFromFile(path: string, content: string): Promise<VirtualFile> {
    const { getSQLiteAdapter } = await import(/* webpackIgnore: true */ './adapters/server');
    const { validateEdgeFunctionData, generateEdgeFunctionFile } = await import('./server-context');

    // Parse JSON
    let data: unknown;
    try {
      data = JSON.parse(content);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      throw new Error(`Invalid JSON: ${message}`);
    }

    // Validate
    const validation = validateEdgeFunctionData(data);
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.join('; ')}`);
    }

    // Type-safe cast after validation
    const fnData = data as { name: string; method: string; code: string; description?: string; enabled?: boolean; timeoutMs?: number };

    // Get site database
    const adapter = getSQLiteAdapter();
    await adapter.init();
    const siteDb = adapter.getSiteDatabaseForAnalytics(this.serverContextSiteId!);
    if (!siteDb) {
      throw new Error('Site database not available');
    }

    // Check if function exists by current filename
    const filename = path.split('/').pop()!.replace('.json', '');
    const existingFn = siteDb.getFunctionByName(filename);

    if (existingFn) {
      // Update existing function
      siteDb.updateFunction(existingFn.id, {
        name: fnData.name,
        code: fnData.code,
        method: fnData.method as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'ANY',
        description: fnData.description,
        enabled: fnData.enabled ?? true,
        timeoutMs: fnData.timeoutMs ?? 5000,
      });

      // If name changed, we need to update the path
      if (fnData.name !== filename) {
        // Remove old transient file
        this.transientFiles.delete(path);
        // Mount with new path
        const newPath = `/.server/edge-functions/${fnData.name}.json`;
        const updated = siteDb.getFunctionByName(fnData.name)!;
        this.mountTransientFile(newPath, generateEdgeFunctionFile(updated), false);
        return this.transientFiles.get(newPath)!;
      }
    } else {
      // Create new function
      siteDb.createFunction({
        name: fnData.name,
        code: fnData.code,
        method: fnData.method as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'ANY',
        description: fnData.description,
        enabled: fnData.enabled ?? true,
        timeoutMs: fnData.timeoutMs ?? 5000,
      });
    }

    // Update transient file with validated content
    const updated = siteDb.getFunctionByName(fnData.name)!;
    this.mountTransientFile(path, generateEdgeFunctionFile(updated), false);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('filesChanged'));
    }

    return this.transientFiles.get(path)!;
  }

  /**
   * Update server function from file content
   */
  private async updateServerFunctionFromFile(path: string, content: string): Promise<VirtualFile> {
    const { getSQLiteAdapter } = await import(/* webpackIgnore: true */ './adapters/server');
    const { validateServerFunctionData, generateServerFunctionFile } = await import('./server-context');

    // Parse JSON
    let data: unknown;
    try {
      data = JSON.parse(content);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      throw new Error(`Invalid JSON: ${message}`);
    }

    // Validate
    const validation = validateServerFunctionData(data);
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.join('; ')}`);
    }

    // Type-safe cast after validation
    const fnData = data as { name: string; code: string; description?: string; enabled?: boolean };

    // Get site database
    const adapter = getSQLiteAdapter();
    await adapter.init();
    const siteDb = adapter.getSiteDatabaseForAnalytics(this.serverContextSiteId!);
    if (!siteDb) {
      throw new Error('Site database not available');
    }

    // Check if function exists by current filename
    const filename = path.split('/').pop()!.replace('.json', '');
    const existingFn = siteDb.getServerFunctionByName(filename);

    if (existingFn) {
      // Update existing function
      siteDb.updateServerFunction(existingFn.id, {
        name: fnData.name,
        code: fnData.code,
        description: fnData.description,
        enabled: fnData.enabled ?? true,
      });

      // If name changed, we need to update the path
      if (fnData.name !== filename) {
        // Remove old transient file
        this.transientFiles.delete(path);
        // Mount with new path
        const newPath = `/.server/server-functions/${fnData.name}.json`;
        const updated = siteDb.getServerFunctionByName(fnData.name)!;
        this.mountTransientFile(newPath, generateServerFunctionFile(updated), false);
        return this.transientFiles.get(newPath)!;
      }
    } else {
      // Create new function
      siteDb.createServerFunction({
        name: fnData.name,
        code: fnData.code,
        description: fnData.description,
        enabled: fnData.enabled ?? true,
      });
    }

    // Update transient file with validated content
    const updated = siteDb.getServerFunctionByName(fnData.name)!;
    this.mountTransientFile(path, generateServerFunctionFile(updated), false);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('filesChanged'));
    }

    return this.transientFiles.get(path)!;
  }

  /**
   * Update individual secret from file content
   * Creates or updates a single secret in the database
   */
  private async updateSecretFromFile(path: string, content: string): Promise<VirtualFile> {
    const { getSQLiteAdapter } = await import(/* webpackIgnore: true */ './adapters/server');
    const { validateSecretData, generateSecretFile } = await import('./server-context');

    // Parse JSON
    let data: unknown;
    try {
      data = JSON.parse(content);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      throw new Error(`Invalid JSON: ${message}`);
    }

    // Validate
    const validation = validateSecretData(data);
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.join('; ')}`);
    }

    // Type-safe cast after validation
    const secretData = data as { name: string; description?: string };

    // Get site database
    const adapter = getSQLiteAdapter();
    await adapter.init();
    const siteDb = adapter.getSiteDatabaseForAnalytics(this.serverContextSiteId!);
    if (!siteDb) {
      throw new Error('Site database not available');
    }

    // Check if secret exists by current filename
    const filename = path.split('/').pop()!.replace('.json', '');
    const existingSecret = siteDb.getSecretByName(filename);

    if (existingSecret) {
      // Update existing secret
      siteDb.updateSecretMetadata(existingSecret.id, {
        name: secretData.name,
        description: secretData.description || ''
      });

      // If name changed, update the path
      if (secretData.name !== filename) {
        this.transientFiles.delete(path);
        const newPath = `/.server/secrets/${secretData.name}.json`;
        const updated = siteDb.getSecretByName(secretData.name)!;
        this.mountTransientFile(newPath, generateSecretFile(updated), false);
        return this.transientFiles.get(newPath)!;
      }
    } else {
      // Create new secret placeholder
      siteDb.createSecretPlaceholder(secretData.name, secretData.description || '');
    }

    // Update transient file with validated content
    const updated = siteDb.getSecretByName(secretData.name)!;
    this.mountTransientFile(path, generateSecretFile(updated), false);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('filesChanged'));
    }

    return this.transientFiles.get(path)!;
  }

  /**
   * Create a new server context file (/.server/)
   * Validates content and creates in site database
   * On client side, routes through API
   */
  private async createServerContextFile(path: string, content: string): Promise<VirtualFile> {
    // Try to recover siteId from sessionStorage if not set (HMR resilience)
    if (!this.serverContextSiteId && typeof sessionStorage !== 'undefined') {
      const storedSiteId = sessionStorage.getItem('vfs_serverContextSiteId');
      if (storedSiteId) {
        logger.info(`[VFS] Recovered serverContextSiteId from sessionStorage: ${storedSiteId}`);
        this.serverContextSiteId = storedSiteId;
      }
    }

    if (!this.serverContextSiteId) {
      throw new Error('No site selected. Select a site from the Site Selector.');
    }

    // Check if file already exists in transient files
    if (this.transientFiles.has(path)) {
      throw new Error(`File already exists: ${path}`);
    }

    // On client side, use API
    if (typeof window !== 'undefined') {
      return await this.mutateServerContextViaAPI('create', path, content);
    }

    // Server-side: direct implementation
    // Handle individual secret files
    if (path.startsWith('/.server/secrets/') && path.endsWith('.json')) {
      return await this.updateSecretFromFile(path, content);
    }

    // Handle edge functions
    if (path.startsWith('/.server/edge-functions/') && path.endsWith('.json')) {
      return await this.updateEdgeFunctionFromFile(path, content);
    }

    // Handle server functions
    if (path.startsWith('/.server/server-functions/') && path.endsWith('.json')) {
      return await this.updateServerFunctionFromFile(path, content);
    }

    throw new Error(`Cannot create ${path} - only secrets, edge functions, and server functions (.json) can be created`);
  }

  /**
   * Delete a server context file (/.server/)
   * Deletes from site database
   * On client side, routes through API
   */
  async deleteServerContextFile(path: string): Promise<void> {
    // Try to recover siteId from sessionStorage if not set (HMR resilience)
    if (!this.serverContextSiteId && typeof sessionStorage !== 'undefined') {
      const storedSiteId = sessionStorage.getItem('vfs_serverContextSiteId');
      if (storedSiteId) {
        logger.info(`[VFS] Recovered serverContextSiteId from sessionStorage: ${storedSiteId}`);
        this.serverContextSiteId = storedSiteId;
      }
    }

    if (!this.serverContextSiteId) {
      throw new Error('No site selected');
    }

    // Cannot delete schema.sql - read-only
    if (path === '/.server/db/schema.sql') {
      throw new Error(`Cannot delete ${path} - read-only file`);
    }

    // On client side, use API for all deletions
    if (typeof window !== 'undefined') {
      await this.mutateServerContextViaAPI('delete', path);
      return;
    }

    // Handle individual secret files
    if (path.startsWith('/.server/secrets/') && path.endsWith('.json')) {
      const { getSQLiteAdapter } = await import(/* webpackIgnore: true */ './adapters/server');
      const adapter = getSQLiteAdapter();
      await adapter.init();
      const siteDb = adapter.getSiteDatabaseForAnalytics(this.serverContextSiteId);
      if (!siteDb) {
        throw new Error('Site database not available');
      }

      const filename = path.split('/').pop()!.replace('.json', '');
      const secret = siteDb.getSecretByName(filename);
      if (!secret) {
        throw new Error(`Secret not found: ${filename}`);
      }

      siteDb.deleteSecret(secret.id);
      this.transientFiles.delete(path);
      return;
    }

    // Handle edge functions
    if (path.startsWith('/.server/edge-functions/') && path.endsWith('.json')) {
      const { getSQLiteAdapter } = await import(/* webpackIgnore: true */ './adapters/server');
      const adapter = getSQLiteAdapter();
      await adapter.init();
      const siteDb = adapter.getSiteDatabaseForAnalytics(this.serverContextSiteId);
      if (!siteDb) {
        throw new Error('Site database not available');
      }

      const filename = path.split('/').pop()!.replace('.json', '');
      const fn = siteDb.getFunctionByName(filename);
      if (!fn) {
        throw new Error(`Edge function not found: ${filename}`);
      }

      siteDb.deleteFunction(fn.id);
      this.transientFiles.delete(path);
      return;
    }

    // Handle server functions
    if (path.startsWith('/.server/server-functions/') && path.endsWith('.json')) {
      const { getSQLiteAdapter } = await import(/* webpackIgnore: true */ './adapters/server');
      const adapter = getSQLiteAdapter();
      await adapter.init();
      const siteDb = adapter.getSiteDatabaseForAnalytics(this.serverContextSiteId);
      if (!siteDb) {
        throw new Error('Site database not available');
      }

      const filename = path.split('/').pop()!.replace('.json', '');
      const fn = siteDb.getServerFunctionByName(filename);
      if (!fn) {
        throw new Error(`Server function not found: ${filename}`);
      }

      siteDb.deleteServerFunction(fn.id);
      this.transientFiles.delete(path);
      return;
    }

    throw new Error(`Cannot delete ${path} - read-only file`);
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

      // Handle server context file creation (/.server/)
      if (path.startsWith('/.server/')) {
        return await this.createServerContextFile(path, content as string);
      }

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

      // Handle server context file writes (/.server/)
      if (path.startsWith('/.server/')) {
        return await this.updateServerContextFile(path, content as string);
      }

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

  async createProject(name: string, description?: string, id?: string): Promise<Project> {
    this.ensureInitialized();

    try {
      const project: Project = {
        id: id || uuidv4(),
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

  async updateProject(project: Project, options?: { preserveUpdatedAt?: boolean }): Promise<void> {
    this.ensureInitialized();

    // Only update timestamp if not preserving (for sync metadata updates)
    if (!options?.preserveUpdatedAt) {
      project.updatedAt = new Date();
    }
    await this.adapter.updateProject(project);
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
