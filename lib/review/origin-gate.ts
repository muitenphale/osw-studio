/**
 * Where a review write may be posted from: the app origin, and nothing else.
 *
 * The analytics allowlist (`getAllowedOrigins`) must not be reused here. It names every slug
 * subdomain and custom domain; those serve tenant-authored HTML and are same-site with the app, so
 * SameSite=Lax does not withhold the review cookie from a request one of them makes. On a write
 * endpoint that would let one tenant forge comments for any visitor holding a review cookie.
 *
 * Nothing legitimate is refused by the narrower list: the generated Caddyfile rewrites `/review/...`
 * on a subdomain or custom domain into the published build, so those hosts never reach this route.
 */

import { validateOrigin } from '@/lib/analytics/security';

const DEFAULT_APP_URL = 'http://localhost:3000';

/** Normalised through URL, so a trailing slash in `NEXT_PUBLIC_APP_URL` still matches a header. */
export function reviewAllowedOrigins(): string[] {
  const configured = process.env.NEXT_PUBLIC_APP_URL || DEFAULT_APP_URL;

  try {
    return [new URL(configured).origin];
  } catch {
    // An unparseable entry matches nothing, which refuses everything rather than widening the gate.
    return [configured];
  }
}

export function isReviewOriginAllowed(request: Request): boolean {
  return validateOrigin(request, reviewAllowedOrigins());
}
