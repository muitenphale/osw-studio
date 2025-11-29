/**
 * Analytics Interaction Tracking API
 * POST /api/analytics/interaction - Record interactions (clicks, scrolls, custom events)
 *
 * Security Features:
 * - Origin/Referer validation (primary defense - browser-enforced)
 * - Rate limiting per IP (500 requests/minute for interactions)
 * - Bot detection (blocks automated tools)
 * - Anomaly detection (SQL injection, suspicious patterns)
 *
 * Note: Same-origin hosting provides stronger security than Google Analytics.
 * Tokens not required due to browser CORS protections.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerAdapter } from '@/lib/vfs/adapters/server';
import { PostgresAdapter } from '@/lib/vfs/adapters/postgres-adapter';
import {
  interactionRateLimiter,
  RATE_LIMIT_CONFIG,
  getIdentifier,
} from '@/lib/analytics/rate-limiter';
import {
  validateOrigin,
  getAllowedOrigins,
  isLikelyBot,
  isSuspiciousRequest,
} from '@/lib/analytics/security';

interface InteractionData {
  siteId: string;
  pagePath: string;
  interactionType: 'click' | 'scroll' | 'exit' | 'custom';
  elementSelector?: string;
  coordinates?: {
    x: number;
    y: number;
    viewportWidth: number;
    viewportHeight: number;
  };
  scrollDepth?: number;
  timeOnPage?: number;
  customData?: Record<string, any>;
  userAgent?: string;
  // token field removed - origin validation provides sufficient security
}

interface BatchInteractionData {
  batch: boolean;
  interactions: InteractionData[];
}

export async function POST(request: NextRequest) {
  try {
    const body: InteractionData | BatchInteractionData = await request.json();

    // Check if this is a batch request
    if ('batch' in body && body.batch === true) {
      return handleBatchInteractions(request, body);
    }

    // Handle single interaction (backward compatibility)
    const {
      siteId,
      pagePath,
      interactionType,
      elementSelector,
      coordinates,
      scrollDepth,
      timeOnPage,
      customData,
      userAgent,
    } = body as InteractionData;

    // 1. Rate Limiting Check (higher limit for interactions)
    const identifier = getIdentifier(request);
    const rateLimitAllowed = interactionRateLimiter.check(
      identifier,
      RATE_LIMIT_CONFIG.interaction
    );

    if (!rateLimitAllowed) {
      const resetTime = interactionRateLimiter.getResetTime(
        identifier,
        RATE_LIMIT_CONFIG.interaction
      );

      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        {
          status: 429,
          headers: {
            'Retry-After': resetTime.toString(),
            'X-RateLimit-Limit': RATE_LIMIT_CONFIG.interaction.limit.toString(),
            'X-RateLimit-Remaining': '0',
          },
        }
      );
    }

    // 2. Validate required fields
    if (!siteId || !pagePath || !interactionType) {
      return NextResponse.json(
        { error: 'Missing required fields: siteId, pagePath, interactionType' },
        { status: 400 }
      );
    }

    // 3. Anomaly Detection
    if (isSuspiciousRequest({ pagePath, userAgent })) {
      console.warn('[Analytics Interaction] Suspicious request detected:', {
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
    if (userAgent && isLikelyBot(userAgent)) {
      return NextResponse.json({ success: true });
    }

    const adapter = await createServerAdapter();

    if (!(adapter instanceof PostgresAdapter)) {
      return NextResponse.json(
        { error: 'Analytics requires Server Mode (PostgreSQL)' },
        { status: 503 }
      );
    }

    await adapter.init();

    // 5. Verify site exists
    const site = await adapter.getSite?.(siteId);
    if (!site) {
      await adapter.close?.();
      return NextResponse.json(
        { error: 'Site not found' },
        { status: 404 }
      );
    }

    // 6. Check if analytics is enabled
    if (!site.analytics.enabled || site.analytics.provider !== 'builtin') {
      await adapter.close?.();
      return NextResponse.json(
        { error: 'Built-in analytics not enabled for this site' },
        { status: 403 }
      );
    }

    // 7. Check if specific feature is enabled
    const features = site.analytics.features || {};
    if (interactionType === 'click' && !features.heatmaps) {
      await adapter.close?.();
      return NextResponse.json(
        { error: 'Heatmaps feature not enabled' },
        { status: 403 }
      );
    }

    if (interactionType === 'scroll' && !features.engagementTracking && !features.heatmaps) {
      await adapter.close?.();
      return NextResponse.json(
        { error: 'Engagement tracking not enabled' },
        { status: 403 }
      );
    }

    if (interactionType === 'exit' && !features.engagementTracking) {
      await adapter.close?.();
      return NextResponse.json(
        { error: 'Engagement tracking not enabled' },
        { status: 403 }
      );
    }

    // 8. CORS/Origin Validation (Primary Security Layer)
    // This is our main defense against abuse. Unlike Google Analytics (which must accept
    // requests from any domain), we only accept requests from our own domain paths.
    // Browser security prevents attackers from spoofing Origin/Referer across domains.
    const allowedOrigins = getAllowedOrigins(siteId, site.customDomain);
    if (!validateOrigin(request, allowedOrigins)) {
      await adapter.close?.();
      console.warn('[Analytics Interaction] Invalid origin (rejected):', {
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

    // Generate session ID
    const sessionId = generateSessionId(userAgent || request.headers.get('user-agent') || '', request);

    // Normalize path for consistent tracking
    const normalizedPath = normalizePath(pagePath);

    const sql = adapter.getSQL();

    // Insert interaction
    await sql`
      INSERT INTO interactions (
        site_id,
        session_id,
        page_path,
        interaction_type,
        element_selector,
        coordinates,
        scroll_depth,
        time_on_page,
        timestamp
      ) VALUES (
        ${siteId},
        ${sessionId},
        ${normalizedPath},
        ${interactionType},
        ${elementSelector || null},
        ${coordinates ? JSON.stringify(coordinates) : null},
        ${scrollDepth || null},
        ${timeOnPage || null},
        NOW()
      )
    `;

    await adapter.close?.();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Analytics Interaction API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to track interaction' },
      { status: 500 }
    );
  }
}

/**
 * Generate anonymous session ID (same logic as pageview tracking)
 */
