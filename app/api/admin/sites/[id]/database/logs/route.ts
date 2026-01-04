/**
 * Admin API: All Function Logs
 *
 * GET    /api/admin/sites/[id]/database/logs - Get recent logs for all functions
 * DELETE /api/admin/sites/[id]/database/logs - Clear logs
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getSQLiteAdapter } from '@/lib/vfs/adapters/server';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET - Get recent logs for all functions
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    await requireAuth();
    const { id: siteId } = await params;

    // Get query params
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 1000);

    const adapter = getSQLiteAdapter();
    await adapter.init();

    // Check site exists and database enabled
    const site = await adapter.getSite?.(siteId);
    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }
    if (!site.databaseEnabled) {
      return NextResponse.json({ error: 'Site database not enabled' }, { status: 400 });
    }

    const siteDb = adapter.getSiteDatabaseForAnalytics(siteId);
    if (!siteDb) {
      return NextResponse.json({ error: 'Site database not available' }, { status: 500 });
    }

    const logs = siteDb.getRecentLogs(limit);

    // Also get function names for display
    const functions = siteDb.listFunctions();
    const functionMap = Object.fromEntries(functions.map(f => [f.id, f.name]));

    // Enrich logs with function names
    const enrichedLogs = logs.map(log => ({
      ...log,
      functionName: functionMap[log.functionId] || 'Unknown',
    }));

    return NextResponse.json({ logs: enrichedLogs });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[Admin Database API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE - Clear function logs
 */
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    await requireAuth();
    const { id: siteId } = await params;

    // Get query params for optional filtering
    const { searchParams } = new URL(request.url);
    const functionId = searchParams.get('functionId') || undefined;

    const adapter = getSQLiteAdapter();
    await adapter.init();

    // Check site exists and database enabled
    const site = await adapter.getSite?.(siteId);
    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }
    if (!site.databaseEnabled) {
      return NextResponse.json({ error: 'Site database not enabled' }, { status: 400 });
    }

    const siteDb = adapter.getSiteDatabaseForAnalytics(siteId);
    if (!siteDb) {
      return NextResponse.json({ error: 'Site database not available' }, { status: 500 });
    }

    siteDb.clearFunctionLogs(functionId);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[Admin Database API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
