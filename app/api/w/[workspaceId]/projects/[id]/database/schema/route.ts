/**
 * Workspace-Scoped Project Database Schema API
 *
 * GET - Get project database schema
 */

import { logger } from '@/lib/utils';
import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceContext } from '@/lib/api/workspace-context';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; id: string }> }
): Promise<NextResponse> {
  try {
    const { adapter } = await getWorkspaceContext(params, 'viewer');
    const { id: projectId } = await params;

    const projectDb = adapter.getProjectDatabase(projectId);
    const tables = projectDb.getTableSchema();

    return NextResponse.json({ tables });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && (error.message === 'Workspace access denied' || error.message === 'Insufficient workspace permissions')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    logger.error('[Project Database API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
