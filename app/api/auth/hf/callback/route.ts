import { NextRequest, NextResponse } from 'next/server';
import { getPublicOrigin } from '../cookie';

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
    // Exchange code for tokens (Basic auth per HF docs)
    const tokenRes = await fetch('https://huggingface.co/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      console.error('[HF OAuth] Token exchange failed:', err);
      return NextResponse.redirect(`${origin}/?hf_auth=error&reason=token_exchange`);
    }

    const tokenData = await tokenRes.json();
    const accessToken: string = tokenData.access_token;

    // Validate token has inference-api scope by testing against router
    const testRes = await fetch('https://router.huggingface.co/v1/models', {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    if (testRes.status === 401) {
      console.error('[HF OAuth] Token lacks inference-api scope');
      return NextResponse.redirect(`${origin}/?hf_auth=error&reason=insufficient_scope`);
    }

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

    // Build redirect URL with token in fragment (never sent to server logs)
    const successUrl = new URL('/', origin);
    successUrl.searchParams.set('hf_auth', 'success');
    if (username) successUrl.searchParams.set('hf_user', username);

    const fragment = `hf_token=${encodeURIComponent(accessToken)}`;
    const redirectUrl = `${successUrl.toString()}#${fragment}`;

    const response = NextResponse.redirect(redirectUrl);

    // Clear the state cookie
    response.cookies.delete('osw_hf_oauth_state');

    return response;
  } catch (err) {
    console.error('[HF OAuth] Callback error:', err);
    return NextResponse.redirect(`${origin}/?hf_auth=error&reason=server_error`);
  }
}
