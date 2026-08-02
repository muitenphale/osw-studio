import type { ShellEnv, ShellResult } from '../types';
import { applyRedirectGuarded, truncate } from '../runtime';

/** `tr` — translate or delete characters. */
export async function trCommand(env: ShellEnv): Promise<ShellResult> {
  const { vfs, projectId, args, stdin, ctx, redirect } = env;

  // tr [-d] SET1 [SET2]  (operates on stdin)
  let deleteMode = false;
  const trArgs: string[] = [];

  for (const a of args) {
    if (a === '-d') deleteMode = true;
    else trArgs.push(a);
  }

  if (stdin === undefined) {
    return { stdout: '', stderr: 'tr: no stdin (use with pipe, e.g. cat file | tr ...)', exitCode: 2 };
  }

  const set1 = trArgs[0] || '';
  const set2 = trArgs[1] || '';

  if (!set1) {
    return { stdout: '', stderr: 'tr: missing SET1\n\nUsage: tr [-d] SET1 [SET2]\n  tr \'a-z\' \'A-Z\'  — translate lowercase to uppercase\n  tr -d \'chars\'    — delete characters', exitCode: 2 };
  }

  // Expand ranges like a-z, A-Z, 0-9
  const expandRange = (s: string): string => {
    let result = '';
    for (let i = 0; i < s.length; i++) {
      if (i + 2 < s.length && s[i + 1] === '-') {
        const start = s.charCodeAt(i);
        const end = s.charCodeAt(i + 2);
        for (let c = start; c <= end; c++) result += String.fromCharCode(c);
        i += 2;
      } else {
        result += s[i];
      }
    }
    return result;
  };

  const expandedSet1 = expandRange(set1);

  if (deleteMode) {
    const deleteChars = new Set(expandedSet1.split(''));
    const trOutput = stdin.split('').filter(ch => !deleteChars.has(ch)).join('');
    if (redirect) return applyRedirectGuarded(vfs, projectId, trOutput, redirect, ctx);
    return { stdout: truncate(trOutput), stderr: '', exitCode: 0 };
  }

  const expandedSet2 = expandRange(set2);
  const charMap = new Map<string, string>();
  for (let i = 0; i < expandedSet1.length; i++) {
    charMap.set(expandedSet1[i], expandedSet2[Math.min(i, expandedSet2.length - 1)] || '');
  }

  const trOutput = stdin.split('').map(ch => charMap.get(ch) ?? ch).join('');
  if (redirect) return applyRedirectGuarded(vfs, projectId, trOutput, redirect, ctx);
  return { stdout: truncate(trOutput), stderr: '', exitCode: 0 };
}
