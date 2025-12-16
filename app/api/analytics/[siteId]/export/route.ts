/**
 * Analytics Data Export API
 * POST /api/analytics/[siteId]/export - Export analytics data to CSV/JSON
 *
 * Request body:
 * - format: 'csv' | 'json' (default: csv)
 * - type: 'all' | 'pageviews' | 'interactions' | 'sessions' (default: all)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { getSQLiteAdapter } from '@/lib/vfs/adapters/server';

interface ExportRequest {
  format?: 'csv' | 'json';
  type?: 'all' | 'pageviews' | 'interactions' | 'sessions';
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
    const { format = 'csv', type = 'all' } = body;

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

    // Export analytics data
    const data = siteDb.exportAnalyticsData(type);

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
