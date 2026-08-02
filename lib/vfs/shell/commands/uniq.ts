import type { ShellEnv, ShellResult } from '../types';
import { applyRedirectGuarded, normalizePath, truncate } from '../runtime';

/** `uniq` — collapse repeated lines. */
export async function uniqCommand(env: ShellEnv): Promise<ShellResult> {
  const { vfs, projectId, args, stdin, ctx, redirect } = env;

  // uniq [-c] [file]  (or stdin via pipe)
  let countPrefix = false;
  let filePath = '';

  for (const a of args) {
    if (a === '-c') countPrefix = true;
    else if (a && !a.startsWith('-')) filePath = a;
  }

  let inputContent: string;
  const uniqPath = normalizePath(filePath);

  if (uniqPath) {
    try {
      const file = await vfs.readFile(projectId, uniqPath);
      if (typeof file.content !== 'string') {
        return { stdout: '', stderr: `uniq: ${uniqPath}: binary file`, exitCode: 1 };
      }
      inputContent = file.content;
    } catch (e: any) {
      return { stdout: '', stderr: `uniq: ${uniqPath}: ${e?.message || 'file not found'}`, exitCode: 1 };
    }
  } else if (stdin !== undefined) {
    inputContent = stdin;
  } else {
    return { stdout: '', stderr: 'uniq: no input file or stdin', exitCode: 2 };
  }

  const lines = inputContent.split(/\r?\n/);
  const resultLines: string[] = [];
  let i = 0;
  while (i < lines.length) {
    let count = 1;
    while (i + count < lines.length && lines[i + count] === lines[i]) count++;
    resultLines.push(countPrefix ? `${String(count).padStart(7)} ${lines[i]}` : lines[i]);
    i += count;
  }

  const uniqOutput = resultLines.join('\n');
  if (redirect) return applyRedirectGuarded(vfs, projectId, uniqOutput, redirect, ctx);
  return { stdout: truncate(uniqOutput), stderr: '', exitCode: 0 };
}
