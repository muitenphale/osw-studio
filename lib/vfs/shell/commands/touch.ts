import type { ShellEnv, ShellResult } from '../types';
import { normalizePath } from '../runtime';

/** `touch` — create an empty file. */
export async function touchCommand(env: ShellEnv): Promise<ShellResult> {
  const { vfs, projectId, args } = env;

  // touch <file1> <file2> ... - create empty files or update timestamp (multiple files like real bash)
  const paths = args.filter(a => a && !a.startsWith('-')).map(p => normalizePath(p));

  if (paths.length === 0) {
    return { stdout: '', stderr: 'touch: missing file operand', exitCode: 2 };
  }

  let hadError = false;
  const errors: string[] = [];

  for (const path of paths) {
    if (!path) continue;

    try {
      // Check if file exists
      await vfs.readFile(projectId, path);
      // File exists, just continue (we don't update timestamps)
    } catch {
      // File doesn't exist, create it with empty content
      try {
        await vfs.createFile(projectId, path, '');
      } catch (e: any) {
        hadError = true;
        errors.push(`touch: cannot touch '${path}': ${e?.message || 'cannot create file'}`);
      }
    }
  }

  return {
    stdout: '',
    stderr: errors.join('\n'),
    exitCode: hadError ? 1 : 0
  };
}
