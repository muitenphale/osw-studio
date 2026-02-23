/**
 * Project Database Query API
 *
 * POST /api/projects/[id]/database/query - Execute SQL query against project database
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
 * POST - Execute SQL query
 */
export async function POST(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    await requireAuth();
    const { id: projectId } = await params;
    const body = await request.json();

    const { sql } = body;
    if (!sql || typeof sql !== 'string') {
      return NextResponse.json({ error: 'SQL query is required' }, { status: 400 });
    }

    const adapter = getSQLiteAdapter();
    await adapter.init();

    const projectDb = adapter.getProjectDatabase(projectId);

    try {
      const trimmedUpper = sql.trim().toUpperCase();

      // Block dangerous statements that could escape the project database sandbox
      const BLOCKED = ['ATTACH', 'DETACH', 'PRAGMA', 'VACUUM'];
      if (BLOCKED.some(kw => trimmedUpper.startsWith(kw))) {
        return NextResponse.json({ error: `${trimmedUpper.split(/\s/)[0]} statements are not allowed` }, { status: 400 });
      }

      // DDL (CREATE, ALTER, DROP) — use exec for multi-statement
      if (trimmedUpper.startsWith('CREATE') || trimmedUpper.startsWith('ALTER') || trimmedUpper.startsWith('DROP')) {
        projectDb.executeDDL(sql);
        return NextResponse.json({
          success: true,
          columns: [],
          rows: [],
          rowsAffected: 0,
        });
      }

      const result = projectDb.executeRawSQL(sql);
      return NextResponse.json({
        success: true,
        columns: result.columns,
        rows: result.rows,
        rowsAffected: result.rowsAffected,
      });
    } catch (sqlError) {
      const message = sqlError instanceof Error ? sqlError.message : 'Query failed';
      return NextResponse.json({ error: message }, { status: 400 });
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[Project Database API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
