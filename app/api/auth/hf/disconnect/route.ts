import { NextResponse } from 'next/server';
import { HF_COOKIE_NAME } from '../cookie';

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(HF_COOKIE_NAME);
  return response;
}
