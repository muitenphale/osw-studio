/**
 * Workspace-Scoped Admin API: Single Server Function Operations
 *
 * GET    - Get function details
 * PUT    - Update function
 * DELETE - Delete function
 */

import { logger } from '@/lib/utils';
import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceContext } from '@/lib/api/workspace-context';
import { validateFunctionCode, validateServerFunctionName } from '@/lib/edge-functions/executor';
import { ServerFunction } from '@/lib/vfs/types';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; id: string; functionId: string }> }
): Promise<NextResponse> {
  try {
    const { adapter } = await getWorkspaceContext(params, 'viewer');
    const { id: deploymentId, functionId } = await params;

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

    const fn = deploymentDb.getServerFunction(functionId);
    if (!fn) {
      return NextResponse.json({ error: 'Server function not found' }, { status: 404 });
    }

    return NextResponse.json({ function: fn });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && (error.message === 'Workspace access denied' || error.message === 'Insufficient workspace permissions')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    logger.error('[Admin Server Functions API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; id: string; functionId: string }> }
): Promise<NextResponse> {
  try {
    const { adapter } = await getWorkspaceContext(params);
    const { id: deploymentId, functionId } = await params;
    const body = await request.json();

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

    const existing = deploymentDb.getServerFunction(functionId);
    if (!existing) {
      return NextResponse.json({ error: 'Server function not found' }, { status: 404 });
    }

    const updates: Partial<ServerFunction> = {};

    if (body.name !== undefined && body.name !== existing.name) {
      const nameError = validateServerFunctionName(body.name);
      if (nameError) {
        return NextResponse.json({ error: nameError }, { status: 400 });
      }
      const duplicate = deploymentDb.getServerFunctionByName(body.name);
      if (duplicate && duplicate.id !== functionId) {
        return NextResponse.json({ error: 'A server function with this name already exists' }, { status: 409 });
      }
      updates.name = body.name;
    }

    if (body.code !== undefined) {
      const codeError = validateFunctionCode(body.code);
      if (codeError) {
        return NextResponse.json({ error: codeError }, { status: 400 });
      }
      updates.code = body.code;
    }

    if (body.description !== undefined) {
      updates.description = body.description;
    }

    if (body.enabled !== undefined) {
      updates.enabled = body.enabled;
    }

    if (Object.keys(updates).length > 0) {
      deploymentDb.updateServerFunction(functionId, updates);
    }

    const fn = deploymentDb.getServerFunction(functionId);

    return NextResponse.json({ function: fn });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && (error.message === 'Workspace access denied' || error.message === 'Insufficient workspace permissions')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    logger.error('[Admin Server Functions API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; id: string; functionId: string }> }
): Promise<NextResponse> {
  try {
    const { adapter } = await getWorkspaceContext(params);
    const { id: deploymentId, functionId } = await params;

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

    const fn = deploymentDb.getServerFunction(functionId);
    if (!fn) {
      return NextResponse.json({ error: 'Server function not found' }, { status: 404 });
    }

    deploymentDb.deleteServerFunction(functionId);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && (error.message === 'Workspace access denied' || error.message === 'Insufficient workspace permissions')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    logger.error('[Admin Server Functions API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
