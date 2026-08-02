import type { ShellEnv, ShellResult } from '../types';
import { applyRedirectGuarded, normalizePath, truncate } from '../runtime';

/** `find` — find files by name or type. */
export async function findCommand(env: ShellEnv): Promise<ShellResult> {
  const { vfs, projectId, args, ctx, redirect } = env;

  // Supported: find <path> [-type f|d] [-name <pattern>] [-maxdepth <depth>]
  let rootArg: string | undefined;
  let pattern: string | undefined;
  let typeFilter: 'f' | 'd' | undefined;
  let maxDepth = Infinity;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a) continue;
    if (a === '-name') { pattern = args[i + 1]; i++; continue; }
    if (a === '-type') {
      const typeVal = args[i + 1];
      if (typeVal === 'f' || typeVal === 'd') {
        typeFilter = typeVal;
      }
      i++;
      continue;
    }
    if (a === '-maxdepth') { maxDepth = parseInt(args[i + 1]) || 0; i++; continue; }
    if (!a.startsWith('-') && !rootArg) rootArg = a;
  }

  const root = normalizePath(rootArg) || '/';
  const entries = await vfs.getAllFilesAndDirectories(projectId, { includeTransient: true });
  const prefix = root === '/' ? '/' : (root.endsWith('/') ? root : root + '/');
  const toGlob = (s: string) => new RegExp('^' + s.replace(/[.+^${}()|\[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
  const regex = pattern ? toGlob(pattern) : null;

  // Count depth relative to root: /root/a = depth 1, /root/a/b = depth 2
  const rootDepth = root === '/' ? 0 : root.split('/').filter(Boolean).length;

  const res = entries
    .filter((e: any) => e.path === root || e.path.startsWith(prefix))
    .filter((e: any) => {
      // Filter by maxdepth
      const entryDepth = e.path === '/' ? 0 : e.path.split('/').filter(Boolean).length;
      if (entryDepth - rootDepth > maxDepth) return false;
      // Filter by type if specified
      if (typeFilter === 'f') {
        return !('type' in e) || e.type !== 'directory';
      }
      if (typeFilter === 'd') {
        return 'type' in e && e.type === 'directory';
      }
      return true; // No type filter, include all
    })
    .map((e: any) => e.path)
    .filter(p => (regex ? regex.test(p.split('/').pop() || p) : true))
    .sort();

  const findResult: ShellResult = { stdout: truncate(res.join('\n')), stderr: '', exitCode: 0 };
  if (redirect) return applyRedirectGuarded(vfs, projectId, findResult.stdout, redirect, ctx);
  return findResult;
}
