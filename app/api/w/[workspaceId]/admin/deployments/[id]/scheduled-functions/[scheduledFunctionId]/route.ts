/**
 * Workspace-Scoped Admin API: Single Scheduled Function Operations
 *
 * GET    - Get details
 * PUT    - Update
 * DELETE - Delete
 */

import { logger } from '@/lib/utils';
import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceContext } from '@/lib/api/workspace-context';
import { validateFunctionName } from '@/lib/edge-functions/executor';
import cronParser from 'cron-parser';
import { ScheduledFunction } from '@/lib/vfs/types';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; id: string; scheduledFunctionId: string }> }
): Promise<NextResponse> {
  try {
    const { adapter } = await getWorkspaceContext(params, 'viewer');
    const { id: deploymentId, scheduledFunctionId } = await params;

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

    const fn = deploymentDb.getScheduledFunction(scheduledFunctionId);
    if (!fn) {
      return NextResponse.json({ error: 'Scheduled function not found' }, { status: 404 });
    }

    return NextResponse.json({ scheduledFunction: fn });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && (error.message === 'Workspace access denied' || error.message === 'Insufficient workspace permissions')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    logger.error('[Admin Scheduled Functions API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; id: string; scheduledFunctionId: string }> }
): Promise<NextResponse> {
  try {
    const { adapter } = await getWorkspaceContext(params);
    const { id: deploymentId, scheduledFunctionId } = await params;
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

    const existing = deploymentDb.getScheduledFunction(scheduledFunctionId);
    if (!existing) {
      return NextResponse.json({ error: 'Scheduled function not found' }, { status: 404 });
    }

    const updates: Partial<ScheduledFunction> = {};

    if (body.name !== undefined && body.name !== existing.name) {
      const nameError = validateFunctionName(body.name);
      if (nameError) {
        return NextResponse.json({ error: nameError }, { status: 400 });
      }
      const duplicate = deploymentDb.getScheduledFunctionByName(body.name);
      if (duplicate && duplicate.id !== scheduledFunctionId) {
        return NextResponse.json({ error: 'A scheduled function with this name already exists' }, { status: 409 });
      }
      updates.name = body.name;
    }

    if (body.functionId !== undefined) {
      const edgeFn = deploymentDb.getFunction(body.functionId);
      if (!edgeFn) {
        return NextResponse.json({ error: 'Edge function not found' }, { status: 404 });
      }
      updates.functionId = body.functionId;
    }

    if (body.cronExpression !== undefined) {
      try {
        const interval = cronParser.parseExpression(body.cronExpression);
        const first = interval.next().toDate().getTime();
        const second = interval.next().toDate().getTime();
        if (second - first < 5 * 60 * 1000 - 1000) {
          return NextResponse.json({ error: 'Minimum interval is 5 minutes' }, { status: 400 });
        }
      } catch {
        return NextResponse.json({ error: 'Invalid cron expression' }, { status: 400 });
      }
      updates.cronExpression = body.cronExpression;
    }

    if (body.timezone !== undefined) {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: body.timezone });
      } catch {
        return NextResponse.json({ error: `Invalid timezone: ${body.timezone}` }, { status: 400 });
      }
      updates.timezone = body.timezone;
    }

    if (body.description !== undefined) {
      if (body.description && body.description.length > 500) {
        return NextResponse.json({ error: 'Description must be 500 characters or less' }, { status: 400 });
      }
      updates.description = body.description;
    }

    if (body.config !== undefined) {
      if (typeof body.config !== 'object' || body.config === null || Array.isArray(body.config)) {
        return NextResponse.json({ error: 'config must be a plain object' }, { status: 400 });
      }
      if (JSON.stringify(body.config).length > 65536) {
        return NextResponse.json({ error: 'config must be less than 64KB' }, { status: 400 });
      }
      updates.config = body.config;
    }

    if (body.enabled !== undefined) {
      updates.enabled = body.enabled;
    }

    // Recalculate nextRunAt if cronExpression or timezone changed
    if (updates.cronExpression !== undefined || updates.timezone !== undefined) {
      const cron = updates.cronExpression || existing.cronExpression;
      const tz = updates.timezone || existing.timezone;
      try {
        const interval = cronParser.parseExpression(cron, { tz, currentDate: new Date() });
        updates.nextRunAt = interval.next().toDate();
      } catch {
        // Leave unchanged
      }
    }

    if (Object.keys(updates).length > 0) {
      deploymentDb.updateScheduledFunction(scheduledFunctionId, updates);
    }

    const fn = deploymentDb.getScheduledFunction(scheduledFunctionId);
    return NextResponse.json({ scheduledFunction: fn });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && (error.message === 'Workspace access denied' || error.message === 'Insufficient workspace permissions')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    logger.error('[Admin Scheduled Functions API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; id: string; scheduledFunctionId: string }> }
): Promise<NextResponse> {
  try {
    const { adapter } = await getWorkspaceContext(params);
    const { id: deploymentId, scheduledFunctionId } = await params;

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

    const fn = deploymentDb.getScheduledFunction(scheduledFunctionId);
    if (!fn) {
      return NextResponse.json({ error: 'Scheduled function not found' }, { status: 404 });
    }

    deploymentDb.deleteScheduledFunction(scheduledFunctionId);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && (error.message === 'Workspace access denied' || error.message === 'Insufficient workspace permissions')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    logger.error('[Admin Scheduled Functions API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
