import { NextRequest, NextResponse } from 'next/server';
import { mcpEnabled } from '@/lib/mcp/auth';
import { getMcpClient, issueTokens, redeemAuthorizationCode, rotateRefreshToken } from '@/lib/mcp/store';
import { getIdentifier, mcpOauthRateLimiter, RATE_LIMIT_CONFIG } from '@/lib/analytics/rate-limiter';

/**
 * The token endpoint: authorization_code with PKCE, and refresh_token with rotation. Public
 * clients only (`token_endpoint_auth_method: none`), which is what an MCP client is: it cannot
 * keep a secret, so the code is protected by PKCE and the exact redirect URI instead.
 */

export async function POST(request: NextRequest) {
  if (!mcpEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // An authorization code and a refresh token are credentials; this caps how fast one can be tried.
  if (!mcpOauthRateLimiter.check('mcp-token:all', RATE_LIMIT_CONFIG.mcpOauthTotal)
    || !mcpOauthRateLimiter.check(`mcp-token:${getIdentifier(request)}`, RATE_LIMIT_CONFIG.mcpOauth)) {
    return bad('invalid_request', 'Too many token requests. Try again later.', 429);
  }

  const form = await readForm(request);
  if (!form) return bad('invalid_request', 'Body must be form-encoded or JSON');

  const grantType = form.get('grant_type');
  const clientId = form.get('client_id') ?? '';
  if (!clientId || !getMcpClient(clientId)) return bad('invalid_client', 'Unknown client_id', 401);

  if (grantType === 'authorization_code') {
    const code = form.get('code');
    const redirectUri = form.get('redirect_uri');
    const verifier = form.get('code_verifier');
    if (!code || !redirectUri) return bad('invalid_request', 'code and redirect_uri are required');
    const redeemed = redeemAuthorizationCode({ code, clientId, codeVerifier: verifier ?? '', redirectUri });
    if (!redeemed.ok) return bad(redeemed.error, redeemed.description);
    return tokenResponse(issueTokens(redeemed.grantId));
  }

  if (grantType === 'refresh_token') {
    const refresh = form.get('refresh_token');
    if (!refresh) return bad('invalid_request', 'refresh_token is required');
    const rotated = rotateRefreshToken(refresh, clientId);
    if (!rotated.ok) return bad('invalid_grant', rotated.description);
    return tokenResponse(rotated.tokens);
  }

  return bad('unsupported_grant_type', `grant_type ${String(grantType)} is not supported`);
}

function tokenResponse(tokens: { accessToken: string; refreshToken: string; expiresIn: number; scopes: string[] }) {
  return NextResponse.json({
    access_token: tokens.accessToken,
    token_type: 'Bearer',
    expires_in: tokens.expiresIn,
    refresh_token: tokens.refreshToken,
    scope: tokens.scopes.join(' '),
  }, { headers: { 'Cache-Control': 'no-store' } });
}

/** Accepts both encodings: the spec says form, and some clients send JSON. */
async function readForm(request: NextRequest): Promise<Map<string, string> | null> {
  const type = request.headers.get('content-type') ?? '';
  try {
    if (type.includes('application/json')) {
      const json = await request.json() as Record<string, unknown>;
      return new Map(Object.entries(json).map(([k, v]) => [k, String(v)]));
    }
    const data = await request.formData();
    return new Map([...data.entries()].map(([k, v]) => [k, String(v)]));
  } catch {
    return null;
  }
}

function bad(error: string, description: string, status = 400) {
  return NextResponse.json({ error, error_description: description }, { status, headers: { 'Cache-Control': 'no-store' } });
}
