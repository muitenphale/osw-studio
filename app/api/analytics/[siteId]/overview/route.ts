/**
 * Analytics Overview API
 * GET /api/analytics/[siteId]/overview - Fetch overview analytics
 *
 * Query parameters:
 * - days: Number of days to look back (default: 30)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { getSQLiteAdapter } from '@/lib/vfs/adapters/server';

interface AnalyticsOverview {
  totalPageviews: number;
  uniqueVisitors: number;
  averageTimeOnSite: number;
  bounceRate: number;
  topPages: Array<{ page: string; views: number }>;
  topReferrers: Array<{ referrer: string; count: number }>;
  deviceBreakdown: Record<string, number>;
  countryBreakdown: Record<string, number>;
}

export async function GET(
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
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '30', 10);

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

    // Get overview stats from SiteDatabase
    const overviewStats = siteDb.getOverviewStats(days);
    const basicStats = siteDb.getStats(days);

    // Build response
    const overview: AnalyticsOverview = {
      totalPageviews: overviewStats.totalPageviews,
      uniqueVisitors: overviewStats.uniqueSessions,
      averageTimeOnSite: overviewStats.avgSessionDuration,
      bounceRate: overviewStats.bounceRate / 100, // Convert from percentage
      topPages: basicStats.topPages.map((p) => ({
        page: p.path,
        views: p.views,
      })),
      topReferrers: basicStats.topReferrers,
      deviceBreakdown: overviewStats.deviceBreakdown.reduce((acc, item) => {
        acc[item.device] = item.count;
        return acc;
      }, {} as Record<string, number>),
      countryBreakdown: {}, // Country tracking not implemented yet
    };

    return NextResponse.json(overview);
  } catch (error) {
    console.error('[Analytics Overview API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch analytics overview' },
      { status: 500 }
    );
  }
}
