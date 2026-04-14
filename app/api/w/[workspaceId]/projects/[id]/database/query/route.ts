/**
 * Workspace-Scoped Project Database Query API
 *
 * POST - Execute SQL query against project database
 */

import { logger } from '@/lib/utils';
import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceContext } from '@/lib/api/workspace-context';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; id: string }> }
): Promise<NextResponse> {
  try {
    const { adapter } = await getWorkspaceContext(params);
    const { id: projectId } = await params;
    const body = await request.json();

    const { sql } = body;
    if (!sql || typeof sql !== 'string') {
      return NextResponse.json({ error: 'SQL query is required' }, { status: 400 });
    }

    const projectDb = adapter.getProjectDatabase(projectId);

    try {
      const trimmedUpper = sql.trim().toUpperCase();

      // Block dangerous statements
      const BLOCKED = ['ATTACH', 'DETACH', 'PRAGMA', 'VACUUM'];
      if (BLOCKED.some(kw => trimmedUpper.startsWith(kw))) {
        return NextResponse.json({ error: `${trimmedUpper.split(/\s/)[0]} statements are not allowed` }, { status: 400 });
      }

      // DDL
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
    if (error instanceof Error && (error.message === 'Workspace access denied' || error.message === 'Insufficient workspace permissions')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    logger.error('[Project Database API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
