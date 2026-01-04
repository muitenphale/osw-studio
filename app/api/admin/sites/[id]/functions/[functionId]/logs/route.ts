/**
 * Admin API: Function Execution Logs
 *
 * GET /api/admin/sites/[id]/functions/[functionId]/logs - Get function logs
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getSQLiteAdapter } from '@/lib/vfs/adapters/server';

interface RouteParams {
  params: Promise<{ id: string; functionId: string }>;
}

/**
 * GET - Get function execution logs
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    await requireAuth();
    const { id: siteId, functionId } = await params;

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

    // Check function exists
    const fn = siteDb.getFunction(functionId);
    if (!fn) {
      return NextResponse.json({ error: 'Function not found' }, { status: 404 });
    }

    const logs = siteDb.getFunctionLogs(functionId, limit);

    return NextResponse.json({ logs });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[Admin Functions API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