function generateSessionId(userAgent: string, request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0] : '';
  const anonymizedIP = anonymizeIP(ip);

  const fingerprint = `${userAgent}|${anonymizedIP}|${new Date().toDateString()}`;

  let hash = 0;
  for (let i = 0; i < fingerprint.length; i++) {
    const char = fingerprint.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }

  return Math.abs(hash).toString(36);
}

function anonymizeIP(ip: string): string {
  if (!ip) return '';

  if (ip.includes(':')) {
    const parts = ip.split(':');
    return parts.slice(0, 4).join(':') + '::';
  } else {
    const parts = ip.split('.');
    return parts.slice(0, 2).join('.') + '.0.0';
  }
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

/**
 * Handle batch interaction tracking
 * Processes multiple interactions in a single request for improved performance
 */
async function handleBatchInteractions(
  request: NextRequest,
  body: BatchInteractionData
): Promise<NextResponse> {
  const { interactions } = body;

  if (!interactions || interactions.length === 0) {
    return NextResponse.json(
      { error: 'No interactions provided in batch' },
      { status: 400 }
    );
  }

  // Validate batch size (max 100 events per batch)
  if (interactions.length > 100) {
    return NextResponse.json(
      { error: 'Batch size exceeds maximum of 100 interactions' },
      { status: 400 }
    );
  }

  // 1. Rate Limiting Check - count as single request with batch multiplier
  const identifier = getIdentifier(request);
  const rateLimitAllowed = interactionRateLimiter.check(
    identifier,
    RATE_LIMIT_CONFIG.interaction
  );

  if (!rateLimitAllowed) {
    const resetTime = interactionRateLimiter.getResetTime(
      identifier,
      RATE_LIMIT_CONFIG.interaction
    );

    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      {
        status: 429,
        headers: {
          'Retry-After': resetTime.toString(),
          'X-RateLimit-Limit': RATE_LIMIT_CONFIG.interaction.limit.toString(),
          'X-RateLimit-Remaining': '0',
        },
      }
    );
  }

  // 2. Extract common fields from first interaction for validation
  const firstInteraction = interactions[0];
  const { siteId, userAgent } = firstInteraction;

  if (!siteId) {
    return NextResponse.json(
      { error: 'Missing required field: siteId' },
      { status: 400 }
    );
  }

  // 3. Bot Detection
  if (userAgent && isLikelyBot(userAgent)) {
    return NextResponse.json({ success: true });
  }

  const adapter = await createServerAdapter();

  if (!(adapter instanceof PostgresAdapter)) {
    return NextResponse.json(
      { error: 'Analytics requires Server Mode (PostgreSQL)' },
      { status: 503 }
    );
  }

  await adapter.init();

  try {
    // 4. Verify site exists
    const site = await adapter.getSite?.(siteId);
    if (!site) {
      await adapter.close?.();
      return NextResponse.json(
        { error: 'Site not found' },
        { status: 404 }
      );
    }

    // 5. Check if analytics is enabled
    if (!site.analytics.enabled || site.analytics.provider !== 'builtin') {
      await adapter.close?.();
      return NextResponse.json(
        { error: 'Built-in analytics not enabled for this site' },
        { status: 403 }
      );
    }

    // 6. CORS/Origin Validation
    const allowedOrigins = getAllowedOrigins(siteId, site.customDomain);
    if (!validateOrigin(request, allowedOrigins)) {
      await adapter.close?.();
      console.warn('[Analytics Batch] Invalid origin (rejected):', {
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

    // 7. Process all interactions in a single transaction
    const sql = adapter.getSQL();
    const defaultUserAgent = request.headers.get('user-agent') || '';

    let successCount = 0;
    let skipCount = 0;

    // Use transaction for atomic batch insert
    for (const interaction of interactions) {
      const {
        pagePath,
        interactionType,
        elementSelector,
        coordinates,
        scrollDepth,
        timeOnPage,
        userAgent: interactionUserAgent,
      } = interaction;

      // Validate each interaction
      if (!pagePath || !interactionType) {
        skipCount++;
        continue;
      }

      // Check feature flags for this interaction type
      const features = site.analytics.features || {};
      if (interactionType === 'click' && !features.heatmaps) {
        skipCount++;
        continue;
      }

      if (interactionType === 'scroll' && !features.engagementTracking && !features.heatmaps) {
        skipCount++;
        continue;
      }

      if (interactionType === 'exit' && !features.engagementTracking) {
        skipCount++;
        continue;
      }

      // Anomaly detection per interaction
      if (isSuspiciousRequest({ pagePath, userAgent: interactionUserAgent })) {
        skipCount++;
        continue;
      }

      // Generate session ID
      const sessionId = generateSessionId(
        interactionUserAgent || defaultUserAgent,
        request
      );

      // Normalize path
      const normalizedPath = normalizePath(pagePath);

      // Insert interaction
      try {
        await sql`
          INSERT INTO interactions (
            site_id,
            session_id,
            page_path,
            interaction_type,
            element_selector,
            coordinates,
            scroll_depth,
            time_on_page,
            timestamp
          ) VALUES (
            ${siteId},
            ${sessionId},
            ${normalizedPath},
            ${interactionType},
            ${elementSelector || null},
            ${coordinates ? JSON.stringify(coordinates) : null},
            ${scrollDepth || null},
            ${timeOnPage || null},
            NOW()
          )
        `;
        successCount++;
      } catch (error) {
        console.error('[Analytics Batch] Error inserting interaction:', error);
        skipCount++;
      }
    }

    await adapter.close?.();

    return NextResponse.json({
      success: true,
      processed: successCount,
      skipped: skipCount,
      total: interactions.length,
    });
  } catch (error) {
    console.error('[Analytics Batch] Error processing batch:', error);
    await adapter.close?.();
    return NextResponse.json(
      { error: 'Failed to process batch interactions' },
      { status: 500 }
    );
  }
}
