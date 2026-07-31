import 'server-only';

/**
 * Read a bounded integer from a query string.
 *
 * parseInt returns NaN for anything non-numeric, and NaN survives Math.min/Math.max unchanged — so
 * `?limit=abc` reached the database as a bind parameter and failed the whole request. Anything
 * unparseable falls back to the default instead.
 */
export function readIntParam(
  params: URLSearchParams,
  name: string,
  options: { fallback: number; min: number; max: number }
): number {
  const raw = params.get(name);
  if (raw === null) return options.fallback;

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return options.fallback;

  return Math.min(Math.max(parsed, options.min), options.max);
}
