/**
 * Analytics Data Export API
 * POST /api/analytics/[deploymentId]/export - Export analytics data to CSV/JSON
 *
 * Request body:
 * - format: 'csv' | 'json' (default: csv)
 * - type: 'all' | 'pageviews' | 'interactions' | 'sessions' (default: all)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireDeploymentAccess } from '@/lib/api/deployment-access';

interface ExportRequest {
  format?: 'csv' | 'json';
  type?: 'all' | 'pageviews' | 'interactions' | 'sessions';
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ deploymentId: string }> }
) {
  try {
    const { deploymentId } = await params;

    // Authenticates, resolves the deployment to its owning workspace database, and verifies the
    // caller has access to that workspace. Ahead of reading the body: parsing an unauthenticated
    // request's payload turned a 401 into a 500 whenever that payload was malformed.
    // 'viewer', not 'editor': export is a read. It returns the same records the overview and
    // sessions views already show a viewer, just as CSV, so gating it higher would lock viewers out
    // of a download without protecting anything.
    const access = await requireDeploymentAccess(deploymentId, 'viewer');
    if (!access.ok) return access.response;
    const { adapter } = access.context;

    const body: ExportRequest = await request.json();
    const { format = 'csv', type = 'all' } = body;

    // Get deployment database for analytics
    const deploymentDb = adapter.getAnalyticsDatabaseInstance(deploymentId);
    if (!deploymentDb) {
      return NextResponse.json(
        { error: 'Deployment database not enabled' },
        { status: 404 }
      );
    }

    // Export analytics data
    const data = deploymentDb.exportAnalyticsData(type);

    // Format response based on requested format
    if (format === 'json') {
      return NextResponse.json(data, {
        headers: {
          'Content-Disposition': `attachment; filename="analytics-${deploymentId}-${Date.now()}.json"`,
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
          'Content-Disposition': `attachment; filename="analytics-${deploymentId}-${Date.now()}.csv"`,
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
