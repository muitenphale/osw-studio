/**
 * Server-only adapter factory
 *
 * Creates per-workspace SQLiteAdapter instances cached by workspaceId.
 * Each workspace's data lives in data/workspaces/{workspaceId}/osws.sqlite.
 *
 * Backward compatibility:
 * - getSQLiteAdapter() returns the default adapter (data/osws.sqlite)
 *   Used by public routes (analytics, deployment serving) that don't need workspace context
 * - getWorkspaceAdapter(workspaceId) returns a per-workspace adapter
 *   Used by all authenticated routes
 */

import 'server-only';

import path from 'path';
import { StorageAdapter } from './types';
import { SQLiteAdapter } from './sqlite-adapter';

// Default adapter for backward compatibility and public routes
let defaultAdapter: SQLiteAdapter | null = null;

// Per-workspace adapter cache
const workspaceAdapters = new Map<string, { adapter: SQLiteAdapter; lastAccess: number }>();

// Evict adapters idle for more than 10 minutes
const IDLE_TIMEOUT_MS = 10 * 60 * 1000;

function getDataDir(): string {
  return process.env.DATA_DIR || path.join(process.cwd(), 'data');
}

/**
 * Validate workspaceId is a UUID to prevent path traversal
 */
function validateWorkspaceId(workspaceId: string): void {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(workspaceId)) {
    throw new Error(`Invalid workspace ID format: ${workspaceId}`);
  }
}

/**
 * Get a per-workspace SQLiteAdapter (cached, creates workspace DB if needed)
 * This is the primary factory for all authenticated routes.
 *
 * Special cases:
 * - 'default' falls back to the default adapter (data/osws.sqlite)
 *   Used by legacy single-user admin and desktop (Electron app) modes
 */
export function getWorkspaceAdapter(workspaceId: string): SQLiteAdapter {
  // Legacy admin, desktop, and default workspace use the shared database
  if (workspaceId === 'default' || workspaceId === 'admin' || workspaceId === 'desktop' || workspaceId === 'instance-api') {
    return getSQLiteAdapter();
  }

  validateWorkspaceId(workspaceId);

  const cached = workspaceAdapters.get(workspaceId);
  if (cached) {
    cached.lastAccess = Date.now();
    return cached.adapter;
  }

  const dbPath = path.join(getDataDir(), 'workspaces', workspaceId, 'osws.sqlite');
  const adapter = new SQLiteAdapter(dbPath);
  workspaceAdapters.set(workspaceId, { adapter, lastAccess: Date.now() });
  return adapter;
}

/**
 * Get the default SQLiteAdapter (backward compatible singleton)
 * Used by public routes that don't require user context:
 * - Analytics tracking/reading
 * - Deployment function invocation
 * - Admin dashboard (system-wide stats)
 */
export function getSQLiteAdapter(): SQLiteAdapter {
  if (!defaultAdapter) {
    defaultAdapter = new SQLiteAdapter();
  }
  return defaultAdapter;
}

/**
 * @deprecated Use getWorkspaceAdapter(workspaceId) for authenticated routes
 * Kept for backward compatibility during migration
 */
export async function createServerAdapter(): Promise<StorageAdapter> {
  return getSQLiteAdapter();
}

// Periodic cleanup of idle adapters (guarded to prevent leaks on hot reload)
const CLEANUP_KEY = '__osw_workspace_cleanup';
if (typeof setInterval !== 'undefined' && !(globalThis as Record<string, unknown>)[CLEANUP_KEY]) {
  (globalThis as Record<string, unknown>)[CLEANUP_KEY] = setInterval(() => {
    const now = Date.now();
    for (const [workspaceId, entry] of workspaceAdapters) {
      if (now - entry.lastAccess > IDLE_TIMEOUT_MS) {
        entry.adapter.close?.();
        workspaceAdapters.delete(workspaceId);
      }
    }
  }, 60_000);
}
