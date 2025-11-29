/**
 * Analytics Engagement Metrics API
 * GET /api/analytics/[siteId]/engagement - Fetch engagement metrics
 *
 * Query parameters:
 * - dateFrom: ISO date string (optional)
 * - dateTo: ISO date string (optional)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { createServerAdapter } from '@/lib/vfs/adapters/server';
import { PostgresAdapter } from '@/lib/vfs/adapters/postgres-adapter';

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

    // Time on page metrics from interactions
    const timeOnPageData = await sql`
      SELECT
        page_path,
        AVG(time_on_page) as avg_time,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY time_on_page) as median_time
      FROM interactions
      WHERE
        site_id = ${siteId}
        AND interaction_type = 'exit'
        AND time_on_page IS NOT NULL
        ${dateFrom ? sql`AND timestamp >= ${dateFrom}` : sql``}
        ${dateTo ? sql`AND timestamp <= ${dateTo}` : sql``}
      GROUP BY page_path
      ORDER BY avg_time DESC
      LIMIT 50
    `;

    // Overall average and median
    const overallTimeOnPage = await sql`
      SELECT
        AVG(time_on_page) as avg_time,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY time_on_page) as median_time
      FROM interactions
      WHERE
        site_id = ${siteId}
        AND interaction_type = 'exit'
        AND time_on_page IS NOT NULL
        ${dateFrom ? sql`AND timestamp >= ${dateFrom}` : sql``}
        ${dateTo ? sql`AND timestamp <= ${dateTo}` : sql``}
    `;

    // Scroll depth metrics
    const scrollDepthData = await sql`
      SELECT
        scroll_depth,
        COUNT(*)::integer as count
      FROM interactions
      WHERE
        site_id = ${siteId}
        AND interaction_type = 'scroll'
        AND scroll_depth IS NOT NULL
        ${dateFrom ? sql`AND timestamp >= ${dateFrom}` : sql``}
        ${dateTo ? sql`AND timestamp <= ${dateTo}` : sql``}
      GROUP BY scroll_depth
      ORDER BY scroll_depth
    `;

    // Exit pages
    const exitPagesData = await sql`
      SELECT
        exit_page,
        COUNT(*)::integer as exit_count,
        COUNT(*) * 1.0 / (
          SELECT COUNT(*) FROM sessions
          WHERE site_id = ${siteId}
          ${dateFrom ? sql`AND created_at >= ${dateFrom}` : sql``}
          ${dateTo ? sql`AND created_at <= ${dateTo}` : sql``}
        ) as exit_rate
      FROM sessions
      WHERE
        site_id = ${siteId}
        AND exit_page IS NOT NULL
        ${dateFrom ? sql`AND created_at >= ${dateFrom}` : sql``}
        ${dateTo ? sql`AND created_at <= ${dateTo}` : sql``}
      GROUP BY exit_page
      ORDER BY exit_count DESC
      LIMIT 20
    `;

    // Landing pages with bounce rate
    const landingPagesData = await sql`
      SELECT
        entry_page,
        COUNT(*)::integer as visit_count,
        SUM(CASE WHEN is_bounce THEN 1 ELSE 0 END) * 1.0 / COUNT(*) as bounce_rate
      FROM sessions
      WHERE
        site_id = ${siteId}
        AND entry_page IS NOT NULL
        ${dateFrom ? sql`AND created_at >= ${dateFrom}` : sql``}
        ${dateTo ? sql`AND created_at <= ${dateTo}` : sql``}
      GROUP BY entry_page
      ORDER BY visit_count DESC
      LIMIT 20
    `;

    await adapter.close?.();

    // Build engagement metrics response
    const metrics: EngagementMetrics = {
      timeOnPage: {
        average: overallTimeOnPage[0]?.avg_time || 0,
        median: overallTimeOnPage[0]?.median_time || 0,
        distribution: timeOnPageData.reduce((acc, row) => {
          acc[row.page_path] = row.avg_time;
          return acc;
        }, {} as Record<string, number>),
      },
      scrollDepth: {
        average: scrollDepthData.reduce((sum, row) => sum + row.scroll_depth * row.count, 0) /
          scrollDepthData.reduce((sum, row) => sum + row.count, 0) || 0,
        milestones: scrollDepthData.reduce((acc, row) => {
          acc[row.scroll_depth] = row.count;
          return acc;
        }, {} as Record<number, number>),
      },
      exitPages: exitPagesData.map((row) => ({
        page: row.exit_page,
        exitCount: row.exit_count,
        exitRate: row.exit_rate,
      })),
      topLandingPages: landingPagesData.map((row) => ({
        page: row.entry_page,
        visitCount: row.visit_count,
        bounceRate: row.bounce_rate,
      })),
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
