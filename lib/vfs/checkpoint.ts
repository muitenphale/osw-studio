import { vfs } from './index';
import { logger } from '@/lib/utils';
import { compressToUTF16, decompressFromUTF16 } from 'lz-string';

export type CheckpointKind = 'auto' | 'manual' | 'system';

// File content can be either a string or base64-encoded binary data
interface CheckpointFileContent {
  data: string;
  encoding?: 'base64';
}

// Full checkpoint with file contents (only used during create/restore)
export interface Checkpoint {
  id: string;
  timestamp: string;
  description: string;
  files: Map<string, string | CheckpointFileContent>;
  directories: Set<string>;
  projectId: string;
  kind: CheckpointKind;
  baseRevisionId?: string | null;
}

// Lightweight metadata for listing (kept in RAM)
export interface CheckpointMetadata {
  id: string;
  timestamp: string;
  description: string;
  projectId: string;
  kind: CheckpointKind;
  baseRevisionId?: string | null;
}

// Serializable checkpoint format for storage
interface StoredCheckpoint {
  id: string;
  timestamp: string;
  description: string;
  files: [string, string | CheckpointFileContent][];
  directories: string[];
  projectId: string;
  kind?: CheckpointKind;
  baseRevisionId?: string | null;
}

// Compressed checkpoint format — lz-string UTF-16 encoded files+directories
interface StoredCheckpointCompressed {
  id: string;
  timestamp: string;
  description: string;
  projectId: string;
  kind?: CheckpointKind;
  baseRevisionId?: string | null;
  compressed: true;
  compressedData: string; // lz-string UTF-16 compressed JSON of { files, directories }
}

type StoredCheckpointAny = StoredCheckpoint | StoredCheckpointCompressed;

interface CreateCheckpointOptions {
  kind?: CheckpointKind;
  baseRevisionId?: string | null;
}

class CheckpointManager {
  // LAZY LOADING: Only store metadata in RAM, not full checkpoint data
  private checkpointMetadata: Map<string, CheckpointMetadata> = new Map();
  private currentCheckpoint: string | null = null;
  private storeName = 'checkpoints';
  private isInitialized = false;

  // Lock for system checkpoint creation to prevent race-condition duplicates
  private systemCheckpointLocks: Map<string, Promise<Checkpoint>> = new Map();

  // Global limit to prevent accumulation
  private readonly MAX_TOTAL_CHECKPOINTS = 50;

