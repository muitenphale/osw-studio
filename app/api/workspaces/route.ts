/**
 * User Workspaces API
 * GET /api/workspaces — list workspaces for the current user
 */
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { listUserWorkspaces } from '@/lib/auth/system-database';

export async function GET() {
  try {
    const session = await requireAuth();
    const workspaces = listUserWorkspaces(session.userId);
    return NextResponse.json({ workspaces });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to load workspaces' }, { status: 500 });
  }
}
