/**
 * Analytics Data Clearing API
 * DELETE /api/analytics/[deploymentId]/clear - Clear analytics data
 *
 * Query parameters:
 * - type: all | pageviews | interactions | sessions (default: all)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireDeploymentAccess } from '@/lib/api/deployment-access';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ deploymentId: string }> }
) {
  try {
    const { deploymentId } = await params;

    // Authenticates, resolves the deployment to its owning workspace database, and
    // verifies the caller has access to that workspace.
    const access = await requireDeploymentAccess(deploymentId, 'editor');
    if (!access.ok) return access.response;
    const { adapter } = access.context;
    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type') || 'all';

    // Validate type parameter
    const validTypes = ['all', 'pageviews', 'interactions', 'sessions'];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: 'Invalid type parameter. Must be one of: all, pageviews, interactions, sessions' },
        { status: 400 }
      );
    }

    // Get deployment database for analytics
    const deploymentDb = adapter.getAnalyticsDatabaseInstance(deploymentId);
    if (!deploymentDb) {
      return NextResponse.json(
        { error: 'Deployment database not enabled' },
        { status: 404 }
      );
    }

    // Get counts before clearing for reporting
    const beforeCounts = deploymentDb.getAnalyticsStorageInfo();

    // Clear analytics data based on type
    if (type === 'all') {
      deploymentDb.clearAnalytics();
    } else {
      deploymentDb.clearAnalytics(type as 'pageviews' | 'interactions' | 'sessions');
    }

    // Get counts after clearing
    const afterCounts = deploymentDb.getAnalyticsStorageInfo();

    const deletedCounts = {
      pageviews: beforeCounts.pageviewCount - afterCounts.pageviewCount,
      interactions: beforeCounts.interactionCount - afterCounts.interactionCount,
      sessions: beforeCounts.sessionCount - afterCounts.sessionCount,
    };

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
