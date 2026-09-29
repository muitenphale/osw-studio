import type { ShellEnv, ShellResult } from '../types';
import { applyRedirectGuarded, normalizePath, truncate } from '../runtime';
import { contextWindow, matchingLines, searchableFiles } from './search-shared';

/** `rg` — search with context (preferred over grep). */
export async function rgCommand(env: ShellEnv): Promise<ShellResult> {
  const { vfs, projectId, args, stdin, ctx, redirect } = env;

          // ripgrep with context flags: rg [-n] [-i] [-C num] [-A num] [-B num] pattern [path]
          // Also supports combined flags like -nC, -ni, etc.
          const flags: Record<string, any> = { n: true, i: false, C: 0, A: 0, B: 0 };
          const fargs: string[] = [];
          for (let i = 0; i < args.length; i++) {
            const a = args[i];
            if (a.startsWith('-') && a.length > 1 && !/^-\d+$/.test(a)) {
              // Handle combined flags like -nC, -ni, -iC, etc.
              const flagStr = a.slice(1);
              for (let j = 0; j < flagStr.length; j++) {
                const ch = flagStr[j];
                if (ch === 'n') flags.n = true;
                else if (ch === 'i') flags.i = true;
                else if (ch === 'C') { flags.C = parseInt(args[++i]) || 2; break; }
                else if (ch === 'A') { flags.A = parseInt(args[++i]) || 2; break; }
                else if (ch === 'B') { flags.B = parseInt(args[++i]) || 2; break; }
              }
            } else {
              fargs.push(a);
            }
          }
          const pattern = fargs[0];
          const path = normalizePath(fargs[1]) || '/';
          if (!pattern) {
            return {
              stdout: '',
              stderr: `rg: missing pattern

  Usage: rg [FLAGS] PATTERN [PATH]

  Supported flags:
    -C NUM  Show NUM lines of context (before and after)
    -A NUM  Show NUM lines after each match
    -B NUM  Show NUM lines before each match
    -i      Case insensitive search
    -n      Show line numbers (enabled by default)

  Examples:
    {"cmd": ["rg", "searchterm", "/"]}
    {"cmd": ["rg", "-C", "3", "pattern", "/"]}
    {"cmd": ["rg", "-A", "5", "-B", "2", "function", "/src"]}
    {"cmd": ["rg", "-i", "todo", "/"]}

  Tip: Use -C for balanced context. PATH defaults to / if omitted.`,
              exitCode: 2
            };
          }

          const regex = new RegExp(pattern, flags.i ? 'i' : '');
          const outLines: string[] = [];

          // If no file path provided and stdin is available, search stdin
          if (!fargs[1] && stdin !== undefined) {
            const stdinLines = stdin.split(/\r?\n/);
            const matched = matchingLines(stdinLines, regex);
            if (matched.length > 0) {
              const window = contextWindow(matched, stdinLines.length, flags.C || flags.B, flags.C || flags.A);
              for (const ln of window) {
                const lineNumStr = flags.n ? `${ln + 1}:` : '';
                outLines.push(`${lineNumStr}${stdinLines[ln]}`);
              }
            }
          } else {
            for (const file of await searchableFiles(env, path)) {
              const lines = file.content.split(/\r?\n/);
              const matched = matchingLines(lines, regex);
              if (matched.length === 0) continue;

              const window = contextWindow(matched, lines.length, flags.C || flags.B, flags.C || flags.A);
              if (outLines.length > 0) outLines.push(''); // Separator between files

              for (const lineNum of window) {
                const lineNumStr = flags.n ? `${lineNum + 1}:` : '';
                outLines.push(`${file.path}:${lineNumStr}${lines[lineNum]}`);
              }
            }
          }

          if (outLines.length === 0) {
            return { stdout: '', stderr: '', exitCode: 0 };
          }
          const rgResult: ShellResult = { stdout: truncate(outLines.join('\n')), stderr: '', exitCode: 0 };
          if (redirect) return applyRedirectGuarded(vfs, projectId, rgResult.stdout, redirect, ctx);
          return rgResult;
}
