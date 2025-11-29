/**
 * Singleton Postgres Connection Pool
 *
 * Maintains a single shared connection pool across all requests
 * to avoid the overhead of creating new connections on every API call.
 */

import postgres from 'postgres';

let pool: postgres.Sql | null = null;
let currentConnectionString: string | null = null;

/**
 * Get or create the shared Postgres connection pool
 */
export function getPostgresPool(connectionString: string): postgres.Sql {
  // If pool exists and connection string matches, reuse it
  if (pool && currentConnectionString === connectionString) {
    return pool;
  }

  // Close existing pool if connection string changed
  if (pool && currentConnectionString !== connectionString) {
    pool.end({ timeout: 0 }).catch(console.error);
  }

  // Create new pool
  pool = postgres(connectionString, {
    max: 10, // Connection pool size
    idle_timeout: 20,
    connect_timeout: 10,
  });

  currentConnectionString = connectionString;
  return pool;
}

/**
 * Close the connection pool (for cleanup/testing)
 */
export async function closePostgresPool(): Promise<void> {
  if (pool) {
    await pool.end({ timeout: 5 });
    pool = null;
    currentConnectionString = null;
  }
}
