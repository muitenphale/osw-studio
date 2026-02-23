/**
 * Admin API: Single Edge Function Operations
 *
 * GET    /api/admin/deployments/[id]/functions/[functionId] - Get function details
 * PUT    /api/admin/deployments/[id]/functions/[functionId] - Update function
 * DELETE /api/admin/deployments/[id]/functions/[functionId] - Delete function
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getSQLiteAdapter } from '@/lib/vfs/adapters/server';
import { validateFunctionCode, validateFunctionName } from '@/lib/edge-functions/executor';
import { EdgeFunction } from '@/lib/vfs/types';

interface RouteParams {
  params: Promise<{ id: string; functionId: string }>;
}

/**
 * GET - Get function details
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    await requireAuth();
    const { id: deploymentId, functionId } = await params;

    const adapter = getSQLiteAdapter();
    await adapter.init();

    // Check deployment exists and database enabled
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

    return NextResponse.json({ function: fn });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[Admin Functions API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PUT - Update function
 */
export async function PUT(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    await requireAuth();
    const { id: deploymentId, functionId } = await params;
    const body = await request.json();

    const adapter = getSQLiteAdapter();
    await adapter.init();

    // Check deployment exists and database enabled
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

    // Check function exists
    const existing = deploymentDb.getFunction(functionId);
    if (!existing) {
      return NextResponse.json({ error: 'Function not found' }, { status: 404 });
    }

    // Build updates object
    const updates: Partial<EdgeFunction> = {};

    // Validate and add name if provided
    if (body.name !== undefined && body.name !== existing.name) {
      const nameError = validateFunctionName(body.name);
      if (nameError) {
        return NextResponse.json({ error: nameError }, { status: 400 });
      }
      // Check for duplicate name
      const duplicate = deploymentDb.getFunctionByName(body.name);
      if (duplicate && duplicate.id !== functionId) {
        return NextResponse.json({ error: 'A function with this name already exists' }, { status: 409 });
      }
      updates.name = body.name;
    }

    // Validate and add code if provided
    if (body.code !== undefined) {
      const codeError = validateFunctionCode(body.code);
      if (codeError) {
        return NextResponse.json({ error: codeError }, { status: 400 });
      }
      updates.code = body.code;
    }

    // Add other fields
    if (body.description !== undefined) {
      updates.description = body.description;
    }

    if (body.method !== undefined) {
      const validMethods: EdgeFunction['method'][] = ['GET', 'POST', 'PUT', 'DELETE', 'ANY'];
      if (!validMethods.includes(body.method)) {
        return NextResponse.json({ error: 'Invalid HTTP method' }, { status: 400 });
      }
      updates.method = body.method;
    }

    if (body.enabled !== undefined) {
      updates.enabled = body.enabled;
    }

    if (body.timeoutMs !== undefined) {
      updates.timeoutMs = Math.min(Math.max(body.timeoutMs, 1000), 30000);
    }

    // Apply updates
    if (Object.keys(updates).length > 0) {
      deploymentDb.updateFunction(functionId, updates);
    }

    const fn = deploymentDb.getFunction(functionId);

    return NextResponse.json({ function: fn });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[Admin Functions API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE - Delete function
 */
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    await requireAuth();
    const { id: deploymentId, functionId } = await params;

    const adapter = getSQLiteAdapter();
    await adapter.init();

    // Check deployment exists and database enabled
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

    // Check function exists
    const fn = deploymentDb.getFunction(functionId);
    if (!fn) {
      return NextResponse.json({ error: 'Function not found' }, { status: 404 });
    }

    // Delete the function (this will cascade delete logs due to foreign key)
    deploymentDb.deleteFunction(functionId);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[Admin Functions API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
