/**
 * Content-addressed storage for a workspace's binary files.
 *
 * A binary file used to be base64 in the `files.content` column, which cost a third more than the
 * bytes it held and had to be copied again into every published deployment. Here the bytes live
 * once as `blobs/<sha256>` beside the workspace database, the row keeps the hash, and publishing
 * hardlinks the blob into the deployment directory instead of writing a second copy.
 *
 * **The link count is the reference count.** A deployment published at v0 holds a link to the blob
 * it served. Editing the project repoints the row at a new blob, and the old one stays alive
 * precisely because that deployment still links it, so an already-published site keeps serving what
 * it was published with. Republishing drops the link and the old blob becomes collectable. Nothing
 * tracks versions, and there is no reference table to fall out of step with the filesystem.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

/** Marks a `files` row whose `content` column holds a hash rather than the content itself. */
export const BLOB_ENCODING = 'blob';

/**
 * How recently written a blob has to be for the sweep to leave it alone regardless of anything
 * else. This is what makes the sweep safe to run while writes are in flight: see `collectBlobs`.
 */
export const COLLECT_MIN_AGE_MS = 10 * 60 * 1000;

export function blobDir(baseDir: string): string {
  return path.join(baseDir, 'blobs');
}

export function blobPath(baseDir: string, hash: string): string {
  return path.join(blobDir(baseDir), hash);
}

/**
 * Write bytes to the store and return their hash, or return the existing hash when the same
 * content is already there. Identical content across projects and deployments is one file.
 */
export function putBlob(baseDir: string, bytes: Buffer): string {
  const hash = crypto.createHash('sha256').update(bytes).digest('hex');
  const target = blobPath(baseDir, hash);

  if (!fs.existsSync(target)) {
    fs.mkdirSync(blobDir(baseDir), { recursive: true });
    // Written under a temporary name and renamed, so a reader can never observe a half-written
    // blob under a hash that claims to describe complete content.
    const temp = `${target}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    fs.writeFileSync(temp, bytes);
    fs.renameSync(temp, target);
  }

  return hash;
}

/** Read a blob's bytes, or null when the store has no such hash. */
export function readBlob(baseDir: string, hash: string): Buffer | null {
  try {
    return fs.readFileSync(blobPath(baseDir, hash));
  } catch {
    return null;
  }
}

/**
 * Hardlink a blob to `destination`, falling back to a copy when the two are on different
 * filesystems. `DATA_DIR` and `DEPLOYMENTS_STATIC_DIR` are configured separately and the desktop
 * app already sets them apart, so `EXDEV` is a real path rather than a hypothetical one; the copy
 * it falls back to is what publishing did for every file before this existed.
 */
export function linkBlob(baseDir: string, hash: string, destination: string): boolean {
  const source = blobPath(baseDir, hash);
  fs.mkdirSync(path.dirname(destination), { recursive: true });

  try {
    fs.linkSync(source, destination);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'EEXIST') return true;
    if (code !== 'EXDEV' && code !== 'EPERM' && code !== 'ENOTSUP') throw error;
    fs.copyFileSync(source, destination);
    return false;
  }
}

/**
 * Remove blobs nothing refers to any more.
 *
 * A blob goes when no row references its hash *and* nothing else on disk links it. The link count
 * is what protects a deployment that is still serving an older version of a file the project has
 * since replaced. A blob written by a publish that crashed before its row committed is an orphan
 * with a link count of 1, which the next sweep takes.
 */
export function collectBlobs(
  baseDir: string,
  referenced: ReadonlySet<string>,
  now: number = Date.now()
): number {
  let removed = 0;
  let names: string[];
  try {
    names = fs.readdirSync(blobDir(baseDir));
  } catch {
    return 0;
  }

  for (const name of names) {
    const target = blobPath(baseDir, name);
    try {
      const stat = fs.statSync(target);

      // Nothing written recently is touched, whether it is a blob or a leftover temporary file.
      // A blob is written *before* the row that points at it exists, so without this a sweep
      // running in that window would delete content the row is about to claim, and the file would
      // read as empty from then on. The sweep is workspace-wide and runs on every publish, so that
      // window is reachable from any concurrent write. Anything genuinely unreferenced is still
      // here for the next sweep.
      if (now - stat.mtimeMs < COLLECT_MIN_AGE_MS) continue;

      // A temporary file this old is the remains of a write that died between the two steps, since
      // a live one is renamed within milliseconds.
      if (name.endsWith('.tmp')) {
        fs.unlinkSync(target);
        continue;
      }

      if (referenced.has(name)) continue;
      if (stat.nlink > 1) continue;

      fs.unlinkSync(target);
      removed += 1;
    } catch {
      // Racing with a publish that is linking it, or already gone. Either way the next sweep sees
      // the settled state.
    }
  }

  return removed;
}
