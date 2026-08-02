import type { ShellEnv, ShellResult } from '../types';
import { normalizePath, truncate } from '../runtime';

/** `rm` — delete files or directories (-rf). */
export async function rmCommand(env: ShellEnv): Promise<ShellResult> {
  const { vfs, projectId, args } = env;

  // Enhanced rm command: rm [-rfv] <file/dir...>
  // Parse flags including combined flags like -rf, -rfv
  let recursive = false;
  let force = false;
  let verbose = false;
  const targets: string[] = [];

  for (const arg of args) {
    if (arg && arg.startsWith('-')) {
      // Handle combined flags like -rf, -rfv
      if (arg.includes('r') || arg.includes('R')) recursive = true;
      if (arg.includes('f')) force = true;
      if (arg.includes('v')) verbose = true;
    } else if (arg) {
      targets.push(arg);
    }
  }

  if (targets.length === 0) return { stdout: '', stderr: 'rm: missing operand', exitCode: 2 };

  let hadError = false;
  const verboseOutput: string[] = [];
  const errorMessages: string[] = [];

  for (const target of targets) {
    const path = normalizePath(target);
    if (!path) {
      if (!force) hadError = true;
      continue;
    }

    // Handle server context files (/.server/)
    if (path.startsWith('/.server/')) {
      try {
        await vfs.deleteServerContextFile(path);
        if (verbose) verboseOutput.push(`removed '${path}'`);
      } catch (e: any) {
        if (!force) {
          hadError = true;
          const msg = `rm: cannot remove '${path}': ${e?.message || 'unknown error'}`;
          errorMessages.push(msg);
          if (verbose) verboseOutput.push(msg);
        }
      }
      continue;
    }

    try {
      // Try to delete as file first
      await vfs.deleteFile(projectId, path);
      if (verbose) verboseOutput.push(`removed '${path}'`);
    } catch {
      // If not a file, try as directory
      if (recursive) {
        try {
          await vfs.deleteDirectory(projectId, path);
          if (verbose) verboseOutput.push(`removed directory '${path}'`);
        } catch {
          if (!force) {
            hadError = true;
            const msg = `rm: cannot remove '${path}': No such file or directory`;
            errorMessages.push(msg);
            if (verbose) verboseOutput.push(msg);
          }
        }
      } else {
        if (!force) {
          hadError = true;
          const msg = `rm: cannot remove '${path}': Is a directory (use -r to remove directories)`;
          errorMessages.push(msg);
          if (verbose) verboseOutput.push(msg);
        }
      }
    }
  }

  const stdout = verbose ? verboseOutput.join('\n') : '';
  const stderr = hadError ? errorMessages.join('\n') : '';
  return { stdout: truncate(stdout), stderr, exitCode: hadError ? 1 : 0 };
}
