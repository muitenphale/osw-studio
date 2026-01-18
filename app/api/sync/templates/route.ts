/**
 * Templates Sync API Route
 *
 * Handles syncing custom templates between browser (IndexedDB) and server (SQLite)
 * GET: Pull templates from server → browser
 * POST: Push templates from browser → server
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerAdapter } from '@/lib/vfs/adapters/server';
import { CustomTemplate } from '@/lib/vfs/types';
import { requireAuth } from '@/lib/auth/session';
import { logger } from '@/lib/utils';

/**
 * GET /api/sync/templates - List all custom templates from server
 */
export async function GET() {
  try {
    // Require authentication
    await requireAuth();

    const adapter = await createServerAdapter();
    await adapter.init();

    const templates = await adapter.getAllCustomTemplates();

    await adapter.close?.();

    return NextResponse.json({
      success: true,
      templates,
    });
  } catch (error) {
    logger.error('[API /api/sync/templates GET] Error:', error);

    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch templates' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/sync/templates - Push multiple templates to server
 */
export async function POST(request: NextRequest) {
  try {
    // Require authentication
    await requireAuth();

    const body = await request.json();
    const { templates } = body as { templates: CustomTemplate[] };

    if (!templates || !Array.isArray(templates)) {
      return NextResponse.json(
        { error: 'Invalid templates data - expected array' },
        { status: 400 }
      );
    }

    const adapter = await createServerAdapter();
    await adapter.init();

    let created = 0;
    let updated = 0;
    const errors: string[] = [];

    for (const template of templates) {
      try {
        // Check if template exists
        const existing = await adapter.getCustomTemplate(template.id);

        // Set updatedAt if not present
        const templateToSave: CustomTemplate = {
          ...template,
          updatedAt: new Date(),
        };

        // saveCustomTemplate handles both create and update (upsert)
        await adapter.saveCustomTemplate(templateToSave);

        if (existing) {
          updated++;
        } else {
          created++;
        }
      } catch (templateError) {
        errors.push(`Failed to sync template "${template.name}": ${templateError instanceof Error ? templateError.message : 'Unknown error'}`);
      }
    }

    await adapter.close?.();

    return NextResponse.json({
      success: errors.length === 0,
      created,
      updated,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    logger.error('[API /api/sync/templates POST] Error:', error);

    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to sync templates' },
      { status: 500 }
    );
  }
}
