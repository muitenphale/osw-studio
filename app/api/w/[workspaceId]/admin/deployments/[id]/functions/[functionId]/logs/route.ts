/**
 * Workspace-Scoped Admin API: Function Execution Logs
 *
 * GET - Get function logs
 */

import { logger } from '@/lib/utils';
import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceContext } from '@/lib/api/workspace-context';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; id: string; functionId: string }> }
): Promise<NextResponse> {
  try {
    const { adapter } = await getWorkspaceContext(params, 'viewer');
    const { id: deploymentId, functionId } = await params;

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 1000);

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

    const fn = deploymentDb.getFunction(functionId);
    if (!fn) {
      return NextResponse.json({ error: 'Function not found' }, { status: 404 });
    }

    const logs = deploymentDb.getFunctionLogs(functionId, limit);

    return NextResponse.json({ logs });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && (error.message === 'Workspace access denied' || error.message === 'Insufficient workspace permissions')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    logger.error('[Admin Functions API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
