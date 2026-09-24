import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { mcpEnabled } from '@/lib/mcp/auth';
import { settleRunRequest } from '@/lib/mcp/agent-delegation';

/**
 * The workspace tab's answer to `mcp_run_requested`: the task it started, or why it could not.
 * Session-authenticated, and the request is only settled for the account that owns it, so one
 * signed-in account cannot answer another's.
 */

export async function POST(request: NextRequest) {
  if (!mcpEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { requestId?: unknown; ok?: unknown; taskId?: unknown; error?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const requestId = typeof body.requestId === 'string' ? body.requestId : '';
  if (!requestId) return NextResponse.json({ error: 'requestId is required' }, { status: 400 });

  const settled = settleRunRequest(requestId, session.userId, {
    ok: body.ok === true,
    taskId: typeof body.taskId === 'string' ? body.taskId : undefined,
    error: typeof body.error === 'string' ? body.error : undefined,
  });

  if (!settled) return NextResponse.json({ error: 'Unknown or expired request' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
