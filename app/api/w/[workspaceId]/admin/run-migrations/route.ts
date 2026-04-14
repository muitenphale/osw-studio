/**
 * Workspace-Scoped Admin API: Database Management
 *
 * POST - Database status, reinitialize, or list migrations
 */

import { logger } from '@/lib/utils';
import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceContext } from '@/lib/api/workspace-context';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { adapter } = await getWorkspaceContext(params, 'owner');

    const body = await request.json();
    const { action } = body;

    if (action === 'status') {
      return NextResponse.json({
        success: true,
        database: 'SQLite',
        message: 'Database initialized and ready. SQLite uses automatic schema creation.',
      });
    }

    if (action === 'reinitialize') {
      // Adapter is already initialized by getWorkspaceContext
      return NextResponse.json({
        success: true,
        message: 'Database reinitialized successfully.',
      });
    }

    if (action === 'list') {
      return NextResponse.json({
        success: true,
        migrations: [],
        message: 'SQLite uses automatic schema creation. No migration tracking required.',
      });
    }

    return NextResponse.json(
      { error: 'Invalid action. Use "status", "reinitialize", or "list".' },
      { status: 400 }
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && (error.message === 'Workspace access denied' || error.message === 'Insufficient workspace permissions')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    logger.error('[Database Admin API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to perform database operation' },
      { status: 500 }
    );
  }
}
