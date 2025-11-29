/**
 * Analytics Dashboard API
 * GET /api/analytics/[siteId] - Get analytics data for a site
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerAdapter } from '@/lib/vfs/adapters/server';
import { PostgresAdapter } from '@/lib/vfs/adapters/postgres-adapter';

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

    const adapter = await createServerAdapter();

    // Only PostgresAdapter supports analytics
    if (!(adapter instanceof PostgresAdapter)) {
      return NextResponse.json(
        { error: 'Analytics requires Server Mode (PostgreSQL)' },
        { status: 503 }
      );
    }

    await adapter.init();

    // Verify site exists
    const site = await adapter.getSite?.(siteId);
    if (!site) {
      await adapter.close?.();
      return NextResponse.json(
        { error: 'Site not found' },
        { status: 404 }
      );
    }

    const sql = adapter.getSQL();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Total pageviews
    const totalResult = await sql<[{ count: string }]>`
      SELECT COUNT(*)::integer as count
      FROM pageviews
      WHERE site_id = ${siteId}
        AND timestamp >= ${startDate}
    `;
    const totalPageviews = parseInt(totalResult[0]?.count || '0', 10);

    // Unique visitors
    const uniqueResult = await sql<[{ count: string }]>`
      SELECT COUNT(DISTINCT session_id)::integer as count
      FROM pageviews
      WHERE site_id = ${siteId}
        AND timestamp >= ${startDate}
    `;
    const uniqueVisitors = parseInt(uniqueResult[0]?.count || '0', 10);

    // Top pages
    const topPagesResult = await sql<Array<{ page_path: string; count: string }>>`
      SELECT page_path, COUNT(*)::integer as count
      FROM pageviews
      WHERE site_id = ${siteId}
        AND timestamp >= ${startDate}
      GROUP BY page_path
      ORDER BY count DESC
      LIMIT 10
    `;
    const topPages = topPagesResult.map(row => ({
      path: row.page_path,
      views: parseInt(row.count, 10),
    }));

    // Top referrers (excluding empty/null)
    const topReferrersResult = await sql<Array<{ referrer: string; count: string }>>`
      SELECT referrer, COUNT(*)::integer as count
      FROM pageviews
      WHERE site_id = ${siteId}
        AND timestamp >= ${startDate}
        AND referrer IS NOT NULL
        AND referrer != ''
      GROUP BY referrer
      ORDER BY count DESC
      LIMIT 10
    `;
    const topReferrers = topReferrersResult.map(row => ({
      referrer: row.referrer,
      views: parseInt(row.count, 10),
    }));

    // Countries (if available)
    const countriesResult = await sql<Array<{ country: string; count: string }>>`
      SELECT country, COUNT(*)::integer as count
      FROM pageviews
      WHERE site_id = ${siteId}
        AND timestamp >= ${startDate}
        AND country IS NOT NULL
      GROUP BY country
      ORDER BY count DESC
      LIMIT 10
    `;
    const countries = countriesResult.map(row => ({
      country: row.country,
      views: parseInt(row.count, 10),
    }));

    // Pageviews over time (daily)
    const timeSeriesResult = await sql<Array<{ date: string; count: string }>>`
      SELECT
        DATE(timestamp) as date,
        COUNT(*)::integer as count
      FROM pageviews
      WHERE site_id = ${siteId}
        AND timestamp >= ${startDate}
      GROUP BY DATE(timestamp)
      ORDER BY date ASC
    `;
    const pageviewsOverTime = timeSeriesResult.map(row => ({
      date: row.date,
      views: parseInt(row.count, 10),
    }));

    await adapter.close?.();

    const stats: AnalyticsStats = {
      totalPageviews,
      uniqueVisitors,
      topPages,
      topReferrers,
      countries,
      pageviewsOverTime,
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
