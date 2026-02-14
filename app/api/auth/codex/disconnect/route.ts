import { NextResponse } from 'next/server';
import { CODEX_COOKIE_NAME, codexCookieOptions } from '../cookie';

/**
 * Deletes the HttpOnly refresh token cookie.
 */
export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(CODEX_COOKIE_NAME, '', codexCookieOptions(0));
  return response;
}
