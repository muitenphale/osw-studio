/**
 * Workspace-Scoped Admin API: Server Context
 *
 * GET - Returns all server context files for a deployment
 */

import { logger } from '@/lib/utils';
import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceContext } from '@/lib/api/workspace-context';
import {
  generateEdgeFunctionFile,
  generateServerFunctionFile,
  generateSecretFile,
  generateScheduledFunctionFile,
} from '@/lib/vfs/server-context';

interface ServerContextFile {
  path: string;
  content: string;
  isReadOnly: boolean;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; id: string }> }
) {
  try {
    const { adapter } = await getWorkspaceContext(params, 'viewer');
    const { id: deploymentId } = await params;

    const deployment = await adapter.getDeployment(deploymentId);
    if (!deployment) {
      return NextResponse.json({ error: 'Deployment not found' }, { status: 404 });
    }

    const deploymentDb = adapter.getDeploymentDatabaseForAnalytics(deploymentId);
    if (!deploymentDb) {
      return NextResponse.json({ error: 'Deployment database not available' }, { status: 500 });
    }

    const files: ServerContextFile[] = [];

    // Database schema (read-only)
    files.push({
      path: '/.server/db/schema.sql',
      content: deploymentDb.getSchemaForExport(),
      isReadOnly: true,
    });

    // Secrets
    const secrets = deploymentDb.listSecrets();
    for (const secret of secrets) {
      files.push({
        path: `/.server/secrets/${secret.name}.json`,
        content: generateSecretFile(secret),
        isReadOnly: false,
      });
    }

    // Edge functions
    const edgeFunctions = deploymentDb.listFunctions();
    for (const fn of edgeFunctions) {
      files.push({
        path: `/.server/edge-functions/${fn.name}.json`,
        content: generateEdgeFunctionFile(fn),
        isReadOnly: false,
      });
    }

    // Server functions
    const serverFunctions = deploymentDb.listServerFunctions();
    for (const fn of serverFunctions) {
      files.push({
        path: `/.server/server-functions/${fn.name}.json`,
        content: generateServerFunctionFile(fn),
        isReadOnly: false,
      });
    }

    // Scheduled functions
    const scheduledFunctions = deploymentDb.listScheduledFunctions();
    for (const fn of scheduledFunctions) {
      const edgeFn = deploymentDb.getFunction(fn.functionId);
      files.push({
        path: `/.server/scheduled-functions/${fn.name}.json`,
        content: generateScheduledFunctionFile(fn, edgeFn?.name ?? 'unknown'),
        isReadOnly: false,
      });
    }

    const metadata = {
      projectId: deployment.projectId,
      runtimeDeploymentId: deploymentId,
      hasDatabase: true,
      edgeFunctionCount: edgeFunctions.filter(f => f.enabled).length,
      serverFunctionCount: serverFunctions.filter(f => f.enabled).length,
      secretCount: secrets.length,
      scheduledFunctionCount: scheduledFunctions.filter(f => f.enabled).length,
    };

    return NextResponse.json({ files, metadata });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && (error.message === 'Workspace access denied' || error.message === 'Insufficient workspace permissions')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    logger.error('[API] Failed to get server context:', error);
    return NextResponse.json(
      { error: 'Failed to get server context' },
      { status: 500 }
    );
  }
}
