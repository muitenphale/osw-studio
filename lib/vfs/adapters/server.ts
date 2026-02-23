/**
 * Server-only adapter factory
 *
 * This module is marked server-only to prevent bundling in client code.
 * Uses SQLite for persistence (data/osws.sqlite for core, deployments/{id}/ for analytics + runtime)
 */

import 'server-only';

import { StorageAdapter } from './types';
import { SQLiteAdapter } from './sqlite-adapter';

// Singleton instance for the server adapter
let adapterInstance: SQLiteAdapter | null = null;

/**
 * Create storage adapter for server-side usage (Server mode only)
 * Returns SQLiteAdapter singleton
 */
export async function createServerAdapter(): Promise<StorageAdapter> {
  if (!adapterInstance) {
    adapterInstance = new SQLiteAdapter();
  }
  return adapterInstance;
}

/**
 * Get the SQLiteAdapter instance directly (for analytics access)
 * This allows API routes to access deployment-specific analytics methods
 */
export function getSQLiteAdapter(): SQLiteAdapter {
  if (!adapterInstance) {
    adapterInstance = new SQLiteAdapter();
  }
  return adapterInstance;
}
