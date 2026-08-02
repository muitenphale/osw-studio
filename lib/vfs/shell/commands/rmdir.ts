import type { ShellEnv, ShellResult } from '../types';
import { normalizePath } from '../runtime';

/** `rmdir` — delete a directory, only when empty (-p also removes emptied parents). */
export async function rmdirCommand(env: ShellEnv): Promise<ShellResult> {
  const { vfs, projectId, args } = env;

  // rmdir [-p] <dir...> — removes a directory only when it is empty.
  //
  // vfs.deleteDirectory() deletes contained files recursively, so emptiness is checked here
  // rather than delegated. That is the point of the command: `rm -r` is the destructive
  // form, `rmdir` refuses when anything is still inside.
  let rmdirParents = false;
  const rmdirTargets: string[] = [];
  for (const a of args) {
    if (!a) continue;
    if (a.startsWith('-')) {
      if (a === '-p' || a === '--parents') { rmdirParents = true; continue; }
      return { stdout: '', stderr: `rmdir: unsupported option '${a}' (supported: -p)`, exitCode: 2 };
    }
    rmdirTargets.push(a);
  }
  if (rmdirTargets.length === 0) {
    return { stdout: '', stderr: 'rmdir: missing operand', exitCode: 2 };
  }

  const entries = await vfs.getAllFilesAndDirectories(projectId, { includeTransient: true });
  // The listing is read once, so directories removed during this run are tracked here —
  // otherwise a parent emptied by -p would still look occupied by the child just deleted.
  const rmdirRemoved = new Set<string>();
  const rmdirErrors: string[] = [];

  const removeIfEmpty = async (path: string): Promise<string | null> => {
    const exists =
      !rmdirRemoved.has(path)
      && entries.some((e: { path: string; type?: string }) => e.path === path && e.type === 'directory');
    if (!exists) return `rmdir: failed to remove '${path}': No such directory`;

    const prefix = path.endsWith('/') ? path : path + '/';
    const contents = entries.filter(
      (e: { path: string }) => e.path.startsWith(prefix) && !rmdirRemoved.has(e.path)
    );
    if (contents.length > 0) {
      return `rmdir: failed to remove '${path}': Directory not empty (${contents.length} item(s); use rm -r to remove them)`;
    }

    try {
      await vfs.deleteDirectory(projectId, path);
      rmdirRemoved.add(path);
      return null;
    } catch (e: any) {
      return `rmdir: failed to remove '${path}': ${e?.message || 'unknown error'}`;
    }
  };

  for (const target of rmdirTargets) {
    const path = normalizePath(target);
    if (!path || path === '/') {
      rmdirErrors.push(`rmdir: failed to remove '${target}': Invalid path`);
      continue;
    }

    // Without -p this runs once; with it, keep walking up while each ancestor comes out
    // empty, stopping at the first that does not (as a real shell reports).
    let current: string | null = path;
    while (current && current !== '/') {
      const failure = await removeIfEmpty(current);
      if (failure) {
        rmdirErrors.push(failure);
        break;
      }
      if (!rmdirParents) break;
      const parent: string = current.slice(0, current.lastIndexOf('/')) || '/';
      current = parent === '/' ? null : parent;
    }
  }

  return {
    stdout: '',
    stderr: rmdirErrors.join('\n'),
    exitCode: rmdirErrors.length > 0 ? 1 : 0,
  };
}
