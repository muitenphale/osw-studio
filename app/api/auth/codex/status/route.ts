import { NextRequest, NextResponse } from 'next/server';
import { CODEX_COOKIE_NAME } from '../cookie';

/**
 * Returns whether the HttpOnly refresh token cookie exists.
 * Used by the client for mount-time reconciliation.
 */
export async function GET(request: NextRequest) {
  const hasRefreshToken = !!request.cookies.get(CODEX_COOKIE_NAME)?.value;
  return NextResponse.json({ hasRefreshToken });
}
