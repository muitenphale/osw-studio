/**
 * Analytics Dashboard API
 * GET /api/analytics/[siteId] - Get analytics data for a site
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSQLiteAdapter } from '@/lib/vfs/adapters/server';

export interface AnalyticsStats {
  totalPageviews: number;
  uniqueVisitors: number;
  topPages: Array<{ path: string; views: number }>;
  topReferrers: Array<{ referrer: string; views: number }>;
  countries: Array<{ country: string; views: number }>;
  pageviewsOverTime: Array<{ date: string; views: number }>;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  try {
    const { siteId } = await params;

    // Get date range from query params (default: last 30 days)
    const searchParams = request.nextUrl.searchParams;
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

    // Get analytics stats
    const analyticsStats = siteDb.getStats(days);
    const topPages = siteDb.getTopPages(days, 10);
    const topReferrers = siteDb.getTopReferrers(days, 10);
    const pageviewsOverTime = siteDb.getPageviewsOverTime(days);

    // Note: Country tracking not implemented yet
    const countries: Array<{ country: string; views: number }> = [];

    const stats: AnalyticsStats = {
      totalPageviews: analyticsStats.totalPageviews,
      uniqueVisitors: analyticsStats.uniqueSessions,
      topPages,
      topReferrers: topReferrers.map(r => ({ referrer: r.referrer, views: r.count })),
      countries,
      pageviewsOverTime: pageviewsOverTime.map(p => ({ date: p.date, views: p.views })),
    };

    return NextResponse.json(stats);
  } catch (error) {
    console.error('[Analytics API] Error fetching analytics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch analytics' },
      { status: 500 }
    );
  }
}
