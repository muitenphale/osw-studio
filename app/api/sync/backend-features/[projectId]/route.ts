/**
 * Backend Features Sync API Route
 *
 * Handles syncing backend features between browser (IndexedDB) and server (core SQLite).
 * GET: Pull backend features for a project from server → browser
 * POST: Push backend features for a project from browser → server
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSQLiteAdapter } from '@/lib/vfs/adapters/server';
import { getCoreDatabase } from '@/lib/vfs/adapters/sqlite-connection';
import { requireAuth } from '@/lib/auth/session';
import type { EdgeFunction, ServerFunction, Secret, ScheduledFunction } from '@/lib/vfs/types';

interface BackendFeaturesPayload {
  edgeFunctions: EdgeFunction[];
  serverFunctions: ServerFunction[];
  secrets: Array<Secret & { value?: string }>;
  scheduledFunctions: ScheduledFunction[];
}

// GET /api/sync/backend-features/[projectId] - Pull backend features from server
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) {
  try {
    await requireAuth();

    const { projectId } = await context.params;

    const adapter = getSQLiteAdapter();
    await adapter.init();

    const edgeFunctions = adapter.listEdgeFunctions ? await adapter.listEdgeFunctions(projectId) : [];
    const serverFunctions = adapter.listServerFunctions ? await adapter.listServerFunctions(projectId) : [];
    const secrets = adapter.listSecrets ? await adapter.listSecrets(projectId) : [];
    const scheduledFunctions = adapter.listScheduledFunctions ? await adapter.listScheduledFunctions(projectId) : [];

    // Strip secret values before returning — only metadata should be synced to the client
    const safeSecrets = secrets.map(({ value, ...rest }) => rest);

    return NextResponse.json({
      edgeFunctions,
      serverFunctions,
      secrets: safeSecrets,
      scheduledFunctions,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.error('[API /api/sync/backend-features GET] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch backend features' },
      { status: 500 }
    );
  }
}

// POST /api/sync/backend-features/[projectId] - Push backend features to server
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) {
  try {
    await requireAuth();

    const { projectId } = await context.params;
    const body = await request.json() as BackendFeaturesPayload;

    const adapter = getSQLiteAdapter();
    await adapter.init();

    let edgeFunctionCount = 0;
    let serverFunctionCount = 0;
    let secretCount = 0;
    let scheduledFunctionCount = 0;

    // Wrap delete+create in a SQLite transaction to prevent data loss on failure
    const db = getCoreDatabase();
    const syncTransaction = db.transaction(() => {
      // Delete existing project backend features
      db.prepare('DELETE FROM project_edge_functions WHERE project_id = ?').run(projectId);
      db.prepare('DELETE FROM project_server_functions WHERE project_id = ?').run(projectId);
      db.prepare('DELETE FROM project_secrets WHERE project_id = ?').run(projectId);
      db.prepare('DELETE FROM project_scheduled_functions WHERE project_id = ?').run(projectId);

      // Re-create from payload
      if (body.edgeFunctions) {
        for (const fn of body.edgeFunctions) {
          db.prepare(`
            INSERT INTO project_edge_functions (id, project_id, name, description, code, method, enabled, timeout_ms, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(fn.id, projectId, fn.name, fn.description || null, fn.code, fn.method, fn.enabled ? 1 : 0, fn.timeoutMs || 5000, fn.createdAt?.toString() || new Date().toISOString(), fn.updatedAt?.toString() || new Date().toISOString());
          edgeFunctionCount++;
        }
      }

      if (body.serverFunctions) {
        for (const fn of body.serverFunctions) {
          db.prepare(`
            INSERT INTO project_server_functions (id, project_id, name, description, code, enabled, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(fn.id, projectId, fn.name, fn.description || null, fn.code, fn.enabled ? 1 : 0, fn.createdAt?.toString() || new Date().toISOString(), fn.updatedAt?.toString() || new Date().toISOString());
          serverFunctionCount++;
        }
      }

      if (body.secrets) {
        for (const secret of body.secrets) {
          db.prepare(`
            INSERT INTO project_secrets (id, project_id, name, description, value, has_value, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(secret.id, projectId, secret.name, secret.description || null, (secret as any).value || null, secret.hasValue ? 1 : 0, secret.createdAt?.toString() || new Date().toISOString(), secret.updatedAt?.toString() || new Date().toISOString());
          secretCount++;
        }
      }

      if (body.scheduledFunctions) {
        for (const fn of body.scheduledFunctions) {
          db.prepare(`
            INSERT INTO project_scheduled_functions (id, project_id, name, function_id, cron_expression, timezone, description, enabled, config, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(fn.id, projectId, fn.name, fn.functionId, fn.cronExpression, fn.timezone || 'UTC', fn.description || null, fn.enabled ? 1 : 0, JSON.stringify(fn.config || {}), fn.createdAt?.toString() || new Date().toISOString(), fn.updatedAt?.toString() || new Date().toISOString());
          scheduledFunctionCount++;
        }
      }
    });

    syncTransaction();

    return NextResponse.json({
      success: true,
      counts: {
        edgeFunctions: edgeFunctionCount,
        serverFunctions: serverFunctionCount,
        secrets: secretCount,
        scheduledFunctions: scheduledFunctionCount,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.error('[API /api/sync/backend-features POST] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to sync backend features' },
      { status: 500 }
    );
  }
}
