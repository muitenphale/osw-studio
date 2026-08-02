import type { ShellEnv, ShellResult } from '../types';
import { applyRedirectGuarded, normalizePath, truncate } from '../runtime';

/** `sort` — sort lines. */
export async function sortCommand(env: ShellEnv): Promise<ShellResult> {
  const { vfs, projectId, args, stdin, ctx, redirect } = env;

  // sort [-r] [-n] [-u] [file]  (or stdin via pipe)
  const sortFlags = { r: false, n: false, u: false };
  let filePath = '';

  for (const a of args) {
    if (a && a.startsWith('-') && /^-[rnu]+$/.test(a)) {
      for (const ch of a.slice(1)) {
        if (ch === 'r') sortFlags.r = true;
        else if (ch === 'n') sortFlags.n = true;
        else if (ch === 'u') sortFlags.u = true;
      }
    } else if (a) {
      filePath = a;
    }
  }

  let inputContent: string;
  const sortPath = normalizePath(filePath);

  if (sortPath) {
    try {
      const file = await vfs.readFile(projectId, sortPath);
      if (typeof file.content !== 'string') {
        return { stdout: '', stderr: `sort: ${sortPath}: binary file`, exitCode: 1 };
      }
      inputContent = file.content;
    } catch (e: any) {
      return { stdout: '', stderr: `sort: ${sortPath}: ${e?.message || 'file not found'}`, exitCode: 1 };
    }
  } else if (stdin !== undefined) {
    inputContent = stdin;
  } else {
    return { stdout: '', stderr: 'sort: no input file or stdin', exitCode: 2 };
  }

  let lines = inputContent.split(/\r?\n/);
  if (sortFlags.n) {
    lines.sort((a, b) => {
      const na = parseFloat(a) || 0;
      const nb = parseFloat(b) || 0;
      return na - nb;
    });
  } else {
    lines.sort();
  }
  if (sortFlags.r) lines.reverse();
  if (sortFlags.u) lines = lines.filter((line, i, arr) => i === 0 || line !== arr[i - 1]);

  const sortOutput = lines.join('\n');
  if (redirect) return applyRedirectGuarded(vfs, projectId, sortOutput, redirect, ctx);
  return { stdout: truncate(sortOutput), stderr: '', exitCode: 0 };
}
