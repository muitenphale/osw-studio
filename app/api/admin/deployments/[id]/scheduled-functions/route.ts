/**
 * Admin API: Scheduled Functions Management
 *
 * GET  /api/admin/deployments/[id]/scheduled-functions - List all scheduled functions
 * POST /api/admin/deployments/[id]/scheduled-functions - Create a new scheduled function
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getSQLiteAdapter } from '@/lib/vfs/adapters/server';
import { validateFunctionName } from '@/lib/edge-functions/executor';
import cronParser from 'cron-parser';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET - List all scheduled functions for a deployment
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    await requireAuth();
    const { id: deploymentId } = await params;

    const adapter = getSQLiteAdapter();
    await adapter.init();

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

    const scheduledFunctions = deploymentDb.listScheduledFunctions();
    return NextResponse.json({ scheduledFunctions });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[Admin Scheduled Functions API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST - Create a new scheduled function
 */
export async function POST(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    await requireAuth();
    const { id: deploymentId } = await params;
    const body = await request.json();

    // Validate required fields
    if (!body.name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }
    if (!body.functionId) {
      return NextResponse.json({ error: 'functionId is required' }, { status: 400 });
    }
    if (!body.cronExpression) {
      return NextResponse.json({ error: 'cronExpression is required' }, { status: 400 });
    }

    // Validate name (URL-safe)
    const nameError = validateFunctionName(body.name);
    if (nameError) {
      return NextResponse.json({ error: nameError }, { status: 400 });
    }

    // Validate cronExpression
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

    // Validate timezone
    const timezone = body.timezone || 'UTC';
    try {
      Intl.DateTimeFormat(undefined, { timeZone: timezone });
    } catch {
      return NextResponse.json({ error: `Invalid timezone: ${timezone}` }, { status: 400 });
    }

    // Validate description length
    if (body.description && body.description.length > 500) {
      return NextResponse.json({ error: 'Description must be 500 characters or less' }, { status: 400 });
    }

    // Validate config (must be object, not array, not null, max 64KB)
    if (body.config !== undefined) {
      if (typeof body.config !== 'object' || body.config === null || Array.isArray(body.config)) {
        return NextResponse.json({ error: 'config must be a plain object' }, { status: 400 });
      }
      if (JSON.stringify(body.config).length > 65536) {
        return NextResponse.json({ error: 'config must be less than 64KB' }, { status: 400 });
      }
    }

    const adapter = getSQLiteAdapter();
    await adapter.init();

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

    // Validate functionId exists
    const edgeFn = deploymentDb.getFunction(body.functionId);
    if (!edgeFn) {
      return NextResponse.json({ error: 'Edge function not found' }, { status: 404 });
    }

    // Check limit (max 50 per deployment)
    const allScheduled = deploymentDb.listScheduledFunctions();
    if (allScheduled.length >= 50) {
      return NextResponse.json({ error: 'Maximum of 50 scheduled functions per deployment' }, { status: 400 });
    }

    // Check duplicate name
    const existing = deploymentDb.getScheduledFunctionByName(body.name);
    if (existing) {
      return NextResponse.json({ error: 'A scheduled function with this name already exists' }, { status: 409 });
    }

    // Calculate nextRunAt
    let nextRunAt: Date | undefined;
    try {
      const interval = cronParser.parseExpression(body.cronExpression, { tz: timezone, currentDate: new Date() });
      nextRunAt = interval.next().toDate();
    } catch {
      // If we can't calculate, leave undefined
    }

    const id = deploymentDb.createScheduledFunction({
      name: body.name,
      description: body.description || undefined,
      functionId: body.functionId,
      cronExpression: body.cronExpression,
      timezone,
      config: body.config || {},
      enabled: body.enabled !== false,
      nextRunAt,
    });

    const scheduledFunction = deploymentDb.getScheduledFunction(id);
    return NextResponse.json({ scheduledFunction }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[Admin Scheduled Functions API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
