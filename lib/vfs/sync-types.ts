/**
 * Sync Types
 *
 * Type definitions for granular sync status tracking across
 * projects, skills, and templates.
 */

/**
 * Sync status for individual items
 */
export type ItemSyncStatus =
  | 'synced'        // In sync with server
  | 'local-newer'   // Local has changes not yet pushed
  | 'server-newer'  // Server has updates to pull
  | 'conflict'      // Both local and server have changes
  | 'local-only'    // Only exists locally
  | 'server-only'   // Only exists on server
  | 'syncing'       // Currently syncing
  | 'error';        // Sync failed

/**
 * Represents a syncable item (project, skill, or template)
 */
export interface SyncableItem {
  id: string;
  name: string;
  type: 'project' | 'skill' | 'template';
  localUpdatedAt: Date | null;
  serverUpdatedAt: Date | null;
  lastSyncedAt: Date | null;
  status: ItemSyncStatus;
}

/**
 * Sync status for a category of items
 */
export interface CategorySyncStatus {
  items: SyncableItem[];
  syncedCount: number;
  localNewerCount: number;
  serverNewerCount: number;
  conflictCount: number;
  localOnlyCount: number;
  serverOnlyCount: number;
}

/**
 * Detailed sync status across all syncable categories
 */
export interface DetailedSyncStatus {
  projects: CategorySyncStatus;
  skills: CategorySyncStatus;
  templates: CategorySyncStatus;
  loading: boolean;
  error: string | null;
}

/**
 * Server status response for skills
 */
export interface SkillSyncStatus {
  id: string;
  name: string;
  updatedAt: string; // ISO string
}

/**
 * Server status response for templates
 */
export interface TemplateSyncStatus {
  id: string;
  name: string;
  updatedAt: string; // ISO string (from importedAt or updatedAt)
}

/**
 * Server status response for projects
 */
export interface ProjectSyncStatus {
  id: string;
  name: string;
  updatedAt: string; // ISO string
}

/**
 * Enhanced sync status response from server
 */
export interface EnhancedSyncStatusResponse {
  success: boolean;
  projects: ProjectSyncStatus[];
  skills: SkillSyncStatus[];
  templates: TemplateSyncStatus[];
  summary: {
    projectCount: number;
    skillCount: number;
    templateCount: number;
    deploymentCount: number;
    lastUpdated: string | null;
    isUninitialized: boolean;
  };
}

/**
 * Calculate category counts from items
 */
export function calculateCategoryCounts(items: SyncableItem[]): Omit<CategorySyncStatus, 'items'> {
  return {
    syncedCount: items.filter(i => i.status === 'synced').length,
    localNewerCount: items.filter(i => i.status === 'local-newer').length,
    serverNewerCount: items.filter(i => i.status === 'server-newer').length,
    conflictCount: items.filter(i => i.status === 'conflict').length,
    localOnlyCount: items.filter(i => i.status === 'local-only').length,
    serverOnlyCount: items.filter(i => i.status === 'server-only').length,
  };
}

/**
 * Calculate sync status using three-way timestamp comparison
 * Reusable for projects, skills, and templates
 */
export function calculateItemSyncStatus(
  localUpdatedAt: Date | null,
  serverUpdatedAt: Date | null,
  lastSyncedAt: Date | null
): ItemSyncStatus {
  // If no local item, it's server-only
  if (!localUpdatedAt) {
    return serverUpdatedAt ? 'server-only' : 'synced';
  }

  // If no server timestamp available, it's local-only
  if (!serverUpdatedAt) {
    return 'local-only';
  }

  // If never synced before, compare timestamps directly
  if (!lastSyncedAt) {
    if (localUpdatedAt > serverUpdatedAt) {
      return 'local-newer';
    } else if (serverUpdatedAt > localUpdatedAt) {
      return 'server-newer';
    }
    return 'synced';
  }

  // Three-way comparison
  const localChanged = localUpdatedAt > lastSyncedAt;
  const serverChanged = serverUpdatedAt > lastSyncedAt;

  if (localChanged && serverChanged) {
    return 'conflict';
  }

  if (localChanged) {
    return 'local-newer';
  }

  if (serverChanged) {
    return 'server-newer';
  }

  return 'synced';
}
