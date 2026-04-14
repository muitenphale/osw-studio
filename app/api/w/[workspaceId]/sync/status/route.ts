/**
 * Workspace-Scoped Sync Status API
 *
 * Returns updatedAt timestamps for all projects, skills, and templates on the server,
 * plus summary stats about the server database state.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceContext } from '@/lib/api/workspace-context';
import { getWorkspaceById } from '@/lib/auth/system-database';
import { logger } from '@/lib/utils';
import { Project, CustomTemplate } from '@/lib/vfs/types';
import { Skill } from '@/lib/vfs/skills/types';
import fs from 'fs';
import path from 'path';

function getDirSize(dir: string): number {
  let total = 0;
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      total += entry.isDirectory() ? getDirSize(p) : fs.statSync(p).size;
    }
  } catch {}
  return total;
}

interface ItemStatus {
  id: string;
  name: string;
  updatedAt: string;
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
    lastUpdated: string | null;
    isUninitialized: boolean;
  };
  quota: {
    projects: { used: number; max: number };
    deployments: { used: number; max: number };
    storage: { usedMb: number; maxMb: number };
  } | null;
}

function safeParseDate(value: Date | string | null | undefined, fallback: Date = new Date()): Date {
  if (!value) return fallback;
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? fallback : value;
  }
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? fallback : parsed;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { adapter, workspaceId } = await getWorkspaceContext(params, 'viewer');

    const projects = await adapter.listProjects() || [];
    const deployments = adapter.listDeployments ? await adapter.listDeployments() : [];
    const allSkills = await adapter.getAllSkills() || [];
    const customSkills = allSkills.filter((skill: Skill) => !skill.isBuiltIn);
    const templates = await adapter.getAllCustomTemplates() || [];

    const projectStatuses: ItemStatus[] = projects.map((project: Project) => {
      const updatedAt = safeParseDate(project.updatedAt);
      return {
        id: project.id,
        name: project.name,
        updatedAt: updatedAt.toISOString()
      };
    });

    const skillStatuses: ItemStatus[] = customSkills.map((skill: Skill) => {
      const updatedAt = safeParseDate(skill.updatedAt);
      return {
        id: skill.id,
        name: skill.name,
        updatedAt: updatedAt.toISOString()
      };
    });

    const templateStatuses: ItemStatus[] = templates.map((template: CustomTemplate) => {
      const updatedAt = safeParseDate(template.updatedAt || template.importedAt);
      return {
        id: template.id,
        name: template.name,
        updatedAt: updatedAt.toISOString()
      };
    });

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

    const workspace = getWorkspaceById(workspaceId);

    let storageMb = 0;
    try {
      const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
      const wsDir = path.join(dataDir, 'workspaces', workspaceId);
      let totalBytes = getDirSize(wsDir);
      // Also count published deployment static files (outside workspace dir)
      for (const dep of deployments) {
        const pubDir = path.join(process.cwd(), 'public', 'deployments', dep.id);
        totalBytes += getDirSize(pubDir);
      }
      storageMb = Math.round(totalBytes / (1024 * 1024) * 10) / 10;
    } catch {}

    logger.debug(`[API /api/w/[workspaceId]/sync/status] Fetched status for ${projectStatuses.length} projects, ${skillStatuses.length} skills, ${templateStatuses.length} templates, ${deployments.length} deployments`);

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
      quota: workspace ? {
        projects: { used: projects.length, max: workspace.max_projects },
        deployments: { used: deployments.length, max: workspace.max_deployments },
        storage: { usedMb: storageMb, maxMb: workspace.max_storage_mb },
      } : null,
    };

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && (error.message === 'Workspace access denied' || error.message === 'Insufficient workspace permissions')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    logger.error('[API /api/w/[workspaceId]/sync/status] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch sync status' },
      { status: 500 }
    );
  }
}
