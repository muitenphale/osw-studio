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
import { getSQLiteAdapter } from '@/lib/vfs/adapters/server';

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

    // Process and return heatmap data based on type
    if (type === 'click') {
      // Get click data from SiteDatabase
      const clickData = siteDb.getClickData(
        page,
        dateFrom || undefined,
        dateTo || undefined
      );

      // Parse coordinates and filter by device
      let points = clickData
        .map((row) => {
          try {
            const coords = typeof row.coordinates === 'string'
              ? JSON.parse(row.coordinates)
              : row.coordinates;
            return {
              x: coords.x,
              y: coords.y,
              scrollY: coords.scrollY || 0,
              viewportWidth: coords.viewportWidth,
              viewportHeight: coords.viewportHeight,
              documentHeight: coords.documentHeight,
              elementSelector: row.elementSelector,
              timestamp: row.timestamp,
            };
          } catch {
            return null;
          }
        })
        .filter((p): p is NonNullable<typeof p> => p !== null);

      // Filter by device type based on viewport width
      if (device && device !== 'all') {
        points = points.filter((point) => {
          const width = point.viewportWidth;
          if (device === 'mobile') return width < 768;
          if (device === 'tablet') return width >= 768 && width < 1024;
          if (device === 'desktop') return width >= 1024;
          return true;
        });
      }

      return NextResponse.json({
        type: 'click',
        page,
        sampleSize: points.length,
        points,
      });
    } else if (type === 'scroll') {
      // Get scroll data from SiteDatabase
      const scrollData = siteDb.getScrollData(
        page,
        dateFrom || undefined,
        dateTo || undefined
      );

      // Aggregate scroll depth data
      const depthCounts = scrollData.reduce((acc, row) => {
        const depth = row.scrollDepth;
        acc[depth] = (acc[depth] || 0) + 1;
        return acc;
      }, {} as Record<number, number>);

      return NextResponse.json({
        type: 'scroll',
        page,
        sampleSize: scrollData.length,
        depthDistribution: depthCounts,
        rawData: scrollData,
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
