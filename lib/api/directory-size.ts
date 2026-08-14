/**
 * Bytes a set of directories actually occupies.
 *
 * Counting by path overstates it: a published deployment hardlinks the blobs a project already
 * holds, so the same bytes appear under two paths while occupying disk once. Every caller measuring
 * a workspace has to agree on that, or the quota a user is shown and the one that stops their next
 * write describe different things.
 *
 * `seen` carries inode identity across calls so a caller can measure several directories as one
 * total. Hardlinks are only counted once within a single measurement.
 */
import fs from 'fs';
import path from 'path';

export function directorySize(dir: string, seen: Set<string> = new Set()): number {
  let total = 0;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += directorySize(entryPath, seen);
      continue;
    }
    try {
      const stat = fs.statSync(entryPath);
      if (stat.nlink > 1) {
        // dev is part of the key because inode numbers are only unique within a filesystem.
        const identity = `${stat.dev}:${stat.ino}`;
        if (seen.has(identity)) continue;
        seen.add(identity);
      }
      total += stat.size;
    } catch {
      // Vanished between the listing and the stat.
    }
  }

  return total;
}

/** Total bytes across several directories, counting shared content once. */
export function combinedDirectorySize(dirs: string[]): number {
  const seen = new Set<string>();
  return dirs.reduce((total, dir) => total + directorySize(dir, seen), 0);
}
