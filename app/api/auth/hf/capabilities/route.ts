import { NextResponse } from 'next/server';

export async function GET() {
  const isHFSpaces = !!process.env.SPACE_HOST;
  return NextResponse.json({
    oauthAvailable: !!process.env.OAUTH_CLIENT_ID,
    // OAuth client IDs are public by design — they're visible in the auth URL
    clientId: process.env.OAUTH_CLIENT_ID || null,
    scopes: process.env.OAUTH_SCOPES || 'openid profile inference-api',
    // Codex uses HttpOnly cookies for refresh tokens — blocked on HF Spaces (iframe/proxy)
    codexAvailable: !isHFSpaces,
  });
}
