import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { mcpEnabled } from '@/lib/mcp/auth';
import { listGrantsForUser, listMcpActivity, parseScopes, revokeGrant } from '@/lib/mcp/store';

/** The account's MCP grants, and revoking one. Session-authenticated: this is app UI. */

export async function GET() {
  if (!mcpEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const session = await requireAuth().catch(() => null);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  return NextResponse.json({
    grants: listGrantsForUser(session.userId).map(g => ({
      id: g.id,
      clientName: g.client_name,
      workspaceId: g.workspace_id,
      // Parsed rather than split: a grant issued before a scope was withdrawn still has the old
      // word in its row, and listing it verbatim told the account a client held access that
      // nothing honours any more.
      scopes: parseScopes(g.scopes),
      createdAt: g.created_at,
      lastUsedAt: g.last_used_at,
      // What it actually did, so a connector can be reviewed rather than only seen to be active.
      recentActivity: listMcpActivity(g.id, session.userId, 10).map(a => ({
        tool: a.tool,
        target: a.target,
        refused: a.refused === 1,
        at: a.at,
      })),
    })),
  });
}

export async function DELETE(request: NextRequest) {
  if (!mcpEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const session = await requireAuth().catch(() => null);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const grantId = new URL(request.url).searchParams.get('id') ?? '';
  // Scoped to the caller's own grants, so an id from another account is a 404 rather than a revoke.
  if (!revokeGrant(grantId, session.userId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ revoked: true });
}
