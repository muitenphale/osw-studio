/**
 * Workspace-Scoped Individual Template Sync API Route
 *
 * GET: Pull specific template from server
 * POST: Push specific template to server
 * DELETE: Delete template from server
 */

import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceContext } from '@/lib/api/workspace-context';
import { CustomTemplate } from '@/lib/vfs/types';
import { logger } from '@/lib/utils';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; id: string }> }
) {
  try {
    const { adapter } = await getWorkspaceContext(params, 'viewer');
    const { id } = await params;

    const template = await adapter.getCustomTemplate(id);

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
    logger.error('[API /api/w/[workspaceId]/sync/templates/[id] GET] Error:', error);

    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && (error.message === 'Workspace access denied' || error.message === 'Insufficient workspace permissions')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch template' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; id: string }> }
) {
  try {
    const { adapter } = await getWorkspaceContext(params);
    const { id } = await params;
    const body = await request.json();
    const { template } = body as { template: CustomTemplate };

    if (!template || template.id !== id) {
      return NextResponse.json(
        { error: 'Invalid template data or ID mismatch' },
        { status: 400 }
      );
    }

    const existing = await adapter.getCustomTemplate(id);

    const templateToSave: CustomTemplate = {
      ...template,
      updatedAt: new Date(),
    };

    await adapter.saveCustomTemplate(templateToSave);

    const updatedTemplate = await adapter.getCustomTemplate(id);

    return NextResponse.json({
      success: true,
      template: updatedTemplate,
      action: existing ? 'updated' : 'created',
    });
  } catch (error) {
    logger.error('[API /api/w/[workspaceId]/sync/templates/[id] POST] Error:', error);

    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && (error.message === 'Workspace access denied' || error.message === 'Insufficient workspace permissions')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to sync template' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; id: string }> }
) {
  try {
    const { adapter } = await getWorkspaceContext(params);
    const { id } = await params;

    const existing = await adapter.getCustomTemplate(id);

    if (!existing) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      );
    }

    await adapter.deleteCustomTemplate(id);

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    logger.error('[API /api/w/[workspaceId]/sync/templates/[id] DELETE] Error:', error);

    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && (error.message === 'Workspace access denied' || error.message === 'Insufficient workspace permissions')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete template' },
      { status: 500 }
    );
  }
}
