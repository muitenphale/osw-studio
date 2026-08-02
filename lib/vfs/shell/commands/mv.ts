import type { ShellEnv, ShellResult } from '../types';
import { normalizePath } from '../runtime';

/** `mv` — move or rename. */
export async function mvCommand(env: ShellEnv): Promise<ShellResult> {
  const { vfs, projectId, args } = env;

  const [rold, rnew] = args;
  const oldPath = normalizePath(rold);
  const newPath = normalizePath(rnew);
  if (!oldPath || !newPath) return { stdout: '', stderr: 'mv: missing operands', exitCode: 2 };
  // Try file move
  try {
    await vfs.renameFile(projectId, oldPath, newPath);
    return { stdout: '', stderr: '', exitCode: 0 };
  } catch {
    // Try directory move
    await vfs.renameDirectory(projectId, oldPath, newPath);
    return { stdout: '', stderr: '', exitCode: 0 };
  }
}
