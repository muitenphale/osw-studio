/**
 * Admin Workspace Detail API
 * GET  /api/admin/workspaces/[id] — workspace detail with members
 * PUT  /api/admin/workspaces/[id] — update workspace (name, quotas)
 * DELETE /api/admin/workspaces/[id] — delete workspace
 */

import { NextRequest, NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { requireAuth, verifyInstanceApiKey } from '@/lib/auth/session';
import {
  getWorkspaceById,
  updateWorkspace,
  deleteWorkspace,
  getSystemDatabase,
  getWorkspaceProjectCount,
  removeDeploymentRoute,
} from '@/lib/auth/system-database';
import { getWorkspaceAdapter, closeWorkspaceAdapter } from '@/lib/vfs/adapters/server';
import { cleanStaticDeployment } from '@/lib/compiler/static-builder';
import { regenerateInstanceCaddy } from '@/lib/caddy/regenerate';
import { logger } from '@/lib/utils';

function getWorkspaceDeploymentCount(workspaceId: string): number {
  try {
    const sysDb = getSystemDatabase();
    const row = sysDb.prepare('SELECT COUNT(*) as count FROM deployment_routing WHERE workspace_id = ?').get(workspaceId) as { count: number };
    return row.count;
  } catch { return 0; }
}

interface DeploymentInfo {
  id: string;
  slug: string | null;
  customDomain: string | null;
}

function getWorkspaceDeployments(workspaceId: string): DeploymentInfo[] {
  try {
    const sysDb = getSystemDatabase();
    return (sysDb.prepare(
      'SELECT deployment_id, slug, custom_domain FROM deployment_routing WHERE workspace_id = ? ORDER BY slug'
    ).all(workspaceId) as { deployment_id: string; slug: string | null; custom_domain: string | null }[])
      .map(r => ({ id: r.deployment_id, slug: r.slug, customDomain: r.custom_domain }));
  } catch { return []; }
}

interface ProjectInfo {
  id: string;
  name: string;
  updatedAt: string;
}

function getWorkspaceProjects(workspaceId: string): ProjectInfo[] {
  try {
    const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
    const dbPath = path.join(dataDir, 'workspaces', workspaceId, 'osws.sqlite');
    if (!fs.existsSync(dbPath)) return [];
    const db = new Database(dbPath, { readonly: true });
    const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='projects'").get();
    if (!tableExists) { db.close(); return []; }
    const rows = db.prepare('SELECT id, name, updated_at FROM projects ORDER BY updated_at DESC').all() as { id: string; name: string; updated_at: string }[];
    db.close();
    return rows.map(r => ({ id: r.id, name: r.name, updatedAt: r.updated_at }));
  } catch { return []; }
}

interface WorkspaceMember {
  userId: string;
  email: string;
  displayName: string | null;
  role: string;
  joinedAt: string;
}

function getWorkspaceMembers(workspaceId: string): WorkspaceMember[] {
  try {
    const sysDb = getSystemDatabase();
    const rows = sysDb.prepare(`
      SELECT wa.user_id, wa.role, wa.created_at as joined_at,
             u.email, u.display_name
      FROM workspace_access wa
      JOIN users u ON u.id = wa.user_id
      WHERE wa.workspace_id = ?
      ORDER BY wa.created_at ASC
    `).all(workspaceId) as {
      user_id: string;
      role: string;
      joined_at: string;
      email: string;
      display_name: string | null;
    }[];

    return rows.map(r => ({
      userId: r.user_id,
      email: r.email,
      displayName: r.display_name,
      role: r.role,
      joinedAt: r.joined_at,
    }));
  } catch { return []; }
}

function getOwnerEmail(ownerId: string): string | null {
  try {
    const sysDb = getSystemDatabase();
    const row = sysDb.prepare('SELECT email FROM users WHERE id = ?').get(ownerId) as { email: string } | undefined;
    return row?.email ?? null;
  } catch { return null; }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const apiSession = verifyInstanceApiKey(request);
    const session = apiSession || await requireAuth();
    if (!session.isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { id } = await params;
    const ws = getWorkspaceById(id);
    if (!ws) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }

    return NextResponse.json({
      id: ws.id,
      name: ws.name,
      ownerId: ws.owner_id,
      ownerEmail: getOwnerEmail(ws.owner_id),
      maxProjects: ws.max_projects,
      maxDeployments: ws.max_deployments,
      maxStorageMb: ws.max_storage_mb,
      projectCount: getWorkspaceProjectCount(ws.id),
      deploymentCount: getWorkspaceDeploymentCount(ws.id),
      createdAt: ws.created_at,
      updatedAt: ws.updated_at,
      members: getWorkspaceMembers(ws.id),
      projects: getWorkspaceProjects(ws.id),
      deployments: getWorkspaceDeployments(ws.id),
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to get workspace' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const apiSession = verifyInstanceApiKey(request);
    const session = apiSession || await requireAuth();
    if (!session.isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { id } = await params;
    const ws = getWorkspaceById(id);
    if (!ws) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }

    const body = await request.json();

    updateWorkspace(id, {
      name: body.name,
      max_projects: body.maxProjects,
      max_deployments: body.maxDeployments,
      max_storage_mb: body.maxStorageMb,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to update workspace' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const apiSession = verifyInstanceApiKey(request);
    const session = apiSession || await requireAuth();
    if (!session.isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { id } = await params;
    const ws = getWorkspaceById(id);
    if (!ws) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }

    // Published output first, while the workspace database can still say what it published.
    //
    // Deleting only the workspace directory leaves `public/deployments/{id}/` in place, and those
    // files stay on disk and stay served: a deleted workspace's sites would keep answering, and
    // its content would outlive it. Deleting a single deployment already does this (static output,
    // routing, per-deployment databases), so the workspace case does the same for each of them.
    let hadCustomDomain = false;
    try {
      const adapter = getWorkspaceAdapter(id);
      await adapter.init();
      const deployments = (await adapter.listDeployments?.()) ?? [];
      for (const deployment of deployments) {
        // Each one on its own, so a deployment that cannot be cleaned does not take the rest with
        // it. Sharing a single try meant one failure left every later deployment on disk and still
        // being served, which is the state this is here to prevent.
        try {
          hadCustomDomain = hadCustomDomain || !!deployment.customDomain;
          await cleanStaticDeployment(deployment.id);
          removeDeploymentRoute(deployment.id);
          await adapter.deleteDeployment?.(deployment.id);
        } catch (error) {
          logger.error(`[API /api/admin/workspaces] Failed to clean up deployment ${deployment.id}:`, error);
        }
      }
    } catch (error) {
      logger.error('[API /api/admin/workspaces] Failed to list deployments before delete:', error);
    }

    // Released before the directory goes, or the cached adapter keeps a handle on a deleted file.
    closeWorkspaceAdapter(id);

    deleteWorkspace(id);

    // Clean up workspace data directory
    const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
    const workspaceDir = path.join(dataDir, 'workspaces', id);
    try {
      if (fs.existsSync(workspaceDir)) {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
      }
    } catch {
      // Filesystem cleanup failure is non-fatal
    }

    if (hadCustomDomain) {
      regenerateInstanceCaddy().catch(() => {});
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to delete workspace' }, { status: 500 });
  }
}
