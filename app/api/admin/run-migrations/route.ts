/**
 * Admin API to manually run database migrations
 * POST /api/admin/run-migrations
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { createServerAdapter } from '@/lib/vfs/adapters/server';
import { PostgresAdapter } from '@/lib/vfs/adapters/postgres-adapter';

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
    const { migration, action } = body;

    const adapter = await createServerAdapter();

    if (!(adapter instanceof PostgresAdapter)) {
      return NextResponse.json(
        { error: 'Migrations require Server Mode (PostgreSQL)' },
        { status: 503 }
      );
    }

    await adapter.init();

    const sql = adapter.getSQL();

    if (action === 'reset' && migration) {
      // Delete migration marker to allow re-running
      await sql`
        DELETE FROM _migrations WHERE id = ${migration}
      `;

      await adapter.close?.();

      return NextResponse.json({
        success: true,
        message: `Migration ${migration} has been reset. Restart the server to re-run it.`,
      });
    }

    if (action === 'list') {
      // List all applied migrations
      const migrations = await sql`
        SELECT id, applied_at FROM _migrations ORDER BY applied_at DESC
      `;

      await adapter.close?.();

      return NextResponse.json({
        success: true,
        migrations,
      });
    }

    await adapter.close?.();

    return NextResponse.json(
      { error: 'Invalid action. Use "reset" or "list".' },
      { status: 400 }
    );
  } catch (error) {
    console.error('[Run Migrations API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to run migrations' },
      { status: 500 }
    );
  }
}
