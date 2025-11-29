/**
 * Logout API Route
 *
 * Clears session cookie
 */

import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/auth/session';
import { logger } from '@/lib/utils';

export async function POST() {
  try {
    await clearSessionCookie();
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('[API /api/auth/logout] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Logout failed' },
      { status: 500 }
    );
  }
}
