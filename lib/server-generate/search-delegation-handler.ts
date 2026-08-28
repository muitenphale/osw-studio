// lib/server-generate/search-delegation-handler.ts
import { vfs } from '@/lib/vfs';
import { searchCommand } from '@/lib/vfs/shell/commands/search';

/**
 * Runs a server-delegated web search in the browser (window is defined here, so the `search`
 * command takes its normal client path with the user's configured provider/key) and posts the
 * result back so the paused server-side run can continue.
 */
export async function handleSearchRequested(data: {
  taskId: string;
  args: string[];
}): Promise<void> {
  const { taskId, args } = data;

  let result = { stdout: '', stderr: 'search: failed to run', exitCode: 1 };
  try {
    const r = await searchCommand({
      vfs,
      projectId: '',
      args: Array.isArray(args) ? args : [],
      ctx: {},
    });
    result = { stdout: r.stdout, stderr: r.stderr, exitCode: r.exitCode };
  } catch (e) {
    result = { stdout: '', stderr: `search: ${e instanceof Error ? e.message : String(e)}`, exitCode: 1 };
  }

  try {
    await fetch('/api/server-generate/search-result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId, ...result }),
    });
  } catch {
    // Best-effort: if the post-back fails the server's delegation timeout falls back to a
    // server-side search, so there is nothing to recover here — just don't reject unhandled.
  }
}
