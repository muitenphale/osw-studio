import { NextRequest, NextResponse } from 'next/server';
import { verifyInstanceApiKey, createHandoffToken } from '@/lib/auth/session';
import { getUserById } from '@/lib/auth/system-database';

export async function POST(request: NextRequest) {
  // Only accessible via instance API key
  const apiKeySession = verifyInstanceApiKey(request);
  if (!apiKeySession) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { osws_user_id } = await request.json();
  if (!osws_user_id) {
    return NextResponse.json({ error: 'osws_user_id required' }, { status: 400 });
  }

  // Verify user exists on this instance
  const user = getUserById(osws_user_id);
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const token = await createHandoffToken(osws_user_id);
  return NextResponse.json({ token });
}
