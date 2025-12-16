/**
 * Analytics Tracking API
 * POST /api/analytics/track - Record a pageview
 *
 * Security Features:
 * - Origin/Referer validation (primary defense - browser-enforced)
 * - Rate limiting per IP (100 requests/minute)
 * - Bot detection (blocks automated tools)
 * - Anomaly detection (SQL injection, suspicious patterns)
 *
 * Note: Same-origin hosting provides stronger security than Google Analytics.
 * Tokens not required due to browser CORS protections.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSQLiteAdapter } from '@/lib/vfs/adapters/server';
import {
  pageviewRateLimiter,
  RATE_LIMIT_CONFIG,
  getIdentifier,
} from '@/lib/analytics/rate-limiter';
import {
  validateOrigin,
  getAllowedOrigins,
  isLikelyBot,
  isSuspiciousRequest,
} from '@/lib/analytics/security';

interface PageviewData {
  siteId: string;
  pagePath: string;
  referrer: string;
  userAgent: string;
  deviceType?: string;
  // token field removed - origin validation provides sufficient security
}

export async function POST(request: NextRequest) {
  try {
    const body: PageviewData = await request.json();
    const { siteId, pagePath, referrer, userAgent, deviceType } = body;

    // 1. Rate Limiting Check
    const identifier = getIdentifier(request);
    const rateLimitAllowed = pageviewRateLimiter.check(
      identifier,
      RATE_LIMIT_CONFIG.pageview
    );

    if (!rateLimitAllowed) {
      const resetTime = pageviewRateLimiter.getResetTime(
        identifier,
        RATE_LIMIT_CONFIG.pageview
      );

      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        {
          status: 429,
          headers: {
            'Retry-After': resetTime.toString(),
            'X-RateLimit-Limit': RATE_LIMIT_CONFIG.pageview.limit.toString(),
            'X-RateLimit-Remaining': '0',
          },
        }
      );
    }

    // 2. Validate required fields
    if (!siteId || !pagePath) {
      return NextResponse.json(
        { error: 'Missing required fields: siteId, pagePath' },
        { status: 400 }
      );
    }

    // 3. Anomaly Detection - Check for suspicious data
    if (isSuspiciousRequest({ pagePath, referrer, userAgent })) {
      console.warn('[Analytics] Suspicious request detected:', {
        siteId,
        pagePath,
        ip: identifier,
      });
      return NextResponse.json(
        { error: 'Invalid request' },
        { status: 400 }
      );
    }

    // 4. Bot Detection
    if (isLikelyBot(userAgent)) {
      // Silently ignore bot requests (don't return error to avoid detection)
      return NextResponse.json({ success: true });
    }

    const adapter = getSQLiteAdapter();
    await adapter.init();

    // 5. Verify site exists (from core database)
    const site = await adapter.getSite(siteId);
    if (!site) {
      return NextResponse.json(
        { error: 'Site not found' },
        { status: 404 }
      );
    }

    // 6. Check if analytics is enabled for this site
    if (!site.analytics.enabled || site.analytics.provider !== 'builtin') {
      return NextResponse.json(
        { error: 'Built-in analytics not enabled for this site' },
        { status: 403 }
      );
    }

    // 6b. Check if site database is enabled (created when site is published)
    const siteDb = adapter.getSiteDatabaseForAnalytics(siteId);
    if (!siteDb) {
      return NextResponse.json(
        { error: 'Site database not enabled' },
        { status: 404 }
      );
    }

    // 7. CORS/Origin Validation (Primary Security Layer)
    // This is our main defense against abuse. Unlike Google Analytics (which must accept
    // requests from any domain), we only accept requests from our own domain paths.
    // Browser security prevents attackers from spoofing Origin/Referer across domains.
    const allowedOrigins = getAllowedOrigins(siteId, site.customDomain);
    if (!validateOrigin(request, allowedOrigins)) {
      console.warn('[Analytics] Invalid origin (rejected):', {
        origin: request.headers.get('origin'),
        referer: request.headers.get('referer'),
        allowedOrigins,
        siteId,
        ip: identifier,
      });
      return NextResponse.json(
        { error: 'Origin not allowed' },
        { status: 403 }
      );
    }

    // Note: Token-based authentication removed in favor of origin validation.
    // Origin validation is stronger for same-origin hosting and avoids token expiration issues.
    // Additional protection provided by: rate limiting, bot detection, and anomaly detection.

    // Generate session ID from user agent + anonymized IP
    const sessionId = generateSessionId(userAgent, request);

    // Extract country from IP (anonymized - no storing IP addresses)
    const country = await getCountryFromIP(request);

    // Normalize path for consistent tracking
    const normalizedPath = normalizePath(pagePath);

    // Record pageview using SiteDatabase
    siteDb.recordPageview({
      pagePath: normalizedPath,
      referrer: referrer || undefined,
      country: country || undefined,
      userAgent,
      deviceType: deviceType || undefined,
      sessionId,
    });

    // Upsert session record
    siteDb.upsertSession(sessionId, normalizedPath);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Analytics API] Error tracking pageview:', error);
    return NextResponse.json(
      { error: 'Failed to track pageview' },
      { status: 500 }
    );
  }
}

/**
 * Generate anonymous session ID from user agent and IP
 * No cookies, no personal data - just a hash for unique visitor counting
 */
function generateSessionId(userAgent: string, request: NextRequest): string {
  // Get anonymized IP (only first 2 octets for IPv4, first 4 groups for IPv6)
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0] : '';
  const anonymizedIP = anonymizeIP(ip);

  const fingerprint = `${userAgent}|${anonymizedIP}|${new Date().toDateString()}`;

  // Simple hash
  let hash = 0;
  for (let i = 0; i < fingerprint.length; i++) {
    const char = fingerprint.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }

  return Math.abs(hash).toString(36);
}

/**
 * Anonymize IP address
 */
function anonymizeIP(ip: string): string {
  if (!ip) return '';

  if (ip.includes(':')) {
    // IPv6 - keep first 4 groups
    const parts = ip.split(':');
    return parts.slice(0, 4).join(':') + '::';
  } else {
    // IPv4 - keep first 2 octets
    const parts = ip.split('.');
    return parts.slice(0, 2).join('.') + '.0.0';
  }
}

/**
 * Get country from IP address
 * For now, just return null - can integrate with a geo-IP service later
 */
async function getCountryFromIP(request: NextRequest): Promise<string | null> {
  // Future: integrate with geo-IP library (geoip-lite, maxmind, etc.)
  // For MVP, we'll skip country detection
  return null;
}

/**
 * Normalize page path for consistent tracking
 * - Strips trailing slashes
 * - Converts directory paths to index.html
 * Example: /sites/abc/ -> /sites/abc/index.html
 */
function normalizePath(path: string): string {
  if (!path || path === '/') return '/index.html';

  // Remove trailing slash
  let normalized = path.replace(/\/$/, '');

  // If path doesn't have an extension, it's likely a directory - add /index.html
  if (!normalized.includes('.') || normalized.split('/').pop()?.indexOf('.') === -1) {
    normalized += '/index.html';
  }

  return normalized;
}
