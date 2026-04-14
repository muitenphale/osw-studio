/**
 * Workspace-Scoped Skills Sync API Route
 *
 * GET: Pull skills from server
 * POST: Push skills to server
 */

import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceContext } from '@/lib/api/workspace-context';
import { Skill } from '@/lib/vfs/skills/types';
import { logger } from '@/lib/utils';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const { adapter } = await getWorkspaceContext(params, 'viewer');

    const allSkills = await adapter.getAllSkills() || [];
    const customSkills = allSkills.filter(skill => !skill.isBuiltIn);

    return NextResponse.json({
      success: true,
      skills: customSkills,
    });
  } catch (error) {
    logger.error('[API /api/w/[workspaceId]/sync/skills GET] Error:', error);

    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && (error.message === 'Workspace access denied' || error.message === 'Insufficient workspace permissions')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch skills' },
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
    const { skills } = body as { skills: Skill[] };

    if (!skills || !Array.isArray(skills)) {
      return NextResponse.json(
        { error: 'Invalid skills data - expected array' },
        { status: 400 }
      );
    }

    let created = 0;
    let updated = 0;
    const errors: string[] = [];

    for (const skill of skills) {
      if (skill.isBuiltIn) continue;

      try {
        const existing = await adapter.getSkill(skill.id);

        if (existing) {
          await adapter.updateSkill({
            id: skill.id,
            name: skill.name,
            description: skill.description,
            content: skill.content,
            markdown: skill.markdown,
            createdAt: skill.createdAt,
            updatedAt: new Date(),
          });
          updated++;
        } else {
          await adapter.createSkill({
            id: skill.id,
            name: skill.name,
            description: skill.description,
            content: skill.content,
            markdown: skill.markdown,
            createdAt: skill.createdAt,
            updatedAt: skill.updatedAt,
          });
          created++;
        }
      } catch (skillError) {
        errors.push(`Failed to sync skill "${skill.name}": ${skillError instanceof Error ? skillError.message : 'Unknown error'}`);
      }
    }

    return NextResponse.json({
      success: errors.length === 0,
      created,
      updated,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    logger.error('[API /api/w/[workspaceId]/sync/skills POST] Error:', error);

    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && (error.message === 'Workspace access denied' || error.message === 'Insufficient workspace permissions')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to sync skills' },
      { status: 500 }
    );
  }
}
