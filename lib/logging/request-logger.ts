/**
 * Request Logger
 *
 * Lightweight logging for deployment traffic hitting the origin server.
 * Used for the admin dashboard to monitor traffic patterns and detect anomalies.
 *
 * Features:
 * - Fire-and-forget async inserts (don't block responses)
 * - IP anonymization via hashing
 * - Automatic log retention cleanup
 */

import { createHash } from 'crypto';

// Lazy-loaded database connection
let db: ReturnType<typeof import('../vfs/adapters/sqlite-connection').getCoreDatabase> | null = null;

/**
 * Get database connection lazily
 */
function getDB() {
  if (!db) {
    // Dynamic import to avoid issues in non-server contexts
    const { getCoreDatabase } = require('../vfs/adapters/sqlite-connection');
    db = getCoreDatabase();
  }
  return db;
}

/**
 * Hash IP address for privacy
 * Uses first 8 chars of SHA-256 hash - enough for grouping, not reversible
 */
function hashIP(ip: string): string {
  if (!ip || ip === 'unknown') return 'unknown';
  return createHash('sha256').update(ip).digest('hex').substring(0, 8);
}

/**
 * Log a request to the database
 * Fire-and-forget - don't await this in route handlers
 */
export function logRequest(data: {
  deploymentId: string;
  path: string;
  statusCode: number;
  ip: string;
  userAgent: string;
}): void {
  try {
    const database = getDB();
    if (!database) return;

    const ipHash = hashIP(data.ip);

    // Truncate user agent to prevent bloat
    const userAgent = data.userAgent?.substring(0, 255) || '';

    database.prepare(`
      INSERT INTO request_log (site_id, path, status_code, ip_hash, user_agent, timestamp)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).run(data.deploymentId, data.path, data.statusCode, ipHash, userAgent);
  } catch (error) {
    // Silently fail - logging should never break the app
    console.error('[RequestLogger] Failed to log request:', error);
  }
}

/**
 * Get request statistics for dashboard
 */
export function getRequestStats(hoursBack: number = 24): {
  requestsLastHour: number;
  requestsLastDay: number;
  errorCount: number;
  topDeployments: Array<{ deploymentId: string; count: number }>;
  recentErrors: Array<{ deploymentId: string; path: string; statusCode: number; timestamp: string }>;
} {
  try {
    const database = getDB();
    if (!database) {
      return {
        requestsLastHour: 0,
        requestsLastDay: 0,
        errorCount: 0,
        topDeployments: [],
        recentErrors: [],
      };
    }

    // Requests in last hour
    const lastHour = database.prepare(`
      SELECT COUNT(*) as count FROM request_log
      WHERE timestamp > datetime('now', '-1 hour')
    `).get() as { count: number };

    // Requests in last 24 hours
    const lastDay = database.prepare(`
      SELECT COUNT(*) as count FROM request_log
      WHERE timestamp > datetime('now', '-24 hours')
    `).get() as { count: number };

    // Error count (4xx and 5xx) in last 24 hours
    const errors = database.prepare(`
      SELECT COUNT(*) as count FROM request_log
      WHERE timestamp > datetime('now', '-24 hours')
      AND status_code >= 400
    `).get() as { count: number };

    // Top deployments by request count in last 24 hours
    const topDeployments = database.prepare(`
      SELECT site_id as deploymentId, COUNT(*) as count FROM request_log
      WHERE timestamp > datetime('now', '-24 hours')
      GROUP BY site_id
      ORDER BY count DESC
      LIMIT 10
    `).all() as Array<{ deploymentId: string; count: number }>;

    // Recent errors
    const recentErrors = database.prepare(`
      SELECT site_id as deploymentId, path, status_code as statusCode, timestamp FROM request_log
      WHERE status_code >= 400
      ORDER BY timestamp DESC
      LIMIT 10
    `).all() as Array<{ deploymentId: string; path: string; statusCode: number; timestamp: string }>;

    return {
      requestsLastHour: lastHour.count,
      requestsLastDay: lastDay.count,
      errorCount: errors.count,
      topDeployments,
      recentErrors,
    };
  } catch (error) {
    console.error('[RequestLogger] Failed to get stats:', error);
    return {
      requestsLastHour: 0,
      requestsLastDay: 0,
      errorCount: 0,
      topDeployments: [],
      recentErrors: [],
    };
  }
}

/**
 * Clean up old request logs to prevent unbounded growth
 * Keeps logs from the last N days
 */
export function cleanupOldLogs(daysToKeep: number = 7): number {
  try {
    const database = getDB();
    if (!database) return 0;

    const result = database.prepare(`
      DELETE FROM request_log
      WHERE timestamp < datetime('now', '-' || ? || ' days')
    `).run(daysToKeep);

    return result.changes;
  } catch (error) {
    console.error('[RequestLogger] Failed to cleanup logs:', error);
    return 0;
  }
}
