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
import { createServerAdapter } from '@/lib/vfs/adapters/server';
import { PostgresAdapter } from '@/lib/vfs/adapters/postgres-adapter';

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

    // Fetch sessions
    const sessions = await sql`
      SELECT
        id, session_id, entry_page, exit_page, page_count,
        duration, is_bounce, created_at, ended_at
      FROM sessions
      WHERE
        site_id = ${siteId}
        ${dateFrom ? sql`AND created_at >= ${dateFrom}` : sql``}
        ${dateTo ? sql`AND created_at <= ${dateTo}` : sql``}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;

    // Fetch pageviews for journey reconstruction
    const sessionIds = sessions.map((s) => s.session_id);
    const pageviews = sessionIds.length > 0
      ? await sql`
          SELECT
            session_id, page_path, timestamp, load_time, exit_time
          FROM pageviews
          WHERE
            site_id = ${siteId}
            AND session_id IN ${sql(sessionIds)}
          ORDER BY session_id, timestamp ASC
        `
      : [];

    // Group pageviews by session
    const pageviewsBySession = pageviews.reduce((acc, pv) => {
      if (!acc[pv.session_id]) acc[pv.session_id] = [];
      acc[pv.session_id].push(pv);
      return acc;
    }, {} as Record<string, any[]>);

    // Build journey data
    const journeys: SessionJourney[] = sessions.map((s) => {
      const sessionPageviews = pageviewsBySession[s.session_id] || [];

      return {
        sessionId: s.session_id,
        pages: sessionPageviews.map((pv: any, index: number) => ({
          path: pv.page_path,
          timestamp: pv.timestamp,
          duration: index < sessionPageviews.length - 1
            ? new Date(sessionPageviews[index + 1].timestamp).getTime() - new Date(pv.timestamp).getTime()
            : undefined,
        })),
        entryPage: s.entry_page,
        exitPage: s.exit_page,
        pageCount: s.page_count,
        totalDuration: s.duration,
        isBounce: s.is_bounce,
        createdAt: s.created_at,
        endedAt: s.ended_at,
      };
    });

    // Build flow data for Sankey diagram
    const flowData = buildFlowData(journeys);

    await adapter.close?.();

    return NextResponse.json({
      sessions: journeys,
      flowData,
      summary: {
        totalSessions: sessions.length,
        bounceRate: sessions.filter((s) => s.is_bounce).length / sessions.length,
        averageDuration: sessions.reduce((sum, s) => sum + (s.duration || 0), 0) / sessions.length,
        averagePageCount: sessions.reduce((sum, s) => sum + s.page_count, 0) / sessions.length,
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
