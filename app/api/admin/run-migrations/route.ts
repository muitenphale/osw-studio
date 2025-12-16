/**
 * Admin API for database management
 * POST /api/admin/run-migrations
 *
 * With SQLite, migrations are handled automatically during initialization.
 * This endpoint now provides database status and reinitialize capability.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { getSQLiteAdapter } from '@/lib/vfs/adapters/server';

export async function POST(request: NextRequest) {
  try {
    // Require authentication
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { action } = body;

    const adapter = getSQLiteAdapter();

    if (action === 'status') {
      // Return database status
      await adapter.init();

      return NextResponse.json({
        success: true,
        database: 'SQLite',
        message: 'Database initialized and ready. SQLite uses automatic schema creation.',
      });
    }

    if (action === 'reinitialize') {
      // Reinitialize adapter (recreates schemas if needed)
      await adapter.init();

      return NextResponse.json({
        success: true,
        message: 'Database reinitialized successfully.',
      });
    }

    if (action === 'list') {
      // SQLite doesn't use migration tracking table
      // Return info about the current schema instead
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
    console.error('[Database Admin API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to perform database operation' },
      { status: 500 }
    );
  }
}
