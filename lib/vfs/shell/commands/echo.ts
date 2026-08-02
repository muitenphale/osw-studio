import type { ShellEnv, ShellResult } from '../types';
import { applyRedirectGuarded, truncate } from '../runtime';

/** `echo` — output text (writes when redirected). */
export async function echoCommand(env: ShellEnv): Promise<ShellResult> {
  const { vfs, projectId, args, ctx, redirect } = env;

  // echo [-n] [-e] text — redirect handled generically by extractRedirect/applyRedirectGuarded
  let suppressNewline = false;
  let interpretEscapes = false;
  let startIdx = 0;

  // Consume leading flag args (bash behavior: only leading args that are purely valid flag chars)
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('-') && a.length > 1 && /^-[ne]+$/.test(a)) {
      for (const ch of a.slice(1)) {
        if (ch === 'n') suppressNewline = true;
        else if (ch === 'e') interpretEscapes = true;
      }
      startIdx = i + 1;
    } else {
      break;
    }
  }

  let output = args.slice(startIdx).join(' ');

  if (interpretEscapes) {
    output = output
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\\\/g, '\\');
  }

  // suppressNewline: our shell doesn't auto-append newlines so it's effectively a no-op,
  // but the flag is consumed so it doesn't appear in output.

  if (redirect) return applyRedirectGuarded(vfs, projectId, output, redirect, ctx);
  return { stdout: truncate(output), stderr: '', exitCode: 0 };
}
