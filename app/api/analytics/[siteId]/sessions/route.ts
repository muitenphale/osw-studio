/**
 * Analytics Session Tracking API
 * GET /api/analytics/[siteId]/sessions - Fetch session data for journey visualization
 *
 * Query parameters:
 * - dateFrom: ISO date string (optional)
 * - dateTo: ISO date string (optional)
 * - limit: Number of sessions to return (default: 100, max: 1000)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { getSQLiteAdapter } from '@/lib/vfs/adapters/server';

interface SessionJourney {
  sessionId: string;
  pages: Array<{
    path: string;
    timestamp: string;
    duration?: number;
  }>;
  entryPage: string;
  exitPage: string;
  pageCount: number;
  totalDuration: number;
  isBounce: boolean;
  createdAt: string;
  endedAt: string;
}

interface FlowData {
  nodes: Array<{ id: string; label: string; value: number }>;
  links: Array<{ source: string; target: string; value: number }>;
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
    const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10), 1000);

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

    // Get sessions with journeys from SiteDatabase
    const sessionsWithJourneys = siteDb.getSessionsWithJourneys(
      dateFrom || undefined,
      dateTo || undefined,
      limit
    );

    // Build journey data with page durations
    const journeys: SessionJourney[] = sessionsWithJourneys.map((s) => ({
      sessionId: s.sessionId,
      pages: s.pages.map((page, index) => ({
        path: page.path,
        timestamp: page.timestamp,
        duration: index < s.pages.length - 1
          ? new Date(s.pages[index + 1].timestamp).getTime() - new Date(page.timestamp).getTime()
          : undefined,
      })),
      entryPage: s.entryPage,
      exitPage: s.exitPage,
      pageCount: s.pageCount,
      totalDuration: s.duration ?? 0,
      isBounce: s.isBounce,
      createdAt: s.createdAt,
      endedAt: s.endedAt ?? s.createdAt,
    }));

    // Build flow data for Sankey diagram
    const flowData = buildFlowData(journeys);

    return NextResponse.json({
      sessions: journeys,
      flowData,
      summary: {
        totalSessions: journeys.length,
        bounceRate: journeys.length > 0
          ? journeys.filter((s) => s.isBounce).length / journeys.length
          : 0,
        averageDuration: journeys.length > 0
          ? journeys.reduce((sum, s) => sum + s.totalDuration, 0) / journeys.length
          : 0,
        averagePageCount: journeys.length > 0
          ? journeys.reduce((sum, s) => sum + s.pageCount, 0) / journeys.length
          : 0,
      },
    });
  } catch (error) {
    console.error('[Analytics Sessions API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch session data' },
      { status: 500 }
    );
  }
}

/**
 * Build flow data for Sankey diagram visualization
 */
function buildFlowData(journeys: SessionJourney[]): FlowData {
  const linkCounts = new Map<string, number>();
  const nodeCounts = new Map<string, number>();

  // Count transitions
  journeys.forEach((journey) => {
    journey.pages.forEach((page, index) => {
      // Count node visits
      nodeCounts.set(page.path, (nodeCounts.get(page.path) || 0) + 1);

      // Count transitions to next page
      if (index < journey.pages.length - 1) {
        const nextPage = journey.pages[index + 1].path;
        const linkKey = `${page.path}::${nextPage}`;
        linkCounts.set(linkKey, (linkCounts.get(linkKey) || 0) + 1);
      }
    });
  });

  // Build nodes
  const nodes = Array.from(nodeCounts.entries())
    .map(([path, count]) => ({
      id: path,
      label: path === '/' ? 'Home' : path,
      value: count,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 20); // Top 20 pages

  const nodeIds = new Set(nodes.map((n) => n.id));

  // Build links (only between nodes in top 20)
  const links = Array.from(linkCounts.entries())
    .map(([key, count]) => {
      const [source, target] = key.split('::');
      return { source, target, value: count };
    })
    .filter((link) => nodeIds.has(link.source) && nodeIds.has(link.target))
    .sort((a, b) => b.value - a.value);

  return { nodes, links };
}
