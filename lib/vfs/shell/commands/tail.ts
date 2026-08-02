import type { ShellEnv, ShellResult } from '../types';
import { parseHeadTailArgs } from '../internals';
import { applyRedirectGuarded, normalizePath, truncate } from '../runtime';

/** `tail` — read last lines (-n) or characters (-c). */
export async function tailCommand(env: ShellEnv): Promise<ShellResult> {
  const { vfs, projectId, args, stdin, ctx, redirect } = env;

  // tail [-n lines | -c chars | -lines] <file>  (or stdin via pipe)
  const parsed = parseHeadTailArgs(args, 'tail');
  if ('error' in parsed) return { stdout: '', stderr: parsed.error, exitCode: 2 };
  const { count: numLines, bytes, filePath } = parsed;

  // Use stdin if no file path and stdin is available
  if (!filePath && stdin !== undefined) {
    const output = bytes ? stdin.slice(-numLines) : stdin.split(/\r?\n/).slice(-numLines).join('\n');
    const result: ShellResult = { stdout: truncate(output), stderr: '', exitCode: 0 };
    if (redirect) return applyRedirectGuarded(vfs, projectId, result.stdout, redirect, ctx);
    return result;
  }

  const path = normalizePath(filePath);
  if (!path) return { stdout: '', stderr: 'tail: missing file path', exitCode: 2 };

  try {
    const file = await vfs.readFile(projectId, path);
    if (typeof file.content !== 'string') {
      return { stdout: '', stderr: `tail: ${path}: binary file`, exitCode: 1 };
    }

    const output = bytes
      ? file.content.slice(-numLines)
      : file.content.split(/\r?\n/).slice(-numLines).join('\n');
    const result: ShellResult = { stdout: truncate(output), stderr: '', exitCode: 0 };
    if (redirect) return applyRedirectGuarded(vfs, projectId, result.stdout, redirect, ctx);
    return result;
  } catch (e: any) {
    return { stdout: '', stderr: `tail: ${path}: ${e?.message || 'file not found'}`, exitCode: 1 };
  }
}
