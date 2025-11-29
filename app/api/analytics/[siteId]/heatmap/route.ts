/**
 * Analytics Heatmap Data API
 * GET /api/analytics/[siteId]/heatmap - Fetch heatmap data for visualization
 *
 * Query parameters:
 * - page: Page path to get heatmap for (required)
 * - type: 'click' | 'scroll' (default: click)
 * - dateFrom: ISO date string (optional)
 * - dateTo: ISO date string (optional)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { createServerAdapter } from '@/lib/vfs/adapters/server';
import { PostgresAdapter } from '@/lib/vfs/adapters/postgres-adapter';

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
    const page = searchParams.get('page');
    const type = searchParams.get('type') || 'click';
    const device = searchParams.get('device'); // mobile, tablet, desktop, or null for all
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');

    if (!page) {
      return NextResponse.json(
        { error: 'Missing required parameter: page' },
        { status: 400 }
      );
    }

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

    // Build query based on type
    let data: any[] = [];

    if (type === 'click') {
      // Get click coordinates
      const query = sql`
        SELECT
          coordinates,
          element_selector,
          timestamp
        FROM interactions
        WHERE
          site_id = ${siteId}
          AND page_path = ${page}
          AND interaction_type = 'click'
          AND coordinates IS NOT NULL
          ${dateFrom ? sql`AND timestamp >= ${dateFrom}` : sql``}
          ${dateTo ? sql`AND timestamp <= ${dateTo}` : sql``}
        ORDER BY timestamp DESC
        LIMIT 10000
      `;

      data = await query;

      // Filter by device type based on viewport width (since device_type is not stored in interactions)
      if (device && device !== 'all') {
        data = data.filter((row) => {
          try {
            const coords = typeof row.coordinates === 'string'
              ? JSON.parse(row.coordinates)
              : row.coordinates;
            const width = coords.viewportWidth;

            if (device === 'mobile') return width < 768;
            if (device === 'tablet') return width >= 768 && width < 1024;
            if (device === 'desktop') return width >= 1024;

            return true;
          } catch {
            return false;
          }
        });
      }
    } else if (type === 'scroll') {
      // Get scroll depth milestones
      const query = sql`
        SELECT
          scroll_depth,
          time_on_page,
          timestamp
        FROM interactions
        WHERE
          site_id = ${siteId}
          AND page_path = ${page}
          AND interaction_type = 'scroll'
          AND scroll_depth IS NOT NULL
          ${dateFrom ? sql`AND timestamp >= ${dateFrom}` : sql``}
          ${dateTo ? sql`AND timestamp <= ${dateTo}` : sql``}
        ORDER BY timestamp DESC
        LIMIT 10000
      `;

      data = await query;
    }

    await adapter.close?.();

    // Process and return heatmap data
    if (type === 'click') {
      // Parse coordinates and aggregate
      const points = data
        .map((row) => {
          try {
            const coords = typeof row.coordinates === 'string'
              ? JSON.parse(row.coordinates)
              : row.coordinates;
            return {
              x: coords.x,
              y: coords.y,
              scrollY: coords.scrollY || 0, // Add scrollY for full-page heatmap
              viewportWidth: coords.viewportWidth,
              viewportHeight: coords.viewportHeight,
              documentHeight: coords.documentHeight, // Also include document height
              elementSelector: row.element_selector,
              timestamp: row.timestamp,
            };
          } catch {
            return null;
          }
        })
        .filter((p) => p !== null);

      return NextResponse.json({
        type: 'click',
        page,
        sampleSize: points.length,
        points,
      });
    } else if (type === 'scroll') {
      // Aggregate scroll depth data
      const depthCounts = data.reduce((acc, row) => {
        const depth = row.scroll_depth;
        acc[depth] = (acc[depth] || 0) + 1;
        return acc;
      }, {} as Record<number, number>);

      return NextResponse.json({
        type: 'scroll',
        page,
        sampleSize: data.length,
        depthDistribution: depthCounts,
        rawData: data.map((row) => ({
          scrollDepth: row.scroll_depth,
          timeOnPage: row.time_on_page,
          timestamp: row.timestamp,
        })),
      });
    }

    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  } catch (error) {
    console.error('[Analytics Heatmap API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch heatmap data' },
      { status: 500 }
    );
  }
}
