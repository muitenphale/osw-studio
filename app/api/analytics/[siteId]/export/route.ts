/**
 * Analytics Data Export API
 * POST /api/analytics/[siteId]/export - Export analytics data to CSV/JSON
 *
 * Request body:
 * - format: 'csv' | 'json' (default: csv)
 * - type: 'all' | 'pageviews' | 'interactions' | 'sessions' (default: all)
 * - dateFrom: ISO date string (optional)
 * - dateTo: ISO date string (optional)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { createServerAdapter } from '@/lib/vfs/adapters/server';
import { PostgresAdapter } from '@/lib/vfs/adapters/postgres-adapter';

interface ExportRequest {
  format?: 'csv' | 'json';
  type?: 'all' | 'pageviews' | 'interactions' | 'sessions';
  dateFrom?: string;
  dateTo?: string;
}

export async function POST(
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
    const body: ExportRequest = await request.json();
    const { format = 'csv', type = 'all', dateFrom, dateTo } = body;

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
    const buildDateFilter = (table: string, timestampColumn: string) => {
      const conditions = [`${table}.site_id = ${siteId}`];

      if (dateFrom) {
        conditions.push(`${table}.${timestampColumn} >= '${dateFrom}'`);
      }

      if (dateTo) {
        conditions.push(`${table}.${timestampColumn} <= '${dateTo}'`);
      }

      return sql.unsafe(conditions.join(' AND '));
    };

    const data: any = {};

    // Export pageviews
    if (type === 'all' || type === 'pageviews') {
      const pageviews = await sql`
        SELECT
          id, page_path, referrer, country, user_agent, session_id,
          load_time, exit_time, device_type, timestamp
        FROM pageviews
        WHERE ${buildDateFilter('pageviews', 'timestamp')}
        ORDER BY timestamp DESC
      `;
      data.pageviews = pageviews;
    }

    // Export interactions
    if (type === 'all' || type === 'interactions') {
      const interactions = await sql`
        SELECT
          id, session_id, page_path, interaction_type, element_selector,
          coordinates, scroll_depth, time_on_page, timestamp
        FROM interactions
        WHERE ${buildDateFilter('interactions', 'timestamp')}
        ORDER BY timestamp DESC
      `;
      data.interactions = interactions;
    }

    // Export sessions
    if (type === 'all' || type === 'sessions') {
      const sessions = await sql`
        SELECT
          id, session_id, entry_page, exit_page, page_count,
          duration, is_bounce, created_at, ended_at
        FROM sessions
        WHERE ${buildDateFilter('sessions', 'created_at')}
        ORDER BY created_at DESC
      `;
      data.sessions = sessions;
    }

    await adapter.close?.();

    // Format response based on requested format
    if (format === 'json') {
      return NextResponse.json(data, {
        headers: {
          'Content-Disposition': `attachment; filename="analytics-${siteId}-${Date.now()}.json"`,
        },
      });
    } else {
      // CSV format
      const csvLines: string[] = [];

      // Convert each data type to CSV
      for (const [dataType, records] of Object.entries(data)) {
        if (!Array.isArray(records) || records.length === 0) continue;

        csvLines.push(`\n# ${dataType.toUpperCase()}\n`);

        // Header row
        const headers = Object.keys(records[0]);
        csvLines.push(headers.join(','));

        // Data rows
        for (const record of records) {
          const values = headers.map((header) => {
            const value = record[header];
            if (value === null || value === undefined) return '';
            if (typeof value === 'object') return JSON.stringify(value);
            return `"${String(value).replace(/"/g, '""')}"`;
          });
          csvLines.push(values.join(','));
        }
      }

      const csvContent = csvLines.join('\n');

      return new NextResponse(csvContent, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="analytics-${siteId}-${Date.now()}.csv"`,
        },
      });
    }
  } catch (error) {
    console.error('[Analytics Export API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to export analytics data' },
      { status: 500 }
    );
  }
}
