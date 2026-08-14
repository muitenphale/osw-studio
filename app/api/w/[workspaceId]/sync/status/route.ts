/**
 * Workspace-Scoped Sync Status API
 *
 * Returns updatedAt timestamps for all projects, skills, and templates on the server,
 * plus summary stats about the server database state.
 *
 * Uses lightweight summary queries (id, name, updatedAt only) instead of loading
 * full objects. Disk usage is cached for 60 seconds to avoid repeated filesystem walks.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceContext } from '@/lib/api/workspace-context';
import { getWorkspaceById } from '@/lib/auth/system-database';
import { logger } from '@/lib/utils';
import { combinedDirectorySize } from '@/lib/api/directory-size';
import path from 'path';
import { deploymentStaticDir } from '@/lib/compiler/deployment-static-dir';

const storageSizeCache = new Map<string, { mb: number; ts: number }>();
const STORAGE_CACHE_TTL = 60_000;

function getCachedStorageMb(workspaceId: string, deploymentIds: string[]): number {
  const cached = storageSizeCache.get(workspaceId);
  if (cached && Date.now() - cached.ts < STORAGE_CACHE_TTL) {
    return cached.mb;
  }
  let totalBytes = 0;
  try {
    const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
    const wsDir = path.join(dataDir, 'workspaces', workspaceId);
    // Measured as one total so a blob a deployment links to the project is counted once, not
    // once per deployment serving it.
    totalBytes = combinedDirectorySize([wsDir, ...deploymentIds.map(deploymentStaticDir)]);
  } catch {}
  const mb = Math.round(totalBytes / (1024 * 1024) * 10) / 10;
  storageSizeCache.set(workspaceId, { mb, ts: Date.now() });
  return mb;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { adapter, workspaceId } = await getWorkspaceContext(params, 'viewer');

    const projects = adapter.listProjectSummaries();
    const skills = adapter.listSkillSummaries();
    const templates = adapter.listTemplateSummaries();
    const modelTemplates = adapter.listModelTemplateSummaries();
    const interviewTemplates = adapter.listInterviewTemplateSummaries();
    const deploymentCount = adapter.countDeployments();

    const allTimestamps = [
      ...projects.map(p => p.updatedAt),
      ...skills.map(s => s.updatedAt),
      ...templates.map(t => t.updatedAt),
      ...modelTemplates.map(t => t.updatedAt),
      ...interviewTemplates.map(t => t.updatedAt),
    ];

    let lastUpdated: string | null = null;
    if (allTimestamps.length > 0) {
      allTimestamps.sort((a, b) => (b > a ? 1 : b < a ? -1 : 0));
      lastUpdated = allTimestamps[0];
    }

    const workspace = getWorkspaceById(workspaceId);

    let quota = null;
    if (workspace) {
      const deploymentIds = adapter.listDeployments
        ? (await adapter.listDeployments()).map(d => d.id)
        : [];
      const storageMb = getCachedStorageMb(workspaceId, deploymentIds);
      quota = {
        projects: { used: projects.length, max: workspace.max_projects },
        deployments: { used: deploymentCount, max: workspace.max_deployments },
        storage: { usedMb: storageMb, maxMb: workspace.max_storage_mb },
      };
    }

    return NextResponse.json({
      success: true,
      projects,
      skills,
      templates,
      modelTemplates,
      interviewTemplates,
      summary: {
        projectCount: projects.length,
        skillCount: skills.length,
        templateCount: templates.length,
        modelTemplateCount: modelTemplates.length,
        interviewTemplateCount: interviewTemplates.length,
        deploymentCount,
        lastUpdated,
        isUninitialized: projects.length === 0,
      },
      quota,
    });
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
