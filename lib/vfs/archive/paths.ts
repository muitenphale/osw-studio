import type { ArchiveIssue } from './types';

/** The length term of updateFile's guard (lib/vfs/index.ts:1090); createFile has no such check. */
const MAX_PATH_LENGTH = 200;

/**
 * C0 controls, DEL and C1, plus the bidi marks and overrides. The overrides matter beyond
 * tidiness: U+202E makes `a<RLO>gnp.txt` render as `atxt.png` in the preview dialog, so the
 * user approves one filename and gets another. Subsumes the null byte and the newline that
 * updateFile screens for.
 */
const UNSAFE_CHARS = /[\u0000-\u001F\u007F-\u009F\u200E\u200F\u202A-\u202E\u2066-\u2069]/;

export type PathResult =
  | { ok: true; path: string }
  | { ok: false; code: ArchiveIssue['code']; message: string };

/**
 * Normalize an archive entry name to a project path, or refuse it.
 *
 * Refuse rather than sanitize: silently rewriting a path changes which file the user gets.
 *
 * `unsafeOriginalName` is JSZip's record of the name as written in the zip, and the only place a
 * traversal attempt survives — `loadAsync` resolves it away in `name`. Test it for a literal '..'
 * segment, never for inequality with `name`: the same resolution also collapses './', '//' and
 * '/./', so ordinary archives written by zip, Python's zipfile and most Java tools differ here.
 */
export function validateArchivePath(name: string, unsafeOriginalName?: string): PathResult {
  const reject = (message: string, code: ArchiveIssue['code'] = 'path-rejected'): PathResult =>
    ({ ok: false, code, message });

  if (!name || !name.trim()) return reject('Empty path.');
  // JSZip's loadAsync resolves the stored name: it strips '..' AND collapses './' and '//'.
  // So a mismatch is normal. Only a real parent segment in the raw name is a traversal signal.
  if (unsafeOriginalName && unsafeOriginalName.split(/[/\\]/).includes('..')) {
    return reject('This path points outside the project. The archive may be damaged or unsafe.');
  }
  // createFile and updateFile both normalize with `.replace(/\\n$|\\r$|\n$|\r$/, '').trim()`
  // (lib/vfs/index.ts:968, :1089), so '/a.txt ' and '/a.txt' are two paths here and one file in
  // storage — an entry that looks 'added' in the preview but overwrites on apply. Whole-string
  // only: .trim() never touches a space inside a segment, so 'a /b.txt' is an ordinary filename.
  if (name !== name.replace(/\\n$|\\r$|\n$|\r$/, '').trim()) {
    return reject('Path has leading or trailing whitespace.');
  }
  if (name.includes('\0')) return reject('Path contains a null byte.');
  if (UNSAFE_CHARS.test(name)) return reject('Path contains a control or text-direction character.');
  // The remaining three terms of updateFile's guard; a path failing any of them validates here
  // and then throws mid-apply, after the preview promised it was fine.
  if (name.includes('@@')) return reject("Path contains '@@', which file storage rejects.");
  // Named rather than described: an archive from an older Windows tool separates every path this
  // way, so the user sees this on all of their files at once and has to be told it is the tool
  // and not their project.
  if (name.includes('\\')) {
    return reject(
      'Path uses Windows-style separators. Re-create the archive with a tool that writes forward slashes.'
    );
  }
  if (/^[a-zA-Z]:/.test(name)) return reject('Path is an absolute Windows path.');

  const segments = name.split('/').filter((s) => s.length > 0);
  if (segments.length === 0) return reject('Empty path.');
  for (const segment of segments) {
    if (segment === '.' || segment === '..') {
      return reject('This path points outside the project. The archive may be damaged or unsafe.');
    }
  }

  const path = '/' + segments.join('/');
  if (path.length > MAX_PATH_LENGTH) {
    return reject(`Path is longer than ${MAX_PATH_LENGTH} characters.`, 'path-too-long');
  }
  return { ok: true, path };
}

/**
 * The key two paths are matched under. macOS writes filenames in NFD and Linux in NFC, so the same
 * name is two different strings depending on where the archive was made; without folding them
 * together an archive from a Mac reports every accented file as new, and apply then creates a
 * duplicate beside the original. Only the *key* is normalized — the paths themselves are reported,
 * and later written, exactly as they were validated.
 *
 * Shared rather than defined twice: apply resolves a plan path back to its entry under this
 * normalization, so the analyzer and apply disagreeing here would break NFD/NFC filenames alone.
 */
export function normalizeKey(path: string): string {
  return path.normalize('NFC');
}

/**
 * Desktop convention: `logo.svg` → `logo (2).svg`, skipping numbers already in use.
 *
 * `path` must be a file path that has already passed validateArchivePath — a directory path
 * ('/a/b/') has no basename and would yield a file named ' (2)'.
 *
 * **Mutates `taken`**, adding the name it returns. Two calls with the same path and the same set
 * would otherwise hand back the same candidate, and 'keep both' would lose one of the two files
 * it exists to preserve.
 */
export function keepBothPath(path: string, taken: Set<string>): string {
  const slash = path.lastIndexOf('/');
  const dir = path.slice(0, slash + 1);
  const base = path.slice(slash + 1);
  // Ignore a leading dot so `.PROMPT.md` splits at the real extension. A name that is nothing
  // but dots ('...') has no extension to preserve — splitting it yields '. (2)..'.
  const dotIndex = /^\.+$/.test(base) ? -1 : base.indexOf('.', base.startsWith('.') ? 1 : 0);
  const stem = dotIndex === -1 ? base : base.slice(0, dotIndex);
  const ext = dotIndex === -1 ? '' : base.slice(dotIndex);

  // A valid 200-character path would otherwise produce 204 — failing on the very option the user
  // picked to recover from a conflict. Trim the stem instead; the counter and extension carry the
  // meaning. The counter's own width grows, so rebuild rather than trim once.
  const build = (n: number): string => {
    const suffix = ` (${n})${ext}`;
    const room = MAX_PATH_LENGTH - dir.length - suffix.length;
    return `${dir}${room < stem.length ? stem.slice(0, Math.max(0, room)) : stem}${suffix}`;
  };

  let n = 2;
  let candidate = build(n);
  while (taken.has(candidate)) {
    n += 1;
    candidate = build(n);
  }
  taken.add(candidate);
  return candidate;
}
