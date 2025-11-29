/**
 * Adapter Factory
 *
 * Creates the appropriate storage adapter based on environment configuration.
 * Browser mode: IndexedDBAdapter only
 * Server mode: IndexedDBAdapter for working storage (server uses PostgresAdapter via API)
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
 * Returns PostgresAdapter configured with DATABASE_URL from environment
 *
 * NOTE: This function uses dynamic import to avoid bundling postgres in client code
 */
export async function createServerAdapter(): Promise<StorageAdapter> {
  // Dynamic import to avoid bundling server-only code in client
  const { PostgresAdapter } = await import('./postgres-adapter');

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable not set. Required for Server mode.');
  }
  return new PostgresAdapter(databaseUrl);
}
