import { NextResponse } from 'next/server';

export async function GET() {
  const isHFSpaces = !!process.env.SPACE_HOST;
  return NextResponse.json({
    oauthAvailable: !!process.env.OAUTH_CLIENT_ID,
    // Codex uses HttpOnly cookies for refresh tokens — blocked on HF Spaces (iframe/proxy)
    codexAvailable: !isHFSpaces,
  });
}
