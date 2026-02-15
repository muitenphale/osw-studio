import { NextResponse } from 'next/server';

// OAuth tokens are now stored client-side in localStorage.
// This route is kept for backwards compatibility but always returns unauthenticated.
export async function GET() {
  return NextResponse.json({ authenticated: false });
}
