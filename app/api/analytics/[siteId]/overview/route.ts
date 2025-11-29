/**
 * Analytics Overview API
 * GET /api/analytics/[siteId]/overview - Fetch overview analytics
 *
 * Query parameters:
 * - dateFrom: ISO date string (optional)
 * - dateTo: ISO date string (optional)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { createServerAdapter } from '@/lib/vfs/adapters/server';
import { PostgresAdapter } from '@/lib/vfs/adapters/postgres-adapter';

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
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');

    const adapter = await createServerAdapter();

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

    // Build date filter
    const dateFilter = (timestampColumn: string) => {
      const conditions = [];
      if (dateFrom) conditions.push(sql`${sql(timestampColumn)} >= ${dateFrom}`);
      if (dateTo) conditions.push(sql`${sql(timestampColumn)} <= ${dateTo}`);
      return conditions.length > 0 ? sql`AND ${sql.unsafe(conditions.map(() => '?').join(' AND '))}` : sql``;
    };

    // Total pageviews
    const totalPageviews = await sql`
      SELECT COUNT(*)::integer as count
      FROM pageviews
      WHERE site_id = ${siteId}
      ${dateFrom ? sql`AND timestamp >= ${dateFrom}` : sql``}
      ${dateTo ? sql`AND timestamp <= ${dateTo}` : sql``}
    `;

    // Unique visitors
    const uniqueVisitors = await sql`
      SELECT COUNT(DISTINCT session_id)::integer as count
      FROM pageviews
      WHERE site_id = ${siteId}
      ${dateFrom ? sql`AND timestamp >= ${dateFrom}` : sql``}
      ${dateTo ? sql`AND timestamp <= ${dateTo}` : sql``}
    `;

    // Average time on site from sessions
    const avgTimeOnSite = await sql`
      SELECT AVG(duration) as avg_duration
      FROM sessions
      WHERE
        site_id = ${siteId}
        AND duration IS NOT NULL
        ${dateFrom ? sql`AND created_at >= ${dateFrom}` : sql``}
        ${dateTo ? sql`AND created_at <= ${dateTo}` : sql``}
    `;

    // Bounce rate
    const bounceRate = await sql`
      SELECT
        SUM(CASE WHEN is_bounce THEN 1 ELSE 0 END) * 1.0 / COUNT(*) as rate
      FROM sessions
      WHERE site_id = ${siteId}
      ${dateFrom ? sql`AND created_at >= ${dateFrom}` : sql``}
      ${dateTo ? sql`AND created_at <= ${dateTo}` : sql``}
    `;

    // Top pages
    const topPages = await sql`
      SELECT page_path, COUNT(*)::integer as views
      FROM pageviews
      WHERE site_id = ${siteId}
      ${dateFrom ? sql`AND timestamp >= ${dateFrom}` : sql``}
      ${dateTo ? sql`AND timestamp <= ${dateTo}` : sql``}
      GROUP BY page_path
      ORDER BY views DESC
      LIMIT 20
    `;

    // Top referrers
    const topReferrers = await sql`
      SELECT referrer, COUNT(*)::integer as count
      FROM pageviews
      WHERE site_id = ${siteId}
      ${dateFrom ? sql`AND timestamp >= ${dateFrom}` : sql``}
      ${dateTo ? sql`AND timestamp <= ${dateTo}` : sql``}
      GROUP BY referrer
      ORDER BY count DESC
      LIMIT 20
    `;

    // Device breakdown
    const deviceBreakdown = await sql`
      SELECT device_type, COUNT(*)::integer as count
      FROM pageviews
      WHERE
        site_id = ${siteId}
        AND device_type IS NOT NULL
        ${dateFrom ? sql`AND timestamp >= ${dateFrom}` : sql``}
        ${dateTo ? sql`AND timestamp <= ${dateTo}` : sql``}
      GROUP BY device_type
    `;

    // Country breakdown
    const countryBreakdown = await sql`
      SELECT country, COUNT(*)::integer as count
      FROM pageviews
      WHERE
        site_id = ${siteId}
        AND country IS NOT NULL
        ${dateFrom ? sql`AND timestamp >= ${dateFrom}` : sql``}
        ${dateTo ? sql`AND timestamp <= ${dateTo}` : sql``}
      GROUP BY country
      ORDER BY count DESC
      LIMIT 20
    `;

    await adapter.close?.();

    // Build response
    const overview: AnalyticsOverview = {
      totalPageviews: parseInt(totalPageviews[0]?.count || '0', 10),
      uniqueVisitors: parseInt(uniqueVisitors[0]?.count || '0', 10),
      averageTimeOnSite: avgTimeOnSite[0]?.avg_duration || 0,
      bounceRate: bounceRate[0]?.rate || 0,
      topPages: topPages.map((row) => ({
        page: row.page_path,
        views: parseInt(row.views, 10),
      })),
      topReferrers: topReferrers.map((row) => ({
        referrer: row.referrer,
        count: parseInt(row.count, 10),
      })),
      deviceBreakdown: deviceBreakdown.reduce((acc, row) => {
        acc[row.device_type] = parseInt(row.count, 10);
        return acc;
      }, {} as Record<string, number>),
      countryBreakdown: countryBreakdown.reduce((acc, row) => {
        acc[row.country] = parseInt(row.count, 10);
        return acc;
      }, {} as Record<string, number>),
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
