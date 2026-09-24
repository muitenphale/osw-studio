import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getSession } from '@/lib/auth/session';
import { mcpEnabled } from '@/lib/mcp/auth';
import { claimRunRequest } from '@/lib/mcp/agent-delegation';

/**
 * A tab asking to be the one that runs an MCP request.
 *
 * The request reaches every tab the account has open. Without this, each starts its own task on
 * the same project: duplicate edits, duplicate spend, and every answer but the first discarded.
 */

export async function POST(request: NextRequest) {
  if (!mcpEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { requestId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const requestId = typeof body.requestId === 'string' ? body.requestId : '';
  if (!requestId) return NextResponse.json({ error: 'requestId is required' }, { status: 400 });

  const granted = claimRunRequest(requestId, session.userId, randomUUID());
  return NextResponse.json({ granted });
}
