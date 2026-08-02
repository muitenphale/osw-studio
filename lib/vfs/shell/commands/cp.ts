import type { ShellEnv, ShellResult } from '../types';
import { ensureDirectory, normalizePath } from '../runtime';

/** `cp` — copy files or directories. */
export async function cpCommand(env: ShellEnv): Promise<ShellResult> {
  const { vfs, projectId, args } = env;

  // Support: cp <src> <dst> | cp -r <srcDir> <dstDir>
  const recursive = args.includes('-r');
  const filtered = args.filter(a => a !== '-r');
  let [src, dst] = filtered;
  src = normalizePath(src) as string;
  dst = normalizePath(dst) as string;
  if (!src || !dst) return { stdout: '', stderr: 'cp: missing operands', exitCode: 2 };
  // Attempt file copy
  try {
    const file = await vfs.readFile(projectId, src);
    try {
      await vfs.createFile(projectId, dst, file.content as any);
    } catch {
      await vfs.updateFile(projectId, dst, file.content as any);
    }
    return { stdout: '', stderr: '', exitCode: 0 };
  } catch {
    if (!recursive) {
      return { stdout: '', stderr: 'cp: -r required for directories', exitCode: 1 };
    }
    // Directory copy: copy all files under src prefix
    const entries = await vfs.getAllFilesAndDirectories(projectId, { includeTransient: true });
    const srcPrefix = src.endsWith('/') ? src : src + '/';
    for (const e2 of entries) {
      if ('type' in e2 && e2.type === 'directory') continue;
      const file = e2 as any;
      if (file.path === src || file.path.startsWith(srcPrefix)) {
        const rel = file.path.slice(src.length);
        const target = (dst.endsWith('/') ? dst.slice(0, -1) : dst) + rel;
        await ensureDirectory(vfs, projectId, target.split('/').slice(0, -1).join('/'));
        try {
          await vfs.createFile(projectId, target, file.content as any);
        } catch {
          await vfs.updateFile(projectId, target, file.content as any);
        }
      }
    }
    return { stdout: '', stderr: '', exitCode: 0 };
  }
}
