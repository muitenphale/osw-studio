/**
 * Reading a SQLite timestamp column in JavaScript.
 *
 * `datetime('now')` emits `YYYY-MM-DD HH:MM:SS`: a space instead of the `T`, and no zone marker. It
 * is UTC, but `new Date` reads an unmarked string as local time, so every value parsed naively is
 * displaced by the host's offset. West of UTC that pushes a deadline hours into the future; east of
 * it the deadline has already passed. A UTC host, which is what CI and most servers run, shows
 * neither, so the bug survives testing.
 *
 * Values already carrying a zone (anything this codebase writes with
 * `strftime('%Y-%m-%dT%H:%M:%SZ','now')`, or a JS `toISOString()`) are passed through untouched.
 */
export function parseSqliteTimestamp(value: string): number {
  const bare = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(value);
  return new Date(bare ? `${value.replace(' ', 'T')}Z` : value).getTime();
}

/**
 * Formatting a value for comparison against a SQLite timestamp column.
 *
 * The mirror of the problem above. Columns defaulted to `datetime('now')` hold `YYYY-MM-DD HH:MM:SS`,
 * and comparing one against a JS `toISOString()` value compares text: `' '` (0x20) sorts below `'T'`
 * (0x54), so a stored row always ranks lower than an ISO string bearing the same date. The date
 * prefix hides it until the boundary day, which is the day every range query is anchored to.
 *
 * Formatting the parameter rather than wrapping the column in `datetime()` keeps the comparison on
 * an index seek.
 */
export function toSqliteTimestamp(value: Date | string): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) return value;
  const date = typeof value === 'string' ? new Date(value) : value;
  return date.toISOString().slice(0, 19).replace('T', ' ');
}
