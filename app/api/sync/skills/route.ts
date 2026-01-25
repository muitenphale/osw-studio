/**
 * Skills Sync API Route
 *
 * Handles syncing skills between browser (localStorage) and server (SQLite)
 * GET: Pull skills from server → browser
 * POST: Push skills from browser → server
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerAdapter } from '@/lib/vfs/adapters/server';
import { Skill } from '@/lib/vfs/skills/types';
import { requireAuth } from '@/lib/auth/session';
import { logger } from '@/lib/utils';

/**
 * GET /api/sync/skills - List all custom skills from server
 */
export async function GET() {
  try {
    // Require authentication
    await requireAuth();

    const adapter = await createServerAdapter();
    await adapter.init();

    // Get all skills from server (only custom skills, not built-in)
    const allSkills = await adapter.getAllSkills() || [];
    const customSkills = allSkills.filter(skill => !skill.isBuiltIn);

    await adapter.close?.();

    return NextResponse.json({
      success: true,
      skills: customSkills,
    });
  } catch (error) {
    logger.error('[API /api/sync/skills GET] Error:', error);

    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch skills' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/sync/skills - Push multiple skills to server
 */
export async function POST(request: NextRequest) {
  try {
    // Require authentication
    await requireAuth();

    const body = await request.json();
    const { skills } = body as { skills: Skill[] };

    if (!skills || !Array.isArray(skills)) {
      return NextResponse.json(
        { error: 'Invalid skills data - expected array' },
        { status: 400 }
      );
    }

    const adapter = await createServerAdapter();
    await adapter.init();

    let created = 0;
    let updated = 0;
    const errors: string[] = [];

    for (const skill of skills) {
      // Skip built-in skills
      if (skill.isBuiltIn) continue;

      try {
        // Check if skill exists
        const existing = await adapter.getSkill(skill.id);

        if (existing) {
          // Update existing skill
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
          // Create new skill
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

    await adapter.close?.();

    return NextResponse.json({
      success: errors.length === 0,
      created,
      updated,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    logger.error('[API /api/sync/skills POST] Error:', error);

    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to sync skills' },
      { status: 500 }
    );
  }
}
