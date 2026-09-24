import { NextRequest, NextResponse } from 'next/server';
import { mcpEnabled } from '@/lib/mcp/auth';
import { grantIdForToken, revokeGrant } from '@/lib/mcp/store';

/**
 * RFC 7009 revocation. A client hands back a token it holds; the grant behind it is revoked, so
 * both its access and refresh tokens stop working. Per the RFC the response is 200 even for an
 * unknown token, so a caller cannot use this endpoint to test whether a token exists.
 */

export async function POST(request: NextRequest) {
  if (!mcpEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let token: string | null = null;
  try {
    const type = request.headers.get('content-type') ?? '';
    if (type.includes('application/json')) {
      token = String(((await request.json()) as { token?: unknown }).token ?? '') || null;
    } else {
      token = String((await request.formData()).get('token') ?? '') || null;
    }
  } catch {
    token = null;
  }

  if (token) {
    // Either kind: a client handing back its refresh token is revoking the same grant, and that is
    // the credential it is most likely to still hold.
    const grantId = grantIdForToken(token);
    if (grantId) revokeGrant(grantId);
  }
  return new NextResponse(null, { status: 200, headers: { 'Cache-Control': 'no-store' } });
}
