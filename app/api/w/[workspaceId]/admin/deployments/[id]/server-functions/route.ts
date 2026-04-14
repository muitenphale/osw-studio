/**
 * Workspace-Scoped Admin API: Server Functions Management
 *
 * GET  - List all server functions
 * POST - Create a new server function
 */

import { logger } from '@/lib/utils';
import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceContext } from '@/lib/api/workspace-context';
import { validateFunctionCode, validateServerFunctionName } from '@/lib/edge-functions/executor';

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

    const functions = deploymentDb.listServerFunctions();

    return NextResponse.json({ functions });
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

    const nameError = validateServerFunctionName(body.name);
    if (nameError) {
      return NextResponse.json({ error: nameError }, { status: 400 });
    }

    const codeError = validateFunctionCode(body.code);
    if (codeError) {
      return NextResponse.json({ error: codeError }, { status: 400 });
    }

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

    const existing = deploymentDb.getServerFunctionByName(body.name);
    if (existing) {
      return NextResponse.json({ error: 'A server function with this name already exists' }, { status: 409 });
    }

    const id = deploymentDb.createServerFunction({
      name: body.name,
      description: body.description || undefined,
      code: body.code,
      enabled: body.enabled !== false,
    });

    const fn = deploymentDb.getServerFunction(id);

    return NextResponse.json({ function: fn }, { status: 201 });
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
