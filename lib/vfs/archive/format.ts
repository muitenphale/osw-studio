/**
 * Saying how big something is.
 *
 * Its own module because both readers need it — the zip reader to name a budget it just refused,
 * the folder reader to do the same — and neither should have to import the other to get it.
 */
export function formatBytes(bytes: number): string {
  // A caller may tighten a budget to something small, and rounding that down to '0 KB' would name
  // a limit nothing could satisfy.
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} bytes`;
}
