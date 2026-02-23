/**
 * Projects API
 *
 * GET - Returns all projects from SQLite (Server mode)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { createServerAdapter } from '@/lib/vfs/adapters/server';
import { logger } from '@/lib/utils';

export async function GET(request: NextRequest) {
  try {
    // Require authentication
    await requireAuth();

    // Get server adapter
    const adapter = await createServerAdapter();
    await adapter.init();

    // Check if fields parameter is present (for lightweight queries)
    const { searchParams } = new URL(request.url);
    const fieldsParam = searchParams.get('fields');

    // List all projects (with optional field filtering at DB level)
    const fields = fieldsParam ? fieldsParam.split(',').map(f => f.trim()) : undefined;
    const projects = await adapter.listProjects(fields);

    await adapter.close?.();

    return NextResponse.json(projects);
  } catch (error) {
    logger.error('[API /api/projects] ❌ Error:', error);

    // Return 401 for authentication errors
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch projects' },
      { status: 500 }
    );
  }
}
