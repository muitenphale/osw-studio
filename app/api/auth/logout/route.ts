/**
 * Logout API Route
 *
 * Clears session and workspace cookies
 */

import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/auth/session';
import { logger } from '@/lib/utils';

export async function POST() {
  try {
    await clearSessionCookie();
    const response = NextResponse.json({ success: true });
    response.cookies.delete('osw_workspace');
    return response;
  } catch (error) {
    logger.error('[API /api/auth/logout] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Logout failed' },
      { status: 500 }
    );
  }
}
