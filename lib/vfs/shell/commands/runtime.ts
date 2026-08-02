import type { ShellEnv, ShellResult } from '../types';
import { track } from '@/lib/telemetry';

/** `runtime` — show or change the project runtime. */
export async function runtimeCommand(env: ShellEnv): Promise<ShellResult> {
  const { vfs, projectId, args } = env;

  // Runtime command — change the project's runtime
  // Usage: runtime static|handlebars|react|preact|svelte|vue|python|lua
  const VALID_RUNTIMES = ['static', 'handlebars', 'react', 'preact', 'svelte', 'vue', 'python', 'lua'];
  const requested = args[0]?.toLowerCase();
  if (!requested || !VALID_RUNTIMES.includes(requested)) {
    return {
      stdout: '',
      stderr: `Usage: runtime <name>\nValid runtimes: ${VALID_RUNTIMES.join(', ')}`,
      exitCode: 1
    };
  }
  try {
    const proj = await vfs.getProject(projectId);
    if (!proj) {
      return { stdout: '', stderr: 'Project not found', exitCode: 1 };
    }
    const currentRuntime = proj.settings?.runtime || 'static';
    if (currentRuntime === requested) {
      return { stdout: `Runtime already set to ${requested}`, stderr: '', exitCode: 0 };
    }
    const runtime = requested as import('@/lib/vfs/types').ProjectRuntime;
    proj.settings = { ...proj.settings, runtime };
    await vfs.updateProject(proj);
    vfs.scheduleAutoSync(proj.id);

    // Update .PROMPT.md to match the new runtime's domain prompt.
    // Retried once — HMR can invalidate the webpack chunk for the lazy
    // prompts module, failing the first import after a hot reload.
    const { importWithRetry } = await import('../../import-retry');
    const { getDomainPrompt, isDefaultDomainPrompt } = await importWithRetry(() => import('@/lib/llm/prompts'));
    const newPrompt = getDomainPrompt(runtime);
    try {
      const existing = await vfs.readFile(projectId, '/.PROMPT.md');
      if (isDefaultDomainPrompt(typeof existing.content === 'string' ? existing.content : '')) {
        await vfs.updateFile(projectId, '/.PROMPT.md', newPrompt);
      }
      // If custom, leave it alone — the AI is managing .PROMPT.md
    } catch {
      // .PROMPT.md doesn't exist — create it
      await vfs.createFile(projectId, '/.PROMPT.md', newPrompt);
    }

    // Notify workspace so preview picks up the new runtime immediately
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('runtimeChanged', { detail: { runtime } }));
    }

    track('runtime_switch', { from: currentRuntime, to: runtime });

    return { stdout: `Runtime changed to ${requested}`, stderr: '', exitCode: 0 };
  } catch (err: any) {
    return { stdout: '', stderr: `Failed to change runtime: ${err.message}`, exitCode: 1 };
  }
}
