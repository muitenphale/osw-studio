/**
 * Analytics Engagement Metrics API
 * GET /api/analytics/[siteId]/engagement - Fetch engagement metrics
 *
 * Query parameters:
 * - days: Number of days to look back (default: 30)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { getSQLiteAdapter } from '@/lib/vfs/adapters/server';

interface EngagementMetrics {
  timeOnPage: {
    average: number;
    median: number;
    distribution: Record<string, number>; // page -> avg time
  };
  scrollDepth: {
    average: number;
    milestones: Record<number, number>; // milestone -> count
  };
  exitPages: Array<{
    page: string;
    exitCount: number;
    exitRate: number;
  }>;
  topLandingPages: Array<{
    page: string;
    visitCount: number;
    bounceRate: number;
  }>;
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

    // Get engagement metrics from SiteDatabase
    const engagementData = siteDb.getEngagementMetrics(days);

    // Build engagement metrics response
    // Note: SQLite doesn't have PERCENTILE_CONT, so we approximate median with average
    const metrics: EngagementMetrics = {
      timeOnPage: {
        average: engagementData.avgTimeOnPage,
        median: engagementData.avgTimeOnPage, // Approximation
        distribution: {}, // Would need additional query for per-page breakdown
      },
      scrollDepth: {
        average: engagementData.avgScrollDepth,
        milestones: engagementData.scrollDepthDistribution,
      },
      exitPages: engagementData.exitPageCounts.map((item, index, array) => {
        const totalExits = array.reduce((sum, e) => sum + e.count, 0);
        return {
          page: item.page,
          exitCount: item.count,
          exitRate: totalExits > 0 ? item.count / totalExits : 0,
        };
      }),
      topLandingPages: [], // Would need additional query for landing pages with bounce rate
    };

    return NextResponse.json(metrics);
  } catch (error) {
    console.error('[Analytics Engagement API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch engagement metrics' },
      { status: 500 }
    );
  }
}
