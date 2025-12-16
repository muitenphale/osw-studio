/**
 * Sync Status API
 *
 * Returns updatedAt timestamps for all projects on the server,
 * plus summary stats about the server database state.
 * Used to detect which projects need syncing without fetching full data.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerAdapter } from '@/lib/vfs/adapters/server';
import { logger } from '@/lib/utils';
import { Project } from '@/lib/vfs/types';

interface ProjectStatus {
  id: string;
  updatedAt: string; // ISO string for JSON serialization
}

interface SyncStatusResponse {
  success: boolean;
  projects: ProjectStatus[];
  summary: {
    projectCount: number;
    siteCount: number;
    lastUpdated: string | null;  // Most recent project update
    isUninitialized: boolean;    // Server has no projects
  };
}

/**
 * GET /api/sync/status
 * Get timestamps for all server projects and summary stats
 */
export async function GET(request: NextRequest) {
  try {
    let adapter;
    try {
      adapter = await createServerAdapter();
    } catch (error) {
      logger.error('[API /api/sync/status] Server adapter initialization failed:', error);
      return NextResponse.json(
        { error: 'Server mode not configured. Check DATABASE_URL environment variable.' },
        { status: 500 }
      );
    }

    await adapter.init();

    // Get all projects (lightweight - just metadata)
    const projects = await adapter.listProjects();

    // Get all sites count
    const sites = adapter.listSites ? await adapter.listSites() : [];

    // Map to status objects with ISO timestamps
    const statuses: ProjectStatus[] = projects.map((project: Project) => {
      // Ensure updatedAt is a Date object
      let updatedAt: Date;

      if (project.updatedAt instanceof Date) {
        updatedAt = project.updatedAt;
      } else if (project.updatedAt) {
        updatedAt = new Date(project.updatedAt);
      } else {
        // Fallback to current time if updatedAt is missing
        updatedAt = new Date();
      }

      // Validate the date is valid
      if (isNaN(updatedAt.getTime())) {
        logger.warn(`[API /api/sync/status] Invalid date for project ${project.id}, using current time`);
        updatedAt = new Date();
      }

      return {
        id: project.id,
        updatedAt: updatedAt.toISOString()
      };
    });

    // Find most recent update
    let lastUpdated: string | null = null;
    if (statuses.length > 0) {
      const sortedStatuses = [...statuses].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
      lastUpdated = sortedStatuses[0].updatedAt;
    }

    logger.debug(`[API /api/sync/status] Fetched status for ${statuses.length} projects, ${sites.length} sites`);

    const response: SyncStatusResponse = {
      success: true,
      projects: statuses,
      summary: {
        projectCount: projects.length,
        siteCount: sites.length,
        lastUpdated,
        isUninitialized: projects.length === 0,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    logger.error('[API /api/sync/status] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch sync status' },
      { status: 500 }
    );
  }
}
