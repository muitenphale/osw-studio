import { NextRequest, NextResponse } from 'next/server';
import { getSQLiteAdapter } from '@/lib/vfs/adapters/server';
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

/**
 * GET /api/admin/deployments/[id]/server-context
 * Returns all server context files for a deployment
 *
 * File structure:
 * - /.server/secrets/{NAME}.json - individual secret files (SCREAMING_SNAKE_CASE)
 * - /.server/db/schema.sql - database schema (read-only)
 * - /.server/edge-functions/{name}.json - individual edge functions
 * - /.server/server-functions/{name}.json - individual server functions
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: deploymentId } = await context.params;

    const adapter = getSQLiteAdapter();
    await adapter.init();

    // Get deployment to verify it exists and get name
    const deployment = await adapter.getDeployment(deploymentId);
    if (!deployment) {
      return NextResponse.json({ error: 'Deployment not found' }, { status: 404 });
    }

    // Get deployment database
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

    // Secrets - individual files per secret
    const secrets = deploymentDb.listSecrets();
    for (const secret of secrets) {
      files.push({
        path: `/.server/secrets/${secret.name}.json`,
        content: generateSecretFile(secret),
        isReadOnly: false,
      });
    }

    // Edge functions - individual files
    const edgeFunctions = deploymentDb.listFunctions();
    for (const fn of edgeFunctions) {
      files.push({
        path: `/.server/edge-functions/${fn.name}.json`,
        content: generateEdgeFunctionFile(fn),
        isReadOnly: false,
      });
    }

    // Server functions - individual files
    const serverFunctions = deploymentDb.listServerFunctions();
    for (const fn of serverFunctions) {
      files.push({
        path: `/.server/server-functions/${fn.name}.json`,
        content: generateServerFunctionFile(fn),
        isReadOnly: false,
      });
    }

    // Scheduled functions - individual files
    const scheduledFunctions = deploymentDb.listScheduledFunctions();
    for (const fn of scheduledFunctions) {
      const edgeFn = deploymentDb.getFunction(fn.functionId);
      files.push({
        path: `/.server/scheduled-functions/${fn.name}.json`,
        content: generateScheduledFunctionFile(fn, edgeFn?.name ?? 'unknown'),
        isReadOnly: false,
      });
    }

    // Metadata for the orchestrator
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
    console.error('[API] Failed to get server context:', error);
    return NextResponse.json(
      { error: 'Failed to get server context' },
      { status: 500 }
    );
  }
}
