/**
 * Login API Route
 *
 * Authenticates user with password and creates session
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSession, setSessionCookie } from '@/lib/auth/session';
import { logger } from '@/lib/utils';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { password } = body;

    if (!password) {
      logger.debug('[API /api/auth/login] No password provided');
      return NextResponse.json(
        { error: 'Password required' },
        { status: 400 }
      );
    }

    // Get admin password from environment
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminPassword) {
      logger.error('[API /api/auth/login] ADMIN_PASSWORD not configured in .env file');
      return NextResponse.json(
        { error: 'Authentication not configured. Please set ADMIN_PASSWORD in your .env file.' },
        { status: 500 }
      );
    }

    // Simple password comparison
    const isValid = password === adminPassword;

    if (!isValid) {
      logger.debug('[API /api/auth/login] Invalid password attempt');
      return NextResponse.json(
        { error: 'Invalid password' },
        { status: 401 }
      );
    }

    // Create session
    try {
      const token = await createSession('admin', 'admin@localhost', true);
      await setSessionCookie(token);
    } catch (sessionError) {
      logger.error('[API /api/auth/login] Session creation error:', sessionError);
      return NextResponse.json(
        { error: 'Failed to create session. Check SESSION_SECRET environment variable.' },
        { status: 500 }
      );
    }

    logger.debug('[API /api/auth/login] Login successful');
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('[API /api/auth/login] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Login failed' },
      { status: 500 }
    );
  }
}
