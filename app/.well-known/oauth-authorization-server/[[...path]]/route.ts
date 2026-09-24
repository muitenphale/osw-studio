import { NextRequest, NextResponse } from 'next/server';
import { mcpEnabled } from '@/lib/mcp/auth';
import { authorizationServerMetadata } from '@/lib/mcp/metadata';

/**
 * RFC 8414. The optional catch-all serves the issuer-suffixed form as well as the bare path,
 * so a client that appends the resource path still finds it.
 */
export async function GET(request: NextRequest) {
  if (!mcpEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(authorizationServerMetadata(request), {
    headers: { 'Cache-Control': 'public, max-age=3600', 'Access-Control-Allow-Origin': '*' },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': '*' },
  });
}
