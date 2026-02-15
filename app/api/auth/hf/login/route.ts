import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { getPublicOrigin } from '../cookie';

export async function GET(request: NextRequest) {
  const clientId = process.env.OAUTH_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: 'OAuth not configured on this instance' },
      { status: 400 }
    );
  }

  // Generate CSRF state nonce
  const state = randomBytes(32).toString('hex');

  const origin = getPublicOrigin(request);
  const redirectUri = `${origin}/api/auth/hf/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: process.env.OAUTH_SCOPES || 'openid profile inference-api',
    response_type: 'code',
    state,
  });

  const authorizeUrl = `https://huggingface.co/oauth/authorize?${params.toString()}`;

  const response = NextResponse.redirect(authorizeUrl);

  // Store state in a short-lived cookie for CSRF validation
  response.cookies.set('osw_hf_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600, // 10 minutes
    path: '/',
  });

  return response;
}
