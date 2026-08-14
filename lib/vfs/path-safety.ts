/**
 * Whether a virtual file path is safe to turn into a filesystem path.
 *
 * A project's file paths are attacker-controlled: any workspace member can push arbitrary paths
 * through the sync API, and publishing joins them onto the deployment's output directory. Without
 * this a path like `/assets/../../../../x` escapes that directory and writes wherever the server
 * process can reach, which on a multi-tenant instance includes other workspaces' databases.
 *
 * Callers get both halves: `isSafeVirtualPath` rejects at the boundary where the path arrives, and
 * `resolveWithin` contains at the point of the write, so a path reaching disk by some route that
 * skipped validation still cannot land outside its directory.
 */
import path from 'path';

/**
 * A path is safe when it is absolute in the virtual sense (leading `/`), and no segment is `.` or
 * `..`. Backslashes are rejected outright rather than normalized: `path.win32` treats them as
 * separators, so on Windows `a\..\..\x` traverses while looking like an ordinary file name here.
 */
export function isSafeVirtualPath(virtualPath: unknown): virtualPath is string {
  if (typeof virtualPath !== 'string') return false;
  if (!virtualPath.startsWith('/')) return false;
  if (virtualPath.includes('\0') || virtualPath.includes('\\')) return false;

  for (const segment of virtualPath.split('/')) {
    if (segment === '.' || segment === '..') return false;
  }

  return true;
}

/**
 * Join a virtual path onto a directory, returning null when the result would fall outside it.
 *
 * The comparison is on resolved paths with a trailing separator, so a sibling directory sharing a
 * name prefix (`/out/deployments-old` against `/out/deployments`) does not count as inside.
 */
export function resolveWithin(baseDir: string, virtualPath: string): string | null {
  const relative = virtualPath.startsWith('/') ? virtualPath.slice(1) : virtualPath;
  const base = path.resolve(baseDir);
  const resolved = path.resolve(base, relative);

  if (resolved !== base && !resolved.startsWith(base + path.sep)) return null;
  return resolved;
}
