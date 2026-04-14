/**
 * Admin Workspace Repair API
 * POST /api/admin/workspaces/[id]/repair — detect and fix data issues
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, verifyInstanceApiKey } from '@/lib/auth/session';
import { getWorkspaceById } from '@/lib/auth/system-database';
import { repairWorkspace } from '@/lib/auth/default-workspace';

export async function POST(
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
    const workspace = getWorkspaceById(id);
    if (!workspace) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }

    const result = repairWorkspace(id);

    return NextResponse.json({
      success: true,
      repaired: result,
      summary: [
        result.legacyDbMigrated ? 'Migrated legacy database to workspace' : null,
        result.legacyProjectsMigrated > 0 ? `Migrated ${result.legacyProjectsMigrated} project database(s)` : null,
        result.deploymentRoutesCreated > 0 ? `Created ${result.deploymentRoutesCreated} deployment route(s)` : null,
        result.errors.length > 0 ? `${result.errors.length} error(s) occurred` : null,
      ].filter(Boolean),
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to repair workspace' }, { status: 500 });
  }
}
