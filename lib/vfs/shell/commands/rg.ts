import type { ShellEnv, ShellResult } from '../types';
import { applyRedirectGuarded, normalizePath, truncate } from '../runtime';

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
            const matchedStdinLines = new Set<number>();
            for (let i = 0; i < stdinLines.length; i++) {
              if (regex.test(stdinLines[i])) matchedStdinLines.add(i);
            }
            if (matchedStdinLines.size > 0) {
              const contextStdinLines = new Set<number>();
              const beforeCtx = flags.C || flags.B;
              const afterCtx = flags.C || flags.A;
              for (const ln of matchedStdinLines) {
                for (let j = Math.max(0, ln - beforeCtx); j <= Math.min(stdinLines.length - 1, ln + afterCtx); j++) {
                  contextStdinLines.add(j);
                }
              }
              for (const ln of Array.from(contextStdinLines).sort((a, b) => a - b)) {
                const lineNumStr = flags.n ? `${ln + 1}:` : '';
                outLines.push(`${lineNumStr}${stdinLines[ln]}`);
              }
            }
          } else {
            const entries = await vfs.getAllFilesAndDirectories(projectId, { includeTransient: true });
            const dirPrefix = path === '/' ? '/' : (path.endsWith('/') ? path : path + '/');

            for (const e of entries) {
              if ('type' in e && e.type === 'directory') continue;
              const file = e as any;
              if (!file.path.startsWith(dirPrefix) && file.path !== path) continue;
              if (typeof file.content !== 'string') continue;

              const lines = file.content.split(/\r?\n/);
              const matchedLines = new Set<number>();

              // Find all matches
              for (let i = 0; i < lines.length; i++) {
                if (regex.test(lines[i])) {
                  matchedLines.add(i);
                }
              }

              if (matchedLines.size === 0) continue;

              // Add context lines
              const contextLines = new Set<number>();
              const beforeContext = flags.C || flags.B;
              const afterContext = flags.C || flags.A;

              for (const lineNum of matchedLines) {
                for (let j = Math.max(0, lineNum - beforeContext); j <= Math.min(lines.length - 1, lineNum + afterContext); j++) {
                  contextLines.add(j);
                }
              }

              // Output with line numbers
              const sortedLines = Array.from(contextLines).sort((a, b) => a - b);
              if (outLines.length > 0) outLines.push(''); // Separator between files

              for (const lineNum of sortedLines) {
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
