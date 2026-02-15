import { NextRequest, NextResponse } from 'next/server';
import { HF_COOKIE_NAME, hfCookieOptions, getPublicOrigin } from '../cookie';

export async function GET(request: NextRequest) {
  const origin = getPublicOrigin(request);
  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  const storedState = request.cookies.get('osw_hf_oauth_state')?.value;

  if (!code || !state || !storedState || state !== storedState) {
    return NextResponse.redirect(`${origin}/?hf_auth=error&reason=invalid_state`);
  }

  const clientId = process.env.OAUTH_CLIENT_ID;
  const clientSecret = process.env.OAUTH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${origin}/?hf_auth=error&reason=not_configured`);
  }

  // Redirect URI must match what was sent in /login
  const redirectUri = `${origin}/api/auth/hf/callback`;

  try {
    // Exchange code for tokens
    const tokenRes = await fetch('https://huggingface.co/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      console.error('[HF OAuth] Token exchange failed:', err);
      return NextResponse.redirect(`${origin}/?hf_auth=error&reason=token_exchange`);
    }

    const tokenData = await tokenRes.json();
    const accessToken: string = tokenData.access_token;

    // Fetch user info
    let username: string | undefined;
    try {
      const userRes = await fetch('https://huggingface.co/oauth/userinfo', {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });
      if (userRes.ok) {
        const userInfo = await userRes.json();
        username = userInfo.preferred_username || userInfo.name || userInfo.sub;
      }
    } catch {
      // Non-critical — proceed without username
    }

    // Build response: redirect back to app with success indicator
    const successUrl = new URL('/', origin);
    successUrl.searchParams.set('hf_auth', 'success');
    if (username) successUrl.searchParams.set('hf_user', username);

    const response = NextResponse.redirect(successUrl.toString());

    // Store access token in HttpOnly cookie
    const cookieValue = JSON.stringify({ access_token: accessToken, username });
    response.cookies.set(HF_COOKIE_NAME, cookieValue, hfCookieOptions());

    // Clear the state cookie
    response.cookies.delete('osw_hf_oauth_state');

    return response;
  } catch (err) {
    console.error('[HF OAuth] Callback error:', err);
    return NextResponse.redirect(`${origin}/?hf_auth=error&reason=server_error`);
  }
}
