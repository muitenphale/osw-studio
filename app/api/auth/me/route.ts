/**
 * Current User API Route
 *
 * Returns current session information
 */

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { logger } from '@/lib/utils';

export async function GET() {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ authenticated: false }, { status: 200 });
    }

    return NextResponse.json({
      authenticated: true,
      user: {
        userId: session.userId,
        email: session.email,
        isAdmin: session.isAdmin,
      },
    });
  } catch (error) {
    logger.error('[API /api/auth/me] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get session' },
      { status: 500 }
    );
  }
}
