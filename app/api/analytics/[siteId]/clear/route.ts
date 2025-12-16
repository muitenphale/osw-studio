/**
 * Analytics Data Clearing API
 * DELETE /api/analytics/[siteId]/clear - Clear analytics data
 *
 * Query parameters:
 * - type: all | pageviews | interactions | sessions (default: all)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { getSQLiteAdapter } from '@/lib/vfs/adapters/server';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  try {
    // Require authentication
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { siteId } = await params;
    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type') || 'all';

    // Validate type parameter
    const validTypes = ['all', 'pageviews', 'interactions', 'sessions'];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: 'Invalid type parameter. Must be one of: all, pageviews, interactions, sessions' },
        { status: 400 }
      );
    }

    const adapter = getSQLiteAdapter();
    await adapter.init();

    // Verify site exists (from core database)
    const site = await adapter.getSite(siteId);
    if (!site) {
      return NextResponse.json(
        { error: 'Site not found' },
        { status: 404 }
      );
    }

    // Get site database for analytics
    const siteDb = adapter.getSiteDatabaseForAnalytics(siteId);
    if (!siteDb) {
      return NextResponse.json(
        { error: 'Site database not enabled' },
        { status: 404 }
      );
    }

    // Get counts before clearing for reporting
    const beforeCounts = siteDb.getAnalyticsStorageInfo();

    // Clear analytics data based on type
    if (type === 'all') {
      siteDb.clearAnalytics();
    } else {
      siteDb.clearAnalytics(type as 'pageviews' | 'interactions' | 'sessions');
    }

    // Get counts after clearing
    const afterCounts = siteDb.getAnalyticsStorageInfo();

    const deletedCounts = {
      pageviews: beforeCounts.pageviewCount - afterCounts.pageviewCount,
      interactions: beforeCounts.interactionCount - afterCounts.interactionCount,
      sessions: beforeCounts.sessionCount - afterCounts.sessionCount,
    };

    return NextResponse.json({
      success: true,
      message: 'Analytics data cleared successfully',
      deleted: deletedCounts,
    });
  } catch (error) {
    console.error('[Analytics Clear API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to clear analytics data' },
      { status: 500 }
    );
  }
}
