/**
 * Per-agent write scoping. A restricted agent (e.g. the interview agent) may
 * read anywhere but write only within a single directory. The guard lives next
 * to the existing read-only gate in tool-registry; these are its pure,
 * unit-testable helpers. Paths containing `..` are rejected outright — the VFS
 * has no symlinks, so a plain reject is sufficient.
 */

import { alwaysWriteCommands } from '@/lib/vfs/shell-commands';

/** Derived from the command registry so a new writing command cannot be missed here. */
const WRITE_COMMANDS = alwaysWriteCommands();

function hasRedirect(cmd: string[]): boolean {
  return cmd.includes('>') || cmd.includes('>>');
}

/** Mirrors isWriteOperation() in tool-registry — which commands mutate the VFS. */
function isWriteCommand(cmd: string[]): boolean {
  const c = cmd[0];
  if (WRITE_COMMANDS.has(c)) return true;
  if (c === 'sed' && cmd.includes('-i')) return true;
  if (c === 'curl' && (cmd.includes('-o') || cmd.includes('--output'))) return true;
  if (hasRedirect(cmd)) return true;
  return false;
}

/** Normalize a raw command-line path token to an absolute VFS path. */
function toAbsolute(p: string): string {
  let t = p.replace(/^['"]|['"]$/g, '');
  if (!t.startsWith('/')) t = '/' + t;
  return t;
}

/**
 * Extract the write target path(s) from a command, normalized to absolute.
 *   []      → the command does not write.
 *   null    → the command writes but the target could not be determined (caller fails closed).
 *   [paths] → the write target(s).
 */
export function writeTargets(cmd: string[]): string[] | null {
  if (!isWriteCommand(cmd)) return [];

  // Redirect: target is the token after the last >/>>
  if (hasRedirect(cmd)) {
    const idx = Math.max(cmd.lastIndexOf('>'), cmd.lastIndexOf('>>'));
    const target = cmd[idx + 1];
    return target ? [toAbsolute(target)] : null;
  }

  const c = cmd[0];
  const rest = cmd.slice(1);
  const nonFlags = rest.filter(a => !a.startsWith('-'));

  if (c === 'curl') {
    const i = cmd.findIndex(a => a === '-o' || a === '--output');
    const target = cmd[i + 1];
    return target ? [toAbsolute(target)] : null;
  }

  if (c === 'generate-image') {
    // Writes the image to --out/-o when given, otherwise to /.generated/.
    const i = cmd.findIndex(a => a === '--out' || a === '-o');
    if (i >= 0) {
      const target = cmd[i + 1];
      return target ? [toAbsolute(target)] : null;
    }
    return ['/.generated/'];
  }

  if (c === 'runtime') {
    // Changing the runtime rewrites the project's prompt file; the path is not in argv.
    return ['/.PROMPT.md'];
  }

  if (c === 'sed') {
    // sed -i [script] <file> — the file is the last non-flag arg
    const file = nonFlags[nonFlags.length - 1];
    return file ? [toAbsolute(file)] : null;
  }

  if (c === 'cp' || c === 'mv') {
    // destination is the last non-flag arg; need at least source + dest
    if (nonFlags.length < 2) return null;
    return [toAbsolute(nonFlags[nonFlags.length - 1])];
  }

  // ss, touch, mkdir, rm, rmdir — non-flag args are the targets
  if (nonFlags.length === 0) return null;
  return nonFlags.map(toAbsolute);
}

/** True if `path` is a file strictly inside `scope` (and contains no `..`). */
export function isPathWithinScope(scope: string, path: string): boolean {
  if (!scope) return true;
  if (path.includes('..')) return false;
  const s = scope.endsWith('/') ? scope : scope + '/';
  // The scope directory itself is in-scope (e.g. mkdir/rmdir of the dir the
  // agent writes into) — operating on it escapes nothing.
  if (path === s.slice(0, -1)) return true;
  return path.startsWith(s);
}

/** Decide whether a command's writes are permitted under an agent's writeScope. */
export function checkWriteScope(
  cmd: string[],
  scope: string | undefined,
): { allowed: boolean; reason?: string } {
  if (!scope) return { allowed: true };
  const targets = writeTargets(cmd);
  if (targets === null) {
    return { allowed: false, reason: `this agent may only write within ${scope}, and the write target could not be verified` };
  }
  for (const t of targets) {
    if (!isPathWithinScope(scope, t)) {
      return { allowed: false, reason: `this agent may only write within ${scope} (attempted: ${t})` };
    }
  }
  return { allowed: true };
}
