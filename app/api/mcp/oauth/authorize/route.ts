import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { getUserById, verifyWorkspaceAccess } from '@/lib/auth/system-database';
import { mcpEnabled } from '@/lib/mcp/auth';
import { clientRedirectUris, createAuthorizationCode, getMcpClient } from '@/lib/mcp/store';
import { ACTIVE_SCOPES, grantableScopes, MCP_SCOPES, ROLE_FOR_SCOPE, type McpScope } from '@/lib/mcp/scopes';

/**
 * The consent decision. Approving mints the authorization code and returns the URL the browser
 * should follow back to the client.
 *
 * Everything the page sent is checked again here: the client, its redirect URI, the account's
 * access to the chosen workspace, and each scope against the role. The page is a browser form and
 * is not a trust boundary.
 */

export async function POST(request: NextRequest) {
  if (!mcpEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const session = await requireAuth().catch(() => null);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'invalid_request', error_description: 'Body must be JSON' }, { status: 400 });
  }

  const clientId = String(body.clientId ?? '');
  const redirectUri = String(body.redirectUri ?? '');
  const client = getMcpClient(clientId);
  if (!client || !clientRedirectUris(client).includes(redirectUri)) {
    return NextResponse.json({ error: 'invalid_request', error_description: 'Unknown client or redirect address' }, { status: 400 });
  }

  const state = String(body.state ?? '');
  const location = new URL(redirectUri);
  if (state) location.searchParams.set('state', state);

  if (body.decision !== 'approve') {
    location.searchParams.set('error', 'access_denied');
    location.searchParams.set('error_description', 'The account declined the connection');
    return NextResponse.json({ location: location.toString() });
  }

  const workspaceId = String(body.workspaceId ?? '');
  try {
    verifyWorkspaceAccess(session.userId, workspaceId, 'viewer');
  } catch {
    return NextResponse.json({ error: 'access_denied', error_description: 'No access to that workspace' }, { status: 403 });
  }

  // The role the account actually holds decides what it can grant. An instance admin is treated
  // as an owner of the workspace they picked, which is the access the app already gives them.
  const asked = (Array.isArray(body.scopes) ? body.scopes.map(String) : []).filter(
    (s): s is McpScope => (MCP_SCOPES as readonly string[]).includes(s),
  );
  const role = roleOf(session.userId, workspaceId);
  const permitted = new Set(grantableScopes(role));
  const refused = asked.filter(s => !permitted.has(s));
  if (refused.length > 0) {
    // Two different refusals, and reporting both as a role problem produced a contradiction: a
    // scope withheld from every role (in MCP_SCOPES but not ACTIVE_SCOPES, because no tool reads
    // it yet) told an owner that an owner cannot grant it.
    const withheld = refused.filter(s => !(ACTIVE_SCOPES as readonly string[]).includes(s));
    const tooHigh = refused.filter(s => (ACTIVE_SCOPES as readonly string[]).includes(s));
    const reasons = [
      withheld.length > 0 ? `no longer offered: ${withheld.join(', ')}` : null,
      tooHigh.length > 0
        ? `above your role in this workspace (${role}): ${tooHigh.join(', ')} (needs ${tooHigh.map(s => ROLE_FOR_SCOPE[s]).join(', ')})`
        : null,
    ].filter(Boolean);
    return NextResponse.json({
      error: 'invalid_scope',
      error_description: `Cannot grant. ${reasons.join('; ')}`,
    }, { status: 400 });
  }
  if (asked.length === 0) {
    return NextResponse.json({ error: 'invalid_scope', error_description: 'Pick at least one capability' }, { status: 400 });
  }

  const codeChallenge = String(body.codeChallenge ?? '');
  // S256 is base64url of a 32-byte digest: 43 characters, no padding. Checking it here fails a
  // malformed request before the approval rather than at redemption, when the person has already
  // clicked Connect and the client reports only a failed exchange.
  if (!/^[A-Za-z0-9\-_]{43}$/.test(codeChallenge)) {
    return NextResponse.json(
      { error: 'invalid_request', error_description: 'code_challenge must be the base64url S256 digest' },
      { status: 400 },
    );
  }

  const code = createAuthorizationCode({
    clientId,
    userId: session.userId,
    workspaceId,
    scopes: asked,
    codeChallenge,
    redirectUri,
    resource: String(body.resource ?? '') || undefined,
  });
  location.searchParams.set('code', code);
  return NextResponse.json({ location: location.toString() });
}

function roleOf(userId: string, workspaceId: string): 'owner' | 'editor' | 'viewer' {
  const user = getUserById(userId);
  if (user?.is_admin) return 'owner';
  for (const role of ['owner', 'editor'] as const) {
    try {
      verifyWorkspaceAccess(userId, workspaceId, role);
      return role;
    } catch {
      continue;
    }
  }
  return 'viewer';
}
