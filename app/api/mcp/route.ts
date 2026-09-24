import { NextRequest, NextResponse } from 'next/server';
import { createMcpHandler, getOAuthProtectedResourceMetadataUrl, requireBearerAuth } from '@modelcontextprotocol/server';
import { mcpEnabled, mcpTokenVerifier, principalOf } from '@/lib/mcp/auth';
import { issuerFor, resourceUrl } from '@/lib/mcp/metadata';
import { createOswMcpServer } from '@/lib/mcp/server';

/**
 * The MCP endpoint: Streamable HTTP, stateless, bearer-authenticated. Off unless
 * MCP_ENABLED=true, in which case the route does not exist as far as a caller can tell.
 * Design: docs/superpowers/specs/2026-09-19-built-in-mcp-server-design.md
 */

/**
 * The bearer gate, built per request rather than once.
 *
 * `resourceMetadataUrl` is what puts this instance's discovery document in the
 * `WWW-Authenticate` challenge, and it is how a client finds the authorization server after its
 * first unauthenticated call instead of guessing a well-known path. Only the request knows which
 * host the client reached, so the URL cannot be computed at module scope.
 */
function gateFor(request: NextRequest) {
  return requireBearerAuth({
    verifier: mcpTokenVerifier(),
    resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(new URL(resourceUrl(request))),
  });
}

// One handler per process; it builds a fresh server per request from the request's principal.
let handler: ReturnType<typeof createMcpHandler> | undefined;
let instanceOrigin: string | undefined;
function getHandler() {
  handler ??= createMcpHandler(
    (ctx) => createOswMcpServer(principalOf(ctx.authInfo!), { origin: instanceOrigin }),
    { legacy: 'stateless' },
  );
  return handler;
}

export async function POST(request: NextRequest) {
  if (!mcpEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const auth = await gateFor(request)(request);
  if (auth instanceof Response) return auth;
  // The host the client reached, so the server can say which instance it is.
  instanceOrigin = new URL(issuerFor(request)).host;
  return getHandler().fetch(request, { authInfo: auth });
}

export async function GET() {
  if (!mcpEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}

export async function DELETE() {
  return GET();
}
