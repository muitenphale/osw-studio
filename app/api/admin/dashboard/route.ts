/**
 * Admin Dashboard API
 *
 * GET /api/admin/dashboard - Get all dashboard statistics in a single call
 *
 * Returns system info, content counts, hosting stats, and traffic metrics.
 * Protected by admin authentication.
 */

import { NextResponse } from 'next/server';
import { verifySession } from '@/lib/auth/session';
import { cookies } from 'next/headers';
import { getCoreDatabase } from '@/lib/vfs/adapters/sqlite-connection';
import { getRequestStats, cleanupOldLogs } from '@/lib/logging/request-logger';
import { promises as fs } from 'fs';
import path from 'path';

// Read version from package.json
async function getVersion(): Promise<string> {
  try {
    const packagePath = path.join(process.cwd(), 'package.json');
    const content = await fs.readFile(packagePath, 'utf-8');
    const pkg = JSON.parse(content);
    return pkg.version || 'unknown';
  } catch {
    return 'unknown';
  }
}

// Calculate directory size recursively
async function getDirectorySize(dirPath: string): Promise<number> {
  let totalSize = 0;

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        totalSize += await getDirectorySize(entryPath);
      } else if (entry.isFile()) {
        const stat = await fs.stat(entryPath);
        totalSize += stat.size;
      }
    }
  } catch {
    // Directory doesn't exist or not accessible
  }

  return totalSize;
}

// Count SQLite files in sites directory
async function countSiteDatabases(): Promise<number> {
  const sitesDir = path.join(process.cwd(), 'sites');
  let count = 0;

  try {
    const entries = await fs.readdir(sitesDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const dbPath = path.join(sitesDir, entry.name, 'site.sqlite');
        try {
          await fs.access(dbPath);
          count++;
        } catch {
          // No database for this site
        }
      }
    }
  } catch {
    // Sites directory doesn't exist
  }

  return count;
}

export async function GET() {
  try {
    // Verify admin authentication
    const cookieStore = await cookies();
    const token = cookieStore.get('osw_session')?.value;

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const session = await verifySession(token);
    if (!session || !session.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get database connection
    const db = getCoreDatabase();

    // Clean up old logs (7 days retention)
    cleanupOldLogs(7);

    // Gather all statistics in parallel where possible
    const [
      version,
      projectCount,
      templateCount,
      skillCount,
      fileCount,
      publishedSiteCount,
      sitesWithDb,
      storageSize,
      trafficStats,
    ] = await Promise.all([
      getVersion(),
      Promise.resolve((db.prepare('SELECT COUNT(*) as count FROM projects').get() as { count: number }).count),
      Promise.resolve((db.prepare('SELECT COUNT(*) as count FROM custom_templates').get() as { count: number }).count),
      Promise.resolve((db.prepare('SELECT COUNT(*) as count FROM skills').get() as { count: number }).count),
      Promise.resolve((db.prepare('SELECT COUNT(*) as count FROM files').get() as { count: number }).count),
      Promise.resolve((db.prepare('SELECT COUNT(*) as count FROM sites WHERE published_at IS NOT NULL').get() as { count: number }).count),
      countSiteDatabases(),
      getDirectorySize(path.join(process.cwd(), 'public', 'sites')),
      Promise.resolve(getRequestStats(24)),
    ]);

    // Get site names for top sites
    const topSitesWithNames = trafficStats.topSites.map((site) => {
      const siteInfo = db.prepare('SELECT name FROM sites WHERE id = ?').get(site.siteId) as { name: string } | undefined;
      return {
        ...site,
        siteName: siteInfo?.name || site.siteId.substring(0, 8),
      };
    });

    // System info
    const memoryUsage = process.memoryUsage();

    return NextResponse.json({
      system: {
        version,
        nodeVersion: process.version,
        uptime: process.uptime(),
        memoryUsed: memoryUsage.heapUsed,
        memoryTotal: memoryUsage.heapTotal,
      },
      content: {
        projects: projectCount,
        templates: templateCount,
        skills: skillCount,
        totalFiles: fileCount,
      },
      hosting: {
        publishedSites: publishedSiteCount,
        sitesWithDb,
        storageUsed: storageSize,
      },
      traffic: {
        requestsLastHour: trafficStats.requestsLastHour,
        requestsLastDay: trafficStats.requestsLastDay,
        errorCount: trafficStats.errorCount,
        topSites: topSitesWithNames,
        recentErrors: trafficStats.recentErrors,
      },
    });

  } catch (error) {
    console.error('[Dashboard API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dashboard data' },
      { status: 500 }
    );
  }
}
