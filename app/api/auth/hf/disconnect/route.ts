import { NextResponse } from 'next/server';

// OAuth tokens are now stored client-side in localStorage.
// This route is kept for backwards compatibility.
export async function POST() {
  return NextResponse.json({ ok: true });
}
