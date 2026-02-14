import { NextRequest, NextResponse } from 'next/server';
import { CODEX_COOKIE_NAME, codexCookieOptions } from '../cookie';

/**
 * Receives the full Codex auth JSON from the client, stores the refresh_token
 * in an HttpOnly cookie, and returns the non-sensitive fields.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { access_token, refresh_token, expires_at, user_email } = body;

    if (!refresh_token || typeof refresh_token !== 'string') {
      return NextResponse.json({ error: 'Missing refresh_token' }, { status: 400 });
    }
    if (!access_token || typeof access_token !== 'string') {
      return NextResponse.json({ error: 'Missing access_token' }, { status: 400 });
    }

    const response = NextResponse.json({
      access_token,
      expires_at: expires_at || Math.floor(Date.now() / 1000) + 3600,
      user_email: user_email || undefined,
    });

    response.cookies.set(CODEX_COOKIE_NAME, refresh_token, codexCookieOptions());

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
