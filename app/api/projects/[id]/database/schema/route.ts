/**
 * Project Database Schema API
 *
 * GET /api/projects/[id]/database/schema - Get project database schema
 *
 * Note: No project existence check in core SQLite — the project database
 * is standalone at data/projects/{projectId}/database.sqlite and the project
 * may only exist in IndexedDB (not yet synced to server).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getSQLiteAdapter } from '@/lib/vfs/adapters/server';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET - Get project database schema (tables and columns)
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    await requireAuth();
    const { id: projectId } = await params;

    const adapter = getSQLiteAdapter();
    await adapter.init();

    const projectDb = adapter.getProjectDatabase(projectId);
    const tables = projectDb.getTableSchema();

    return NextResponse.json({ tables });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[Project Database API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
