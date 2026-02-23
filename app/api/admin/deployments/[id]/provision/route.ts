/**
 * Admin API: Bulk Deployment Template Provisioning
 *
 * POST /api/admin/deployments/[id]/provision - Provision all backend features from a deployment template
 *
 * Accepts a BackendFeatures object and creates all backend infrastructure
 * (database schema, edge functions, server functions, secret placeholders) in one request.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getSQLiteAdapter } from '@/lib/vfs/adapters/server';
import { BackendFeatures } from '@/lib/vfs/types';
import cronParser from 'cron-parser';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST - Provision backend features for a deployment from a template
 */
export async function POST(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    await requireAuth();
    const { id: deploymentId } = await params;
    const body = await request.json();

    const backendFeatures = body.backendFeatures as BackendFeatures | undefined;
    if (!backendFeatures) {
      return NextResponse.json({ error: 'backendFeatures is required' }, { status: 400 });
    }

    const adapter = getSQLiteAdapter();
    await adapter.init();

    // Check deployment exists
    const deployment = await adapter.getDeployment?.(deploymentId);
    if (!deployment) {
      return NextResponse.json({ error: 'Deployment not found' }, { status: 404 });
    }

    // 1. Enable deployment database
    if (!deployment.databaseEnabled) {
      deployment.databaseEnabled = true;
      await adapter.enableDeploymentDatabase(deploymentId);
      await adapter.updateDeployment?.(deployment);
    }

    const deploymentDb = adapter.getDeploymentDatabaseForAnalytics(deploymentId);
    if (!deploymentDb) {
      return NextResponse.json({ error: 'Deployment database not available' }, { status: 500 });
    }

    const provisioned = {
      edgeFunctions: 0,
      serverFunctions: 0,
      secrets: 0,
      scheduledFunctions: 0,
      databaseSchemaApplied: false,
    };

    // 2. Execute DDL schema (before functions so tables exist for queries)
    if (backendFeatures.databaseSchema) {
      deploymentDb.executeDDL(backendFeatures.databaseSchema);
      provisioned.databaseSchemaApplied = true;
    }

    // 3. Create edge functions (skip duplicates)
    if (backendFeatures.edgeFunctions) {
      for (const fn of backendFeatures.edgeFunctions) {
        const existing = deploymentDb.getFunctionByName(fn.name);
        if (existing) continue;

        deploymentDb.createFunction({
          name: fn.name,
          description: fn.description,
          code: fn.code,
          method: fn.method || 'ANY',
          enabled: fn.enabled !== false,
          timeoutMs: fn.timeoutMs || 5000,
        });
        provisioned.edgeFunctions++;
      }
    }

    // 4. Create server functions (skip duplicates)
    if (backendFeatures.serverFunctions) {
      for (const fn of backendFeatures.serverFunctions) {
        const existing = deploymentDb.getServerFunctionByName(fn.name);
        if (existing) continue;

        deploymentDb.createServerFunction({
          name: fn.name,
          description: fn.description,
          code: fn.code,
          enabled: fn.enabled !== false,
        });
        provisioned.serverFunctions++;
      }
    }

    // 5. Create secret placeholders (skip duplicates)
    if (backendFeatures.secrets) {
      for (const secret of backendFeatures.secrets) {
        const existing = deploymentDb.getSecretByName(secret.name);
        if (existing) continue;

        deploymentDb.createSecretPlaceholder(secret.name, secret.description);
        provisioned.secrets++;
      }
    }

    // 6. Create scheduled functions (skip duplicates, must resolve edge function names)
    let scheduledFunctionsCount = 0;
    if (backendFeatures.scheduledFunctions) {
      for (const sf of backendFeatures.scheduledFunctions) {
        const existing = deploymentDb.getScheduledFunctionByName(sf.name);
        if (existing) continue;

        // Resolve functionName -> functionId
        const edgeFn = deploymentDb.getFunctionByName(sf.functionName);
        if (!edgeFn) {
          console.warn(`[Admin Provision API] Skipping scheduled function "${sf.name}": edge function "${sf.functionName}" not found`);
          continue;
        }

        let nextRunAt: Date | undefined;
        try {
          const interval = cronParser.parseExpression(sf.cronExpression, { tz: sf.timezone || 'UTC', currentDate: new Date() });
          nextRunAt = interval.next().toDate();
        } catch {
          // Leave undefined
        }

        deploymentDb.createScheduledFunction({
          name: sf.name,
          description: sf.description,
          functionId: edgeFn.id,
          cronExpression: sf.cronExpression,
          timezone: sf.timezone || 'UTC',
          config: sf.config || {},
          enabled: sf.enabled !== false,
          nextRunAt,
        });
        scheduledFunctionsCount++;
      }
    }
    provisioned.scheduledFunctions = scheduledFunctionsCount;

    return NextResponse.json({ provisioned }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[Admin Provision API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
