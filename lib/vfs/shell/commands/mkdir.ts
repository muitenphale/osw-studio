import type { ShellEnv, ShellResult } from '../types';
import { ensureDirectory, normalizePath } from '../runtime';

/** `mkdir` — create a directory (-p for parents). */
export async function mkdirCommand(env: ShellEnv): Promise<ShellResult> {
  const { vfs, projectId, args } = env;

  // Support: mkdir [-p] <path1> <path2> ... (multiple paths like real bash)
  const hasP = args.includes('-p');
  const paths = args.filter(a => a && a !== '-p').map(p => normalizePath(p));

  if (paths.length === 0) {
    return { stdout: '', stderr: 'mkdir: missing operand', exitCode: 2 };
  }

  let hadError = false;
  const errors: string[] = [];

  for (const path of paths) {
    if (!path) continue;

    // Block mkdir under /.server/ - these are transient/auto-generated
    if (path.startsWith('/.server/')) {
      errors.push(`mkdir: cannot create '${path}': server context directories are auto-generated`);
      hadError = true;
      continue;
    }

    try {
      if (hasP) {
        await ensureDirectory(vfs, projectId, path);
      } else {
        await vfs.createDirectory(projectId, path);
      }
    } catch (e: any) {
      hadError = true;
      errors.push(`mkdir: cannot create directory '${path}': ${e?.message || 'unknown error'}`);
    }
  }

  return {
    stdout: '',
    stderr: errors.join('\n'),
    exitCode: hadError ? 1 : 0
  };
}
