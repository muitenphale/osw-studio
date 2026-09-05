/**
 * The editor's view of a single page pattern.
 *
 * Only the compiled glob is stored on a suggestion. The kind is worked out again from that glob
 * when the editor opens, so a hand-written pattern keeps working and a picked page comes back as a
 * picked page. Storing the kind would mean a second field to migrate for no gain, since the glob
 * already says everything the runtime needs.
 */
export type PathRuleKind = 'page' | 'directory' | 'pattern';

export interface PathRule {
  kind: PathRuleKind;
  /** A page path for `page`, a directory path with a trailing slash for `directory`, a glob otherwise. */
  value: string;
}

/**
 * Directories offered by the Directory picker: every one holding a page, plus its ancestors.
 *
 * A project with only /blog/2026/post.html still offers /blog/, since that is the level someone
 * usually means.
 */
export function pageDirectories(pagePaths: string[]): string[] {
  const dirs = new Set<string>();

  for (const path of pagePaths) {
    const lastSlash = path.lastIndexOf('/');
    if (lastSlash <= 0) continue;

    let walked = '';
    for (const segment of path.slice(1, lastSlash).split('/')) {
      walked += `/${segment}`;
      dirs.add(`${walked}/`);
    }
  }

  return [...dirs].sort();
}

/** The glob a rule stores. */
export function ruleToPattern(rule: PathRule): string {
  const value = rule.value.trim();
  if (value === '') return '';
  if (rule.kind !== 'directory') return value;
  // `/articles/` and `/articles` name the same directory, so both compile to one pattern.
  return `${value.replace(/\/+$/, '')}/**`;
}

/**
 * The kind a stored glob reads as.
 *
 * Falls through to `pattern` whenever the glob is not exactly what one of the pickers would have
 * produced, so nothing a person typed is ever shown as a picked value it does not equal.
 */
export function patternToRule(pattern: string, pagePaths: string[]): PathRule {
  const value = pattern.trim();
  if (value === '') return { kind: 'pattern', value: '' };

  if (!value.includes('*') && pagePaths.includes(value)) return { kind: 'page', value };

  const directory = /^(\/[^*]*[^/*])\/\*\*$/.exec(value);
  if (directory) return { kind: 'directory', value: `${directory[1]}/` };

  return { kind: 'pattern', value };
}
