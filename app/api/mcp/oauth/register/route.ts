import { NextRequest, NextResponse } from 'next/server';
import { mcpEnabled } from '@/lib/mcp/auth';
import { redirectUriAllowed, registerMcpClient } from '@/lib/mcp/store';
import { getIdentifier, mcpOauthRateLimiter, RATE_LIMIT_CONFIG } from '@/lib/analytics/rate-limiter';

/**
 * RFC 7591 dynamic client registration. Open by design: a client id alone grants nothing, since
 * every grant still needs a person to approve it on the consent page. Without this, Claude
 * reports "does not support dynamic client registration" and the connector cannot be added
 * without hand-made credentials.
 */

const MAX_REDIRECT_URIS = 10;

export async function POST(request: NextRequest) {
  if (!mcpEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Open, but not unbounded: every call writes a client row to the system database.
  if (!mcpOauthRateLimiter.check('mcp-register:all', RATE_LIMIT_CONFIG.mcpOauthTotal)
    || !mcpOauthRateLimiter.check(`mcp-register:${getIdentifier(request)}`, RATE_LIMIT_CONFIG.mcpOauth)) {
    return NextResponse.json({ error: 'invalid_request', error_description: 'Too many registration attempts. Try again later.' }, { status: 429 });
  }

  let body: { client_name?: unknown; redirect_uris?: unknown };
  try {
    body = await request.json();
  } catch {
    return bad('invalid_client_metadata', 'Body must be JSON');
  }

  const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris.map(String) : [];
  if (uris.length === 0) return bad('invalid_redirect_uri', 'redirect_uris is required');
  if (uris.length > MAX_REDIRECT_URIS) return bad('invalid_redirect_uri', 'Too many redirect_uris');
  const rejected = uris.filter(uri => !redirectUriAllowed(uri));
  if (rejected.length > 0) {
    return bad('invalid_redirect_uri', `Only https or loopback http redirect URIs are accepted: ${rejected.join(', ')}`);
  }

  const name = typeof body.client_name === 'string' && body.client_name.trim() ? body.client_name.trim().slice(0, 120) : 'Unnamed client';
  const client = registerMcpClient(name, uris);

  return NextResponse.json({
    client_id: client.client_id,
    client_name: client.client_name,
    redirect_uris: uris,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
    client_id_issued_at: Math.floor(new Date(client.created_at + 'Z').getTime() / 1000) || Math.floor(Date.now() / 1000),
  }, { status: 201 });
}

function bad(error: string, description: string) {
  return NextResponse.json({ error, error_description: description }, { status: 400 });
}
