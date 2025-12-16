/**
 * Adapter Factory
 *
 * Creates the appropriate storage adapter based on environment configuration.
 * Browser mode: IndexedDBAdapter only
 * Server mode: IndexedDBAdapter for working storage (server uses SQLiteAdapter via API)
 */

import { StorageAdapter } from './types';
import { IndexedDBAdapter } from './indexeddb-adapter';

/**
 * Create storage adapter for client-side usage
 * Always returns IndexedDBAdapter (browser working storage)
 */
export function createClientAdapter(): StorageAdapter {
  return new IndexedDBAdapter();
}

/**
 * Create storage adapter for server-side usage (Server mode only)
 * Returns SQLiteAdapter configured to use data/osws.sqlite
 *
 * NOTE: This function uses dynamic import to avoid bundling sqlite in client code
 */
export async function createServerAdapter(): Promise<StorageAdapter> {
  // Dynamic import to avoid bundling server-only code in client
  const { SQLiteAdapter } = await import('./sqlite-adapter');
  return new SQLiteAdapter();
}
