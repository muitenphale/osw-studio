import type { ShellEnv, ShellResult } from '../types';
import { applyRedirectGuarded, normalizePath, truncate } from '../runtime';

/** `grep` — search file contents. */
export async function grepCommand(env: ShellEnv): Promise<ShellResult> {
  const { vfs, projectId, args, stdin, ctx, redirect } = env;

          // Supported: grep [-n] [-i] [-o] [-F] [-P] [-A num] [-B num] [-C num] pattern path  (always recursive)
          const flags: Record<string, any> = { n: false, i: false, o: false, F: false, C: 0, A: 0, B: 0 };
          const fargs: string[] = [];
          for (let i = 0; i < args.length; i++) {
            const a = args[i];
            if (a.startsWith('-') && a.length > 1 && !/^-\d+$/.test(a)) {
              const flagStr = a.slice(1);
              for (let j = 0; j < flagStr.length; j++) {
                const ch = flagStr[j];
                if (ch === 'n') flags.n = true;
                else if (ch === 'i') flags.i = true;
                else if (ch === 'o') flags.o = true;
                else if (ch === 'F') flags.F = true;
                else if (ch === 'P') {} // no-op — JS regex covers most PCRE patterns
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
              stderr: `grep: missing pattern

  Usage: grep [FLAGS] PATTERN [PATH]

  Supported flags:
    -n      Show line numbers
    -i      Case insensitive search
    -o      Print only the matched parts of each line (one per line)
    -F      Treat pattern as literal string (not regex)
    -P      Perl-compatible regex (accepted, JS regex used)
    -A NUM  Show NUM lines after each match
    -B NUM  Show NUM lines before each match
    -C NUM  Show NUM lines of context (before and after)

  Examples:
    {"cmd": ["grep", "searchterm", "/path"]}
    {"cmd": ["grep", "-n", "pattern", "/file.txt"]}
    {"cmd": ["grep", "-i", "TODO", "/"]}
    {"cmd": ["grep", "-o", "href=\"[^\"]*\"", "/index.html"]}
    {"cmd": ["grep", "-F", "exact.string", "/src"]}
    {"cmd": ["grep", "-A", "3", "pattern", "/file.txt"]}
    {"cmd": ["grep", "-C", "5", "function", "/src"]}

  Note: grep always searches recursively. rg (ripgrep) is also available.`,
              exitCode: 2
            };
          }

          // Create regex - escape special chars if -F flag is used
          let regex: RegExp;
          if (flags.F) {
            const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            regex = new RegExp(escaped, flags.i ? 'i' : '');
          } else {
            regex = new RegExp(pattern, flags.i ? 'i' : '');
          }

          const outLines: string[] = [];
          const hasContext = flags.C > 0 || flags.A > 0 || flags.B > 0;
          const globalRegex = flags.o ? new RegExp(regex.source, regex.flags + 'g') : null;

          // If no file path provided and stdin is available, search stdin
          if (!fargs[1] && stdin !== undefined) {
            const stdinLines = stdin.split(/\r?\n/);
            if (flags.o) {
              for (let i = 0; i < stdinLines.length; i++) {
                const matches = [...stdinLines[i].matchAll(globalRegex!)];
                for (const m of matches) {
                  outLines.push(flags.n ? `${i + 1}:${m[0]}` : m[0]);
                }
              }
            } else if (hasContext) {
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
                  outLines.push(flags.n ? `${ln + 1}:${stdinLines[ln]}` : stdinLines[ln]);
                }
              }
            } else {
              for (let i = 0; i < stdinLines.length; i++) {
                if (regex.test(stdinLines[i])) {
                  outLines.push(flags.n ? `${i + 1}:${stdinLines[i]}` : stdinLines[i]);
                }
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

              if (flags.o) {
                for (let i = 0; i < lines.length; i++) {
                  const matches = [...lines[i].matchAll(globalRegex!)];
                  for (const m of matches) {
                    outLines.push(`${file.path}${flags.n ? ':' + (i + 1) : ''}:${m[0]}`);
                  }
                }
              } else if (hasContext) {
                const matchedLines = new Set<number>();
                for (let i = 0; i < lines.length; i++) {
                  if (regex.test(lines[i])) matchedLines.add(i);
                }
                if (matchedLines.size === 0) continue;

                const contextLines = new Set<number>();
                const beforeContext = flags.C || flags.B;
                const afterContext = flags.C || flags.A;
                for (const lineNum of matchedLines) {
                  for (let j = Math.max(0, lineNum - beforeContext); j <= Math.min(lines.length - 1, lineNum + afterContext); j++) {
                    contextLines.add(j);
                  }
                }

                const sortedLines = Array.from(contextLines).sort((a, b) => a - b);
                if (outLines.length > 0) outLines.push(''); // separator between files
                for (const lineNum of sortedLines) {
                  outLines.push(`${file.path}${flags.n ? ':' + (lineNum + 1) : ''}:${lines[lineNum]}`);
                }
              } else {
                for (let i = 0; i < lines.length; i++) {
                  if (regex.test(lines[i])) {
                    outLines.push(`${file.path}${flags.n ? ':' + (i + 1) : ''}:${lines[i]}`);
                  }
                }
              }
            }
          }

          const output = outLines.join('\n');
          if (outLines.length === 0) {
            return { stdout: '', stderr: '', exitCode: 0 };
          }
          const grepResult: ShellResult = { stdout: truncate(output), stderr: '', exitCode: 0 };
          if (redirect) return applyRedirectGuarded(vfs, projectId, grepResult.stdout, redirect, ctx);
          return grepResult;
}
