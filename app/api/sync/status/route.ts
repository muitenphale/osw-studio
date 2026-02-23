/**
 * Sync Status API
 *
 * Returns updatedAt timestamps for all projects, skills, and templates on the server,
 * plus summary stats about the server database state.
 * Used to detect which items need syncing without fetching full data.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerAdapter } from '@/lib/vfs/adapters/server';
import { logger } from '@/lib/utils';
import { Project, CustomTemplate } from '@/lib/vfs/types';
import { Skill } from '@/lib/vfs/skills/types';

interface ItemStatus {
  id: string;
  name: string;
  updatedAt: string; // ISO string for JSON serialization
}

interface SyncStatusResponse {
  success: boolean;
  projects: ItemStatus[];
  skills: ItemStatus[];
  templates: ItemStatus[];
  summary: {
    projectCount: number;
    skillCount: number;
    templateCount: number;
    deploymentCount: number;
    lastUpdated: string | null;  // Most recent update across all items
    isUninitialized: boolean;    // Server has no projects
  };
}

/**
 * Helper to safely parse a date from various formats
 */
function safeParseDate(value: Date | string | null | undefined, fallback: Date = new Date()): Date {
  if (!value) return fallback;
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? fallback : value;
  }
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? fallback : parsed;
}

/**
 * GET /api/sync/status
 * Get timestamps for all server projects, skills, templates and summary stats
 */
export async function GET(_request: NextRequest) {
  try {
    let adapter;
    try {
      adapter = await createServerAdapter();
    } catch (error) {
      logger.error('[API /api/sync/status] Server adapter initialization failed:', error);
      return NextResponse.json(
        { error: 'Server mode not configured. Set NEXT_PUBLIC_SERVER_MODE=true to enable.' },
        { status: 500 }
      );
    }

    await adapter.init();

    // Get all projects (lightweight - just metadata)
    const projects = await adapter.listProjects() || [];

    // Get all deployments count
    const deployments = adapter.listDeployments ? await adapter.listDeployments() : [];

    // Get all custom skills (excluding built-in)
    const allSkills = await adapter.getAllSkills() || [];
    const customSkills = allSkills.filter((skill: Skill) => !skill.isBuiltIn);

    // Get all custom templates
    const templates = await adapter.getAllCustomTemplates() || [];

    // Map projects to status objects with ISO timestamps
    const projectStatuses: ItemStatus[] = projects.map((project: Project) => {
      const updatedAt = safeParseDate(project.updatedAt);
      return {
        id: project.id,
        name: project.name,
        updatedAt: updatedAt.toISOString()
      };
    });

    // Map skills to status objects
    const skillStatuses: ItemStatus[] = customSkills.map((skill: Skill) => {
      const updatedAt = safeParseDate(skill.updatedAt);
      return {
        id: skill.id,
        name: skill.name,
        updatedAt: updatedAt.toISOString()
      };
    });

    // Map templates to status objects
    const templateStatuses: ItemStatus[] = templates.map((template: CustomTemplate) => {
      // Use updatedAt if available, otherwise importedAt
      const updatedAt = safeParseDate(template.updatedAt || template.importedAt);
      return {
        id: template.id,
        name: template.name,
        updatedAt: updatedAt.toISOString()
      };
    });

    // Find most recent update across all items
    const allTimestamps = [
      ...projectStatuses.map(p => p.updatedAt),
      ...skillStatuses.map(s => s.updatedAt),
      ...templateStatuses.map(t => t.updatedAt),
    ];

    let lastUpdated: string | null = null;
    if (allTimestamps.length > 0) {
      const sortedTimestamps = [...allTimestamps].sort(
        (a, b) => new Date(b).getTime() - new Date(a).getTime()
      );
      lastUpdated = sortedTimestamps[0];
    }

    logger.debug(`[API /api/sync/status] Fetched status for ${projectStatuses.length} projects, ${skillStatuses.length} skills, ${templateStatuses.length} templates, ${deployments.length} deployments`);

    const response: SyncStatusResponse = {
      success: true,
      projects: projectStatuses,
      skills: skillStatuses,
      templates: templateStatuses,
      summary: {
        projectCount: projects.length,
        skillCount: customSkills.length,
        templateCount: templates.length,
        deploymentCount: deployments.length,
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
