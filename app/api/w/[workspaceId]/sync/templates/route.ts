/**
 * Workspace-Scoped Templates Sync API Route
 *
 * GET: Pull templates from server
 * POST: Push templates to server
 */

import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceContext } from '@/lib/api/workspace-context';
import { CustomTemplate } from '@/lib/vfs/types';
import { logger } from '@/lib/utils';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { adapter } = await getWorkspaceContext(params, 'viewer');

    const templates = await adapter.getAllCustomTemplates();

    return NextResponse.json({
      success: true,
      templates,
    });
  } catch (error) {
    logger.error('[API /api/w/[workspaceId]/sync/templates GET] Error:', error);

    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && (error.message === 'Workspace access denied' || error.message === 'Insufficient workspace permissions')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch templates' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { adapter } = await getWorkspaceContext(params);

    const body = await request.json();
    const { templates } = body as { templates: CustomTemplate[] };

    if (!templates || !Array.isArray(templates)) {
      return NextResponse.json(
        { error: 'Invalid templates data - expected array' },
        { status: 400 }
      );
    }

    let created = 0;
    let updated = 0;
    const errors: string[] = [];

    for (const template of templates) {
      try {
        const existing = await adapter.getCustomTemplate(template.id);

        const templateToSave: CustomTemplate = {
          ...template,
          updatedAt: new Date(),
        };

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

    return NextResponse.json({
      success: errors.length === 0,
      created,
      updated,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    logger.error('[API /api/w/[workspaceId]/sync/templates POST] Error:', error);

    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && (error.message === 'Workspace access denied' || error.message === 'Insufficient workspace permissions')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to sync templates' },
      { status: 500 }
    );
  }
}
