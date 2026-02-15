import { NextResponse } from 'next/server';

export async function GET() {
  const oauthAvailable = !!process.env.OAUTH_CLIENT_ID;
  return NextResponse.json({ oauthAvailable });
}
