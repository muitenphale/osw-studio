/**
 * Individual Skill Sync API Route
 *
 * Handles syncing a single skill between browser and server
 * GET: Pull specific skill from server
 * POST: Push specific skill to server
 * DELETE: Delete skill from server
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerAdapter } from '@/lib/vfs/adapters/server';
import { Skill } from '@/lib/vfs/skills/types';
import { requireAuth } from '@/lib/auth/session';
import { logger } from '@/lib/utils';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/sync/skills/[id] - Get specific skill from server
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAuth();

    const { id } = await params;

    const adapter = await createServerAdapter();
    await adapter.init();

    const skill = await adapter.getSkill(id);

    await adapter.close?.();

    if (!skill) {
      return NextResponse.json(
        { error: 'Skill not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      skill,
    });
  } catch (error) {
    logger.error('[API /api/sync/skills/[id] GET] Error:', error);

    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch skill' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/sync/skills/[id] - Push specific skill to server
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAuth();

    const { id } = await params;
    const body = await request.json();
    const { skill } = body as { skill: Skill };

    if (!skill || skill.id !== id) {
      return NextResponse.json(
        { error: 'Invalid skill data or ID mismatch' },
        { status: 400 }
      );
    }

    // Prevent syncing built-in skills
    if (skill.isBuiltIn) {
      return NextResponse.json(
        { error: 'Cannot sync built-in skills' },
        { status: 400 }
      );
    }

    const adapter = await createServerAdapter();
    await adapter.init();

    // Check if skill exists
    const existing = await adapter.getSkill(id);
    const now = new Date();

    if (existing) {
      // Update existing skill
      await adapter.updateSkill({
        id: skill.id,
        name: skill.name,
        description: skill.description,
        content: skill.content,
        markdown: skill.markdown,
        createdAt: skill.createdAt,
        updatedAt: now,
      });
    } else {
      // Create new skill
      await adapter.createSkill({
        id: skill.id,
        name: skill.name,
        description: skill.description,
        content: skill.content,
        markdown: skill.markdown,
        createdAt: skill.createdAt,
        updatedAt: now,
      });
    }

    // Fetch the updated skill to return
    const updatedSkill = await adapter.getSkill(id);

    await adapter.close?.();

    return NextResponse.json({
      success: true,
      skill: updatedSkill,
      action: existing ? 'updated' : 'created',
    });
  } catch (error) {
    logger.error('[API /api/sync/skills/[id] POST] Error:', error);

    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to sync skill' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/sync/skills/[id] - Delete skill from server
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAuth();

    const { id } = await params;

    const adapter = await createServerAdapter();
    await adapter.init();

    // Check if skill exists
    const existing = await adapter.getSkill(id);

    if (!existing) {
      await adapter.close?.();
      return NextResponse.json(
        { error: 'Skill not found' },
        { status: 404 }
      );
    }

    // Prevent deleting built-in skills
    if (existing.isBuiltIn) {
      await adapter.close?.();
      return NextResponse.json(
        { error: 'Cannot delete built-in skills' },
        { status: 400 }
      );
    }

    await adapter.deleteSkill(id);

    await adapter.close?.();

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    logger.error('[API /api/sync/skills/[id] DELETE] Error:', error);

    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete skill' },
      { status: 500 }
    );
  }
}
