import { NextResponse } from 'next/server';
import { ensureDefaultWorkspace } from '@/lib/auth/default-workspace';
import { logger } from '@/lib/utils';

export async function POST() {
  if (process.env.OSW_DESKTOP !== 'true') {
    return NextResponse.json({ error: 'Not available' }, { status: 404 });
  }

  try {
    const workspaceId = await ensureDefaultWorkspace('desktop');
    return NextResponse.json({ workspaceId });
  } catch (error) {
    logger.error('[API /api/auth/desktop-init] Error:', error);
    return NextResponse.json({ error: 'Failed to initialize workspace' }, { status: 500 });
  }
}
