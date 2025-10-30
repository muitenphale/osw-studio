/**
 * Debug Events State Management
 * Handles debug events persistence and state management with IndexedDB
 */

import { logger } from '@/lib/utils';

export interface DebugEvent {
  id: string;
  timestamp: number;
  event: string;
  data: any;
}

interface StoredDebugEventsState {
  id: string;
  projectId: string;
  events: DebugEvent[];
  lastUpdated: string;
}

export class DebugEventsStateManager {
  private eventsCache: Map<string, DebugEvent[]> = new Map();
  private storeName = 'debugEvents';
  private isInitialized = false;

  /**
   * Initialize by ensuring VFS database is ready
   */
  private async initDB(): Promise<void> {
    if (this.isInitialized) return;

    // Import vfs dynamically to avoid circular dependency
    const { vfs } = await import('@/lib/vfs');
    await vfs.init();
    this.isInitialized = true;
  }

  /**
   * Get shared database connection from VFS
   */
  private async getDB(): Promise<IDBDatabase> {
    const { vfs } = await import('@/lib/vfs');
    return (vfs as any).db.getDatabase();
  }

  /**
   * Get debug events ID for a project
   */
  private getDebugEventsId(projectId: string): string {
    return `debug_events_${projectId}`;
  }

  /**
   * Load debug events from IndexedDB
   */
  async loadEvents(projectId: string): Promise<DebugEvent[]> {
    await this.initDB();
    const db = await this.getDB();

    const eventsId = this.getDebugEventsId(projectId);

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(eventsId);

      request.onsuccess = () => {
        const stored = request.result as StoredDebugEventsState;
        if (stored && stored.events) {
          this.eventsCache.set(projectId, stored.events);
          resolve(stored.events);
        } else {
          resolve([]);
        }
      };

      request.onerror = () => {
        logger.error('Failed to load debug events from DB');
        reject(request.error);
      };
    });
  }

  /**
   * Save debug events to IndexedDB
   */
  async saveEvents(projectId: string, events: DebugEvent[]): Promise<void> {
    await this.initDB();
    const db = await this.getDB();

    const storedState: StoredDebugEventsState = {
      id: this.getDebugEventsId(projectId),
      projectId,
      events,
      lastUpdated: new Date().toISOString()
    };

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.put(storedState);

      request.onsuccess = () => {
        this.eventsCache.set(projectId, events);
        resolve();
      };

      request.onerror = () => {
        logger.error('Failed to save debug events to DB');
        reject(request.error);
      };
    });
  }

  /**
   * Append a new debug event
   */
  async appendEvent(projectId: string, event: DebugEvent): Promise<void> {
    let events = this.eventsCache.get(projectId);
    if (!events) {
      events = await this.loadEvents(projectId);
    }

    events.push(event);
    this.eventsCache.set(projectId, events);

    // Save to DB - await to prevent race conditions with rapid event appends
    await this.saveEvents(projectId, events);
  }

  /**
   * Clear all debug events for a project
   */
  async clearEvents(projectId: string): Promise<void> {
    this.eventsCache.delete(projectId);
    await this.saveEvents(projectId, []);

    logger.debug(`[DebugEventsState] Cleared debug events for project ${projectId}`);
  }

  /**
   * Truncate debug events to a specific set (used for retry)
   */
  async truncateEvents(projectId: string, events: DebugEvent[]): Promise<void> {
    this.eventsCache.set(projectId, events);
    await this.saveEvents(projectId, events);

    logger.debug(`[DebugEventsState] Truncated debug events for project ${projectId} to ${events.length} events`);
  }

  /**
   * Get debug events for a project (from cache or DB)
   */
  async getEvents(projectId: string): Promise<DebugEvent[]> {
    let events = this.eventsCache.get(projectId);
    if (!events) {
      events = await this.loadEvents(projectId);
    }
    return events;
  }

  /**
   * Delete all debug events for a project
   */
  async deleteProject(projectId: string): Promise<void> {
    await this.initDB();
    const db = await this.getDB();

    const eventsId = this.getDebugEventsId(projectId);

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(eventsId);

      request.onsuccess = () => {
        this.eventsCache.delete(projectId);
        resolve();
      };

      request.onerror = () => {
        logger.error('Failed to delete debug events from DB');
        reject(request.error);
      };
    });
  }
}

export const debugEventsState = new DebugEventsStateManager();
