import { NextRequest } from 'next/server';

/**
 * Resolve the public-facing origin for OAuth redirects.
 * On HF Spaces the `host` header is an internal container hostname
 * (e.g. r-otst-osw-studio-auziuc50-09ab3-94tqv:7860) that browsers can't resolve.
 * We prefer SPACE_HOST (injected by HF), then x-forwarded-host, then host.
 */
export function getPublicOrigin(request: NextRequest): string {
  // HF Spaces always injects SPACE_HOST with the public hostname
  if (process.env.SPACE_HOST) {
    return `https://${process.env.SPACE_HOST}`;
  }

  // Behind a reverse proxy that sets x-forwarded-host
  const forwardedHost = request.headers.get('x-forwarded-host');
  if (forwardedHost) {
    const proto = request.headers.get('x-forwarded-proto') || 'https';
    return `${proto}://${forwardedHost}`;
  }

  // x-forwarded-proto without x-forwarded-host (use host header)
  const forwardedProto = request.headers.get('x-forwarded-proto');
  if (forwardedProto) {
    return `${forwardedProto}://${request.headers.get('host')}`;
  }

  // Direct access (local dev)
  return request.nextUrl.origin;
}
