/**
 * Server-only adapter factory
 *
 * This module is marked server-only to prevent bundling in client code
 */

import 'server-only';

import { StorageAdapter } from './types';
import { PostgresAdapter } from './postgres-adapter';

/**
 * Create storage adapter for server-side usage (Server mode only)
 * Returns PostgresAdapter configured with DATABASE_URL from environment
 */
export async function createServerAdapter(): Promise<StorageAdapter> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable not set. Required for Server mode.');
  }
  return new PostgresAdapter(databaseUrl);
}
