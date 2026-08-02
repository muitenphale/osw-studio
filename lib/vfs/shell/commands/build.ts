import type { ShellEnv, ShellResult } from '../types';
import { drainCompileErrors, formatCompileErrors } from '@/lib/preview/compile-errors';

/** `build` — compile the project and report errors. */
export async function buildCommand(env: ShellEnv): Promise<ShellResult> {
  const { vfs, projectId } = env;

  // Build command — triggers its own compilation for reliable results.
  // Previously piggybacked on the preview's debounced compile, causing race
  // conditions when the AI writes multiple files before calling build.
  try {
    const { VirtualServer } = await import('@/lib/preview/virtual-server');
    const buildProject = await vfs.getProject(projectId);
    const server = new VirtualServer(vfs, projectId, { runtime: buildProject?.settings?.runtime });
    await server.compileProject();
    server.cleanupBlobUrls();

    const compileErrors = drainCompileErrors();
    if (compileErrors.length === 0) {
      return { stdout: 'Build successful — 0 errors', stderr: '', exitCode: 0 };
    }
    return { stdout: '', stderr: formatCompileErrors(compileErrors), exitCode: 1 };
  } catch (err: any) {
    return { stdout: '', stderr: `Build failed: ${err.message}`, exitCode: 1 };
  }
}
