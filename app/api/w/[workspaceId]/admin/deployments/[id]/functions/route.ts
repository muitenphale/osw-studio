/**
 * Workspace-Scoped Admin API: Edge Functions Management
 *
 * GET  - List all functions
 * POST - Create a new function
 */

import { logger } from '@/lib/utils';
import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceContext } from '@/lib/api/workspace-context';
import { validateFunctionCode, validateFunctionName } from '@/lib/edge-functions/executor';
import { EdgeFunction } from '@/lib/vfs/types';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; id: string }> }
): Promise<NextResponse> {
  try {
    const { adapter } = await getWorkspaceContext(params, 'viewer');
    const { id: deploymentId } = await params;

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

    const functions = deploymentDb.listFunctions();

    return NextResponse.json({ functions });
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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; id: string }> }
): Promise<NextResponse> {
  try {
    const { adapter } = await getWorkspaceContext(params);
    const { id: deploymentId } = await params;
    const body = await request.json();

    if (!body.name) {
      return NextResponse.json({ error: 'Function name is required' }, { status: 400 });
    }
    if (!body.code) {
      return NextResponse.json({ error: 'Function code is required' }, { status: 400 });
    }

    const nameError = validateFunctionName(body.name);
    if (nameError) {
      return NextResponse.json({ error: nameError }, { status: 400 });
    }

    const codeError = validateFunctionCode(body.code);
    if (codeError) {
      return NextResponse.json({ error: codeError }, { status: 400 });
    }

    const validMethods: EdgeFunction['method'][] = ['GET', 'POST', 'PUT', 'DELETE', 'ANY'];
    const method = (body.method || 'ANY') as EdgeFunction['method'];
    if (!validMethods.includes(method)) {
      return NextResponse.json({ error: 'Invalid HTTP method' }, { status: 400 });
    }

    const timeoutMs = Math.min(Math.max(body.timeoutMs || 5000, 1000), 30000);

    const deployment = await adapter.getDeployment?.(deploymentId);
    if (!deployment) {
      return NextResponse.json({ error: 'Deployment not found' }, { status: 404 });
    }

    if (!deployment.databaseEnabled) {
      deployment.databaseEnabled = true;
      await adapter.enableDeploymentDatabase(deploymentId);
      await adapter.updateDeployment?.(deployment);
    }

    const deploymentDb = adapter.getDeploymentDatabaseForAnalytics(deploymentId);
    if (!deploymentDb) {
      return NextResponse.json({ error: 'Deployment database not available' }, { status: 500 });
    }

    const existing = deploymentDb.getFunctionByName(body.name);
    if (existing) {
      return NextResponse.json({ error: 'A function with this name already exists' }, { status: 409 });
    }

    const id = deploymentDb.createFunction({
      name: body.name,
      description: body.description || undefined,
      code: body.code,
      method,
      enabled: body.enabled !== false,
      timeoutMs,
    });

    const fn = deploymentDb.getFunction(id);

    return NextResponse.json({ function: fn }, { status: 201 });
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
