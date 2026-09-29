import type { ShellEnv } from '../types';

/**
 * The parts `grep` and `rg` had a copy of each.
 *
 * Both walk the same tree with the same filter, and both expand a context window around their
 * matches: `rg` twice (stdin and files) and `grep` four times (stdin and files, each with and
 * without `-c`/`-l`). The copies were identical, so a fix to one silently left the others behind.
 *
 * Their flag parsers are deliberately not shared. The two accept different flags, `grep` collects
 * unsupported ones to refuse them by name, and folding those together would trade a small
 * duplication for a behavioural difference held in a parameter.
 */

/** A file in the project with string content, which is all either command can search. */
export interface SearchableFile {
  path: string;
  content: string;
}

/**
 * The files under `path`, which may name a directory or a single file.
 *
 * Directories are skipped, and so is anything whose content is not a string: a binary file is
 * stored as an ArrayBuffer or a blob reference, and matching a regex against either finds nothing
 * useful and can print bytes into the transcript.
 */
export async function searchableFiles(env: ShellEnv, path: string): Promise<SearchableFile[]> {
  const entries = await env.vfs.getAllFilesAndDirectories(env.projectId, { includeTransient: true });
  const dirPrefix = path === '/' ? '/' : (path.endsWith('/') ? path : path + '/');

  const files: SearchableFile[] = [];
  for (const entry of entries) {
    if (entry.type === 'directory') continue;
    if (!entry.path.startsWith(dirPrefix) && entry.path !== path) continue;
    if (typeof entry.content !== 'string') continue;
    files.push({ path: entry.path, content: entry.content });
  }
  return files;
}

/**
 * The line numbers to print for a set of matches, in order and without repeats.
 *
 * Overlapping windows merge rather than printing a line twice, which is why this collects into a
 * set before sorting. With no context either side it returns the matched lines themselves.
 */
export function contextWindow(
  matched: Iterable<number>,
  totalLines: number,
  before: number,
  after: number,
): number[] {
  const window = new Set<number>();
  for (const line of matched) {
    for (let j = Math.max(0, line - before); j <= Math.min(totalLines - 1, line + after); j++) {
      window.add(j);
    }
  }
  return Array.from(window).sort((a, b) => a - b);
}

export function matchingLines(lines: string[], regex: RegExp): number[] {
  const matched: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (regex.test(lines[i])) matched.push(i);
  }
  return matched;
}
