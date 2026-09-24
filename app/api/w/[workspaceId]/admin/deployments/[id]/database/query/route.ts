/**
 * Workspace-Scoped Admin API: SQL Query Execution
 *
 * POST - Execute SQL query
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
    const { id: deploymentId } = await params;
    const body = await request.json();

    const { sql } = body;
    if (!sql || typeof sql !== 'string') {
      return NextResponse.json({ error: 'SQL query is required' }, { status: 400 });
    }

    const deployment = await adapter.getDeployment?.(deploymentId);
    if (!deployment) {
      return NextResponse.json({ error: 'Deployment not found' }, { status: 404 });
    }
    if (!deployment.databaseEnabled) {
      return NextResponse.json({ error: 'Deployment database not enabled' }, { status: 400 });
    }

    const deploymentDb = adapter.getDeploymentDatabaseForAnalytics(deploymentId);
    if (!deploymentDb) {
      return NextResponse.json({ error: 'Deployment database not available' }, { status: 500 });
    }

    try {
      // The guarded path, not `executeRawSQL`. This route is reachable by an editor, and the raw
      // one applies no system-table check: `edge_functions` holds the code the invocation route
      // runs and `secrets` is what the executor decrypts for it, so writing either from the SQL
      // editor is code execution. Those records are edited through Functions and Secrets, which
      // validate what they store.
      const result = deploymentDb.executeUserQuery(sql);
      if (result.error) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json({
        success: true,
        columns: result.columns,
        rows: result.rows,
        rowsAffected: result.rowsAffected,
        ...(result.truncated ? { truncated: true } : {}),
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
    logger.error('[Admin Database API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
