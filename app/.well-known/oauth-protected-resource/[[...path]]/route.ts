import { NextRequest, NextResponse } from 'next/server';
import { mcpEnabled } from '@/lib/mcp/auth';
import { protectedResourceMetadata } from '@/lib/mcp/metadata';

/**
 * RFC 9728. The optional catch-all serves both the bare path and the resource-suffixed form
 * (`/.well-known/oauth-protected-resource/api/mcp`), which is what a client derives from the
 * MCP endpoint's URL.
 */
export async function GET(request: NextRequest) {
  if (!mcpEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(protectedResourceMetadata(request), {
    headers: { 'Cache-Control': 'public, max-age=3600', 'Access-Control-Allow-Origin': '*' },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': '*' },
  });
}