  /**
   * Convert ArrayBuffer to base64 string
   */
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Convert base64 string to ArrayBuffer
   */
  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }
  
  /**
   * Initialize by ensuring VFS database is ready
   */
  private async initDB(): Promise<void> {
    if (this.isInitialized) {
      return;
    }
    // Initialize VFS which also initializes the shared database
    await vfs.init();
    this.isInitialized = true;
    await this.loadCheckpointMetadataFromDB();
  }

  /**
   * Get shared database connection from VFS
   */
  private getDB(): IDBDatabase {
    return vfs.getDatabase();
  }

  /**
   * LAZY LOADING: Only load checkpoint metadata into RAM, not file contents.
   * Full checkpoint data stays in IndexedDB and is loaded on-demand during restore.
   */
  private async loadCheckpointMetadataFromDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const db = this.getDB();
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll();

      request.onsuccess = () => {
        const storedCheckpoints = request.result as StoredCheckpointAny[];
        this.checkpointMetadata.clear();

        for (const stored of storedCheckpoints) {
          // Only store metadata, NOT file contents
          const metadata: CheckpointMetadata = {
            id: stored.id,
            timestamp: stored.timestamp,
            description: stored.description,
            projectId: stored.projectId,
            kind: stored.kind || 'auto',
            baseRevisionId: stored.baseRevisionId ?? null
          };
          this.checkpointMetadata.set(stored.id, metadata);
        }

        resolve();
      };

      request.onerror = () => {
        logger.error('Failed to load checkpoint metadata from DB');
        reject(request.error);
      };
    });
  }

  /**
   * Load a single full checkpoint from IndexedDB (on-demand for restore)
   */
  private async loadSingleCheckpointFromDB(checkpointId: string): Promise<Checkpoint | null> {
    return new Promise((resolve, reject) => {
      const db = this.getDB();
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(checkpointId);

      request.onsuccess = () => {
        const stored = request.result as StoredCheckpointAny | undefined;
        if (!stored) {
          resolve(null);
          return;
        }

        let files: Map<string, string | CheckpointFileContent>;
        let directories: Set<string>;

        if ('compressed' in stored && stored.compressed) {
          // Compressed format — decompress lz-string UTF-16
          const json = decompressFromUTF16(stored.compressedData);
          if (!json) {
            logger.error(`[Checkpoint] Failed to decompress checkpoint ${checkpointId} (corrupt data)`);
            resolve(null);
            return;
          }
          const parsed = JSON.parse(json);
          files = new Map(parsed.files);
          directories = new Set(parsed.directories);
        } else {
          // Legacy uncompressed format
          const legacy = stored as StoredCheckpoint;
          files = new Map(legacy.files);
          directories = new Set(legacy.directories);
        }

        const checkpoint: Checkpoint = {
          id: stored.id,
          timestamp: stored.timestamp,
          description: stored.description,
          projectId: stored.projectId,
          kind: stored.kind || 'auto',
          baseRevisionId: stored.baseRevisionId ?? null,
          files,
          directories
        };
        resolve(checkpoint);
      };

      request.onerror = () => {
        logger.error('Failed to load checkpoint from DB');
        reject(request.error);
      };
    });
  }
  
  /**
   * Save a checkpoint to IndexedDB
   */
  private async saveCheckpointToDB(checkpoint: Checkpoint): Promise<void> {
    await this.initDB();

    let record: StoredCheckpoint | StoredCheckpointCompressed;

    try {
      const payload = JSON.stringify({
        files: Array.from(checkpoint.files.entries()),
        directories: Array.from(checkpoint.directories)
      });
      const compressedData = compressToUTF16(payload);

      record = {
        id: checkpoint.id,
        timestamp: checkpoint.timestamp,
        description: checkpoint.description,
        projectId: checkpoint.projectId,
        kind: checkpoint.kind,
        baseRevisionId: checkpoint.baseRevisionId ?? null,
        compressed: true,
        compressedData
      };
    } catch {
      // Fallback to uncompressed on compression failure
      record = {
        ...checkpoint,
        files: Array.from(checkpoint.files.entries()),
        directories: Array.from(checkpoint.directories),
        kind: checkpoint.kind,
        baseRevisionId: checkpoint.baseRevisionId ?? null
      };
    }

    return new Promise((resolve, reject) => {
      let db: IDBDatabase;
      try {
        db = this.getDB();
      } catch (err) {
        reject(err);
        return;
      }
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.put(record);

      request.onsuccess = () => resolve();
      request.onerror = () => {
        logger.error('Failed to save checkpoint to DB');
        reject(request.error);
      };
    });
  }
  
  /**
   * Delete a checkpoint from IndexedDB
   */
  private async deleteCheckpointFromDB(checkpointId: string): Promise<void> {
    await this.initDB();

    return new Promise((resolve, reject) => {
      const db = this.getDB();
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(checkpointId);

      request.onsuccess = () => resolve();
      request.onerror = () => {
        logger.error('Failed to delete checkpoint from DB');
        reject(request.error);
      };
    });
  }
  
  /**
   * Create a checkpoint of current project state
   */
  async createCheckpoint(
    projectId: string,
    description: string,
    options: CreateCheckpointOptions = {}
  ): Promise<Checkpoint> {
    // System checkpoints are unique per project — serialize concurrent calls
    if (options.kind === 'system') {
      const existing = this.systemCheckpointLocks.get(projectId);
      if (existing) {
        return existing;
      }

      const promise = this.createCheckpointInternal(projectId, description, options);
      this.systemCheckpointLocks.set(projectId, promise);
      try {
        return await promise;
      } finally {
        this.systemCheckpointLocks.delete(projectId);
      }
    }

    return await this.createCheckpointInternal(projectId, description, options);
  }

  private async createCheckpointInternal(
    projectId: string,
    description: string,
    options: CreateCheckpointOptions = {}
  ): Promise<Checkpoint> {
    await this.initDB();
    await vfs.init();

    // System checkpoints are unique per project — reuse existing if present
    if (options.kind === 'system') {
      const existingSystem = Array.from(this.checkpointMetadata.values()).find(
        cp => cp.projectId === projectId && cp.kind === 'system'
      );
      if (existingSystem) {
        const full = await this.loadSingleCheckpointFromDB(existingSystem.id);
        if (full) {
          return full;
        }
      }
    }

    const files = await vfs.listDirectory(projectId, '/');
    const fileContents = new Map<string, string | CheckpointFileContent>();
    const directories = new Set<string>();
    
    for (const file of files) {
      const pathParts = file.path.split('/').filter(Boolean);
      for (let i = 1; i <= pathParts.length - 1; i++) {
        const dirPath = '/' + pathParts.slice(0, i).join('/');
        directories.add(dirPath);
      }
      
      if (typeof file.content === 'string') {
        fileContents.set(file.path, file.content);
      } else if (file.content instanceof ArrayBuffer) {
        // Convert ArrayBuffer to base64 for storage
        const base64Data = this.arrayBufferToBase64(file.content);
        fileContents.set(file.path, {
          data: base64Data,
          encoding: 'base64'
        });
      } else {
        // Try to read the full file if content is not available
        try {
          const fullFile = await vfs.readFile(projectId, file.path);
          if (typeof fullFile.content === 'string') {
            fileContents.set(file.path, fullFile.content);
          } else if (fullFile.content instanceof ArrayBuffer) {
            const base64Data = this.arrayBufferToBase64(fullFile.content);
            fileContents.set(file.path, {
              data: base64Data,
              encoding: 'base64'
            });
          }
        } catch (error) {
          logger.error(`Failed to read file for checkpoint: ${file.path}`, error);
        }
      }
    }
    
    const checkpoint: Checkpoint = {
      id: `cp_${Date.now()}`,
      timestamp: new Date().toISOString(),
      description,
      files: fileContents,
      directories,
      projectId,
      kind: options.kind || 'auto',
      baseRevisionId: options.baseRevisionId ?? null
    };

    // LAZY LOADING: Only store metadata in RAM, full data goes to IndexedDB
    const metadata: CheckpointMetadata = {
      id: checkpoint.id,
      timestamp: checkpoint.timestamp,
      description: checkpoint.description,
      projectId: checkpoint.projectId,
      kind: checkpoint.kind,
      baseRevisionId: checkpoint.baseRevisionId
    };
    this.checkpointMetadata.set(checkpoint.id, metadata);
    this.currentCheckpoint = checkpoint.id;

    // Persist full checkpoint to IndexedDB (file contents stored there, not RAM)
    await this.saveCheckpointToDB(checkpoint);

    // Clean up old auto checkpoints (keep last 10 by timestamp)
    const autoCheckpoints = Array.from(this.checkpointMetadata.values())
      .filter(cp => cp.projectId === projectId && cp.kind === 'auto')
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    if (autoCheckpoints.length > 10) {
      const toDelete = autoCheckpoints.slice(0, autoCheckpoints.length - 10);
      for (const cp of toDelete) {
        this.checkpointMetadata.delete(cp.id);
        await this.deleteCheckpointFromDB(cp.id);
      }
    }

    // Enforce global limit across all projects
    await this.enforceGlobalLimit();

    return checkpoint;
  }
  
  /**
   * Restore project to a checkpoint
   */
  async restoreCheckpoint(checkpointId: string): Promise<boolean> {
    // Defensive check: ensure checkpointId is a string
    if (typeof checkpointId !== 'string') {
      logger.error('[Checkpoint] Invalid checkpoint ID type:', typeof checkpointId, checkpointId);
      return false;
    }

    // Basic validation of checkpoint ID format
    if (!checkpointId.startsWith('cp_') || checkpointId.length < 6) {
      logger.error('[Checkpoint] Invalid checkpoint ID format:', checkpointId);
      return false;
    }

    await this.initDB();

    // LAZY LOADING: Load full checkpoint from IndexedDB on-demand
    const checkpoint = await this.loadSingleCheckpointFromDB(checkpointId);
    if (!checkpoint) {
      logger.error(`[Checkpoint] Checkpoint not found in database: ${checkpointId}`);
      return false;
    }
    
    await vfs.init();
    
    try {
      const currentFiles = await vfs.listDirectory(checkpoint.projectId, '/');
      
      const currentDirs = new Set<string>();
      for (const file of currentFiles) {
        const pathParts = file.path.split('/').filter(Boolean);
        for (let i = 1; i <= pathParts.length - 1; i++) {
          const dirPath = '/' + pathParts.slice(0, i).join('/');
          currentDirs.add(dirPath);
        }
      }
      
      for (const file of currentFiles) {
        if (!checkpoint.files.has(file.path)) {
          await vfs.deleteFile(checkpoint.projectId, file.path);
        }
      }
      
      const dirsToDelete = Array.from(currentDirs)
        .filter(dir => !checkpoint.directories || !checkpoint.directories.has(dir))
        .sort((a, b) => b.length - a.length);
      
      for (const dir of dirsToDelete) {
        try {
          await vfs.deleteDirectory(checkpoint.projectId, dir);
        } catch {
        }
      }
      
      if (checkpoint.directories) {
        const dirsToCreate = Array.from(checkpoint.directories)
          .sort((a, b) => a.length - b.length);
        
        for (const dir of dirsToCreate) {
          if (!currentDirs.has(dir)) {
            try {
              await vfs.createDirectory(checkpoint.projectId, dir);
            } catch {
            }
          }
        }
      }
      
      for (const [path, content] of checkpoint.files) {
        let actualContent: string | ArrayBuffer;
        
        // Check if content is base64-encoded binary data
        if (typeof content === 'object' && content.encoding === 'base64') {
          actualContent = this.base64ToArrayBuffer(content.data);
        } else {
          actualContent = content as string;
        }
        
        const exists = currentFiles.some(f => f.path === path);
        if (exists) {
          await vfs.updateFile(checkpoint.projectId, path, actualContent);
        } else {
          await vfs.createFile(checkpoint.projectId, path, actualContent);
        }
      }
      
      this.currentCheckpoint = checkpointId;
      return true;
    } catch (error) {
      logger.error('Failed to restore checkpoint:', error);
      return false;
    }
  }
  
  /**
   * Get all checkpoint metadata for a project (lightweight - no file contents)
   */
  async getCheckpoints(projectId: string): Promise<CheckpointMetadata[]> {
    await this.initDB();

    return Array.from(this.checkpointMetadata.values())
      .filter(cp => cp.projectId === projectId)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }
  
  /**
   * Get the current checkpoint metadata
   */
  getCurrentCheckpoint(): CheckpointMetadata | null {
    if (!this.currentCheckpoint) return null;
    return this.checkpointMetadata.get(this.currentCheckpoint) || null;
  }

  /**
   * Check if a checkpoint exists
   */
  async checkpointExists(checkpointId: string): Promise<boolean> {
    if (!checkpointId || typeof checkpointId !== 'string') {
      return false;
    }

    await this.initDB();

    // Check metadata (which is always loaded)
    return this.checkpointMetadata.has(checkpointId);
  }

  /**
   * Clear all checkpoints for a project (both auto and manual)
   */
  async clearCheckpoints(projectId: string): Promise<void> {
    await this.initDB();

    const toDelete: string[] = [];
    for (const [id, meta] of this.checkpointMetadata) {
      if (meta.projectId === projectId) {
        this.checkpointMetadata.delete(id);
        toDelete.push(id);
      }
    }

    // Delete from IndexedDB
    for (const id of toDelete) {
      await this.deleteCheckpointFromDB(id);
    }

    this.currentCheckpoint = null;
  }

  /**
   * Clear only auto-checkpoints for a project (keep manual saves)
   * Call this when conversation is cleared to clean up session checkpoints
   *
   * NOTE: We need to check the raw stored checkpoint to see if kind was explicitly set,
   * because legacy checkpoints without a kind field get defaulted to 'auto' but might
   * actually be manual saves that should be preserved.
   */
  async clearAutoCheckpoints(projectId: string): Promise<void> {
    await this.initDB();

    // Get all stored checkpoints to check their raw kind field
    const storedCheckpoints = await this.getAllStoredCheckpoints();
    const explicitAutoIds = new Set<string>();

    for (const stored of storedCheckpoints) {
      // Only delete if kind was EXPLICITLY set to 'auto'
      // Don't delete legacy checkpoints that default to 'auto' (they might be manual saves)
      if (stored.projectId === projectId && stored.kind === 'auto') {
        explicitAutoIds.add(stored.id);
      }
    }

    const toDelete: string[] = [];
    for (const [id, meta] of this.checkpointMetadata) {
      if (meta.projectId === projectId && explicitAutoIds.has(id)) {
        toDelete.push(id);
      }
    }

    for (const id of toDelete) {
      this.checkpointMetadata.delete(id);
      await this.deleteCheckpointFromDB(id);
    }

    // Reset current checkpoint if it was an auto-checkpoint that got deleted
    if (this.currentCheckpoint && toDelete.includes(this.currentCheckpoint)) {
      this.currentCheckpoint = null;
    }

    if (toDelete.length > 0) {
      logger.debug(`[CheckpointManager] Cleared ${toDelete.length} auto-checkpoints for project ${projectId}`);
    }
  }

  /**
   * Get all stored checkpoints from IndexedDB (raw, without processing)
   */
  private async getAllStoredCheckpoints(): Promise<StoredCheckpointAny[]> {
    return new Promise((resolve, reject) => {
      const db = this.getDB();
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result as StoredCheckpointAny[]);
      };

      request.onerror = () => {
        logger.error('Failed to get stored checkpoints');
        reject(request.error);
      };
    });
  }

  /**
   * Unload all checkpoint metadata for a project from memory
   * Checkpoints remain in IndexedDB and can be reloaded on demand
   * This is called when leaving a project to free up memory
   */
  unloadProject(projectId: string): void {
    let unloadedCount = 0;
    for (const [id, meta] of this.checkpointMetadata) {
      if (meta.projectId === projectId) {
        this.checkpointMetadata.delete(id);
        unloadedCount++;
      }
    }

    // Reset current checkpoint if it was from this project
    if (this.currentCheckpoint) {
      const current = this.checkpointMetadata.get(this.currentCheckpoint);
      if (!current) {
        this.currentCheckpoint = null;
      }
    }

    if (unloadedCount > 0) {
      logger.debug(`[CheckpointManager] Unloaded ${unloadedCount} checkpoint metadata for project ${projectId} from memory`);
    }
  }

  /**
   * Enforce global checkpoint limit to prevent accumulation
   * Deletes oldest checkpoints across all projects when limit exceeded
   */
  private async enforceGlobalLimit(): Promise<void> {
    // Only count auto checkpoints toward the global limit —
    // manual and system checkpoints are protected and don't count
    const autoCheckpoints = Array.from(this.checkpointMetadata.values())
      .filter(cp => cp.kind !== 'manual' && cp.kind !== 'system')
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    if (autoCheckpoints.length <= this.MAX_TOTAL_CHECKPOINTS) {
      return;
    }

    const toDelete = autoCheckpoints.slice(0, autoCheckpoints.length - this.MAX_TOTAL_CHECKPOINTS);

    for (const cp of toDelete) {
      this.checkpointMetadata.delete(cp.id);
      await this.deleteCheckpointFromDB(cp.id);
    }

    if (toDelete.length > 0) {
      logger.debug(`[CheckpointManager] Cleaned up ${toDelete.length} old auto checkpoints`);
    }
  }
}

export const checkpointManager = new CheckpointManager();
