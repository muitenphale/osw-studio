/**
 * Sanitising for the extra headers a custom OpenAI-compatible endpoint can be given.
 *
 * A gateway often needs a tenant, routing or compatibility header alongside the API token. Those
 * values are user-supplied and end up on a fetch the server makes, so they are filtered rather than
 * passed through: `Headers.set` throws on an invalid name or a value carrying CR or LF, which would
 * surface as an opaque failure part way through a request instead of a clear one at the edge.
 *
 * Applied on both sides. The editor uses it to report what it will not keep, and each route applies
 * it again to whatever arrives in the request body, since a client is not a trust boundary.
 */

/**
 * Names a caller may not set.
 *
 * `authorization` is here on purpose. The API token field owns that header, and accepting a second
 * source for it would mean silently ignoring one of the two whenever both are filled in. That is
 * the precedence rule: the token wins because it is the only way to set it.
 *
 * The rest are either hop-by-hop (RFC 9110 7.6.1), owned by the transport, or would break the
 * request body. Node does not refuse any of them on its own; verified against undici on Node 23.
 */
const FORBIDDEN_HEADER_NAMES = new Set([
  'authorization',
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailer', 'transfer-encoding', 'upgrade',
  'host', 'content-length', 'content-type',
  'cookie', 'cookie2', 'set-cookie', 'set-cookie2',
]);

/** RFC 9110 field-name: one or more token characters. */
const FIELD_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

/** CR, LF and NUL terminate or split a header, so a value carrying one is dropped whole. */
const FORBIDDEN_VALUE_CHARS = /[\r\n\0]/;

export interface SanitizedHeaders {
  headers: Record<string, string>;
  /** Names that were dropped, as written, so the editor can say which and why. */
  rejected: string[];
}

export function sanitizeCustomHeaders(input: Record<string, string> | undefined): SanitizedHeaders {
  const headers: Record<string, string> = {};
  const rejected: string[] = [];
  // Reached from a request body, so the shape is whatever a caller sent. `Object.entries` on a
  // string or an array yields index keys, and a digit is a valid field-name character, so an
  // unguarded call would turn "ab" into the headers 0: a and 1: b.
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { headers, rejected };

  // Header names are case-insensitive, so X-Tenant and x-tenant are one header and the later would
  // overwrite the earlier inside fetch. Kept in order and refused after the first, rather than
  // leaving which one survives to the iteration order.
  const claimed = new Set<string>();

  for (const [rawName, rawValue] of Object.entries(input)) {
    const name = rawName.trim();
    const value = typeof rawValue === 'string' ? rawValue.trim() : '';

    // A half-typed row is not a rejection; it is just not ready.
    if (name === '' && value === '') continue;

    const lower = name.toLowerCase();
    if (
      name === '' ||
      !FIELD_NAME.test(name) ||
      FORBIDDEN_HEADER_NAMES.has(lower) ||
      lower.startsWith('proxy-') ||
      claimed.has(lower) ||
      value === '' ||
      FORBIDDEN_VALUE_CHARS.test(value)
    ) {
      rejected.push(rawName);
      continue;
    }

    claimed.add(lower);
    headers[name] = value;
  }

  return { headers, rejected };
}

/** True when a name would be refused, for labelling a row in the editor before it is saved. */
export function isForbiddenHeaderName(name: string): boolean {
  const trimmed = name.trim().toLowerCase();
  if (trimmed === '') return false;
  return FORBIDDEN_HEADER_NAMES.has(trimmed) || trimmed.startsWith('proxy-') || !FIELD_NAME.test(trimmed);
}
