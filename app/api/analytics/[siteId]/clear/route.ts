/**
 * Analytics Data Clearing API
 * DELETE /api/analytics/[siteId]/clear - Clear analytics data
 *
 * Query parameters:
 * - type: all | pageviews | interactions | sessions (default: all)
 * - dateFrom: ISO date string (optional)
 * - dateTo: ISO date string (optional)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { createServerAdapter } from '@/lib/vfs/adapters/server';
import { PostgresAdapter } from '@/lib/vfs/adapters/postgres-adapter';

export async function DELETE(
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
    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type') || 'all';
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');

    // Validate type parameter
    const validTypes = ['all', 'pageviews', 'interactions', 'sessions'];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: 'Invalid type parameter. Must be one of: all, pageviews, interactions, sessions' },
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
    let deletedCounts = {
      pageviews: 0,
      interactions: 0,
      sessions: 0,
    };

    // Delete pageviews
    if (type === 'all' || type === 'pageviews') {
      let query = sql`DELETE FROM pageviews WHERE site_id = ${siteId}`;

      if (dateFrom && dateTo) {
        query = sql`DELETE FROM pageviews WHERE site_id = ${siteId} AND timestamp >= ${dateFrom} AND timestamp <= ${dateTo}`;
      } else if (dateFrom) {
        query = sql`DELETE FROM pageviews WHERE site_id = ${siteId} AND timestamp >= ${dateFrom}`;
      } else if (dateTo) {
        query = sql`DELETE FROM pageviews WHERE site_id = ${siteId} AND timestamp <= ${dateTo}`;
      }

      const result = await query;
      deletedCounts.pageviews = result.count || 0;
    }

    // Delete interactions
    if (type === 'all' || type === 'interactions') {
      let query = sql`DELETE FROM interactions WHERE site_id = ${siteId}`;

      if (dateFrom && dateTo) {
        query = sql`DELETE FROM interactions WHERE site_id = ${siteId} AND timestamp >= ${dateFrom} AND timestamp <= ${dateTo}`;
      } else if (dateFrom) {
        query = sql`DELETE FROM interactions WHERE site_id = ${siteId} AND timestamp >= ${dateFrom}`;
      } else if (dateTo) {
        query = sql`DELETE FROM interactions WHERE site_id = ${siteId} AND timestamp <= ${dateTo}`;
      }

      const result = await query;
      deletedCounts.interactions = result.count || 0;
    }

    // Delete sessions
    if (type === 'all' || type === 'sessions') {
      let query = sql`DELETE FROM sessions WHERE site_id = ${siteId}`;

      if (dateFrom && dateTo) {
        query = sql`DELETE FROM sessions WHERE site_id = ${siteId} AND created_at >= ${dateFrom} AND created_at <= ${dateTo}`;
      } else if (dateFrom) {
        query = sql`DELETE FROM sessions WHERE site_id = ${siteId} AND created_at >= ${dateFrom}`;
      } else if (dateTo) {
        query = sql`DELETE FROM sessions WHERE site_id = ${siteId} AND created_at <= ${dateTo}`;
      }

      const result = await query;
      deletedCounts.sessions = result.count || 0;
    }

    await adapter.close?.();

    return NextResponse.json({
      success: true,
      message: 'Analytics data cleared successfully',
      deleted: deletedCounts,
    });
  } catch (error) {
    console.error('[Analytics Clear API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to clear analytics data' },
      { status: 500 }
    );
  }
}
