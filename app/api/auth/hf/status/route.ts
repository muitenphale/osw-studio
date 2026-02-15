import { NextRequest, NextResponse } from 'next/server';
import { HF_COOKIE_NAME } from '../cookie';

export async function GET(request: NextRequest) {
  const cookie = request.cookies.get(HF_COOKIE_NAME)?.value;

  if (!cookie) {
    return NextResponse.json({ authenticated: false });
  }

  try {
    const data = JSON.parse(cookie);
    return NextResponse.json({
      authenticated: true,
      username: data.username,
    });
  } catch {
    return NextResponse.json({ authenticated: false });
  }
}
