/**
 * Analytics Storage Management API
 * GET /api/analytics/[siteId]/storage - Get storage usage breakdown
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { createServerAdapter } from '@/lib/vfs/adapters/server';
import { PostgresAdapter } from '@/lib/vfs/adapters/postgres-adapter';

interface StorageBreakdown {
  totalMB: number;
  breakdown: {
    pageviews: {
      count: number;
      sizeMB: number;
    };
    interactions: {
      count: number;
      sizeMB: number;
    };
    sessions: {
      count: number;
      sizeMB: number;
    };
  };
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

    // Get pageviews count and approximate size
    const pageviewsStats = await sql`
      SELECT
        COUNT(*)::integer as count,
        pg_total_relation_size('pageviews') as total_bytes
      FROM pageviews
      WHERE site_id = ${siteId}
    `;

    // Get interactions count and approximate size
    const interactionsStats = await sql`
      SELECT
        COUNT(*)::integer as count,
        pg_total_relation_size('interactions') as total_bytes
      FROM interactions
      WHERE site_id = ${siteId}
    `;

    // Get sessions count and approximate size
    const sessionsStats = await sql`
      SELECT
        COUNT(*)::integer as count,
        pg_total_relation_size('sessions') as total_bytes
      FROM sessions
      WHERE site_id = ${siteId}
    `;

    await adapter.close?.();

    // Calculate sizes (rough estimate based on row count)
    const pageviewsCount = parseInt(pageviewsStats[0]?.count || '0');
    const interactionsCount = parseInt(interactionsStats[0]?.count || '0');
    const sessionsCount = parseInt(sessionsStats[0]?.count || '0');

    // Rough size estimates (in bytes per row)
    const PAGEVIEW_SIZE = 300; // ~300 bytes per pageview
    const INTERACTION_SIZE = 500; // ~500 bytes per interaction (JSONB data)
    const SESSION_SIZE = 200; // ~200 bytes per session

    const pageviewsSizeMB = (pageviewsCount * PAGEVIEW_SIZE) / (1024 * 1024);
    const interactionsSizeMB = (interactionsCount * INTERACTION_SIZE) / (1024 * 1024);
    const sessionsSizeMB = (sessionsCount * SESSION_SIZE) / (1024 * 1024);

    const totalMB = pageviewsSizeMB + interactionsSizeMB + sessionsSizeMB;

    const storage: StorageBreakdown = {
      totalMB: parseFloat(totalMB.toFixed(2)),
      breakdown: {
        pageviews: {
          count: pageviewsCount,
          sizeMB: parseFloat(pageviewsSizeMB.toFixed(2)),
        },
        interactions: {
          count: interactionsCount,
          sizeMB: parseFloat(interactionsSizeMB.toFixed(2)),
        },
        sessions: {
          count: sessionsCount,
          sizeMB: parseFloat(sessionsSizeMB.toFixed(2)),
        },
      },
    };

    return NextResponse.json(storage);
  } catch (error) {
    console.error('[Analytics Storage API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to get storage usage' },
      { status: 500 }
    );
  }
}
