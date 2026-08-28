import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { taskManager } from '@/lib/server-generate/singleton';

/** Receives the result of a browser-delegated search and resolves the paused server-side run. */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await taskManager.initialize();

  let taskId: string, stdout: string, stderr: string, exitCode: number;
  try { ({ taskId, stdout, stderr, exitCode } = await request.json()); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const task = taskManager.getTask(taskId);
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

  if (task.sessionId !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (task.pendingSearchResolve) {
    task.pendingSearchResolve({
      stdout: typeof stdout === 'string' ? stdout : '',
      stderr: typeof stderr === 'string' ? stderr : '',
      exitCode: typeof exitCode === 'number' ? exitCode : 0,
    });
    task.pendingSearchResolve = null;
  }

  return NextResponse.json({ ok: true });
}
