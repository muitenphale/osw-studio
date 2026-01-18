/**
 * Individual Template Sync API Route
 *
 * Handles syncing a single template between browser and server
 * GET: Pull specific template from server
 * POST: Push specific template to server
 * DELETE: Delete template from server
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerAdapter } from '@/lib/vfs/adapters/server';
import { CustomTemplate } from '@/lib/vfs/types';
import { requireAuth } from '@/lib/auth/session';
import { logger } from '@/lib/utils';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/sync/templates/[id] - Get specific template from server
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAuth();

    const { id } = await params;

    const adapter = await createServerAdapter();
    await adapter.init();

    const template = await adapter.getCustomTemplate(id);

    await adapter.close?.();

    if (!template) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      template,
    });
  } catch (error) {
    logger.error('[API /api/sync/templates/[id] GET] Error:', error);

    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch template' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/sync/templates/[id] - Push specific template to server
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAuth();

    const { id } = await params;
    const body = await request.json();
    const { template } = body as { template: CustomTemplate };

    if (!template || template.id !== id) {
      return NextResponse.json(
        { error: 'Invalid template data or ID mismatch' },
        { status: 400 }
      );
    }

    const adapter = await createServerAdapter();
    await adapter.init();

    // Check if template exists for response
    const existing = await adapter.getCustomTemplate(id);

    // Set updatedAt
    const templateToSave: CustomTemplate = {
      ...template,
      updatedAt: new Date(),
    };

    // saveCustomTemplate handles both create and update (upsert)
    await adapter.saveCustomTemplate(templateToSave);

    // Fetch the updated template to return
    const updatedTemplate = await adapter.getCustomTemplate(id);

    await adapter.close?.();

    return NextResponse.json({
      success: true,
      template: updatedTemplate,
      action: existing ? 'updated' : 'created',
    });
  } catch (error) {
    logger.error('[API /api/sync/templates/[id] POST] Error:', error);

    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to sync template' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/sync/templates/[id] - Delete template from server
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAuth();

    const { id } = await params;

    const adapter = await createServerAdapter();
    await adapter.init();

    // Check if template exists
    const existing = await adapter.getCustomTemplate(id);

    if (!existing) {
      await adapter.close?.();
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      );
    }

    await adapter.deleteCustomTemplate(id);

    await adapter.close?.();

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    logger.error('[API /api/sync/templates/[id] DELETE] Error:', error);

    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete template' },
      { status: 500 }
    );
  }
}
