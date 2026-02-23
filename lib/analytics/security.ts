/**
 * Analytics Security Utilities
 *
 * Token generation and validation for secure analytics tracking.
 * Prevents unauthorized data injection and replay attacks.
 */

import crypto from 'crypto';

const TOKEN_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days (for static sites)

/**
 * Generate a signed analytics tracking token
 * Token format (base64-encoded): deploymentId:timestamp:nonce:signature
 *
 * @param deploymentId - Deployment identifier
 * @returns Base64-encoded signed token
 */
export function generateAnalyticsToken(deploymentId: string): string {
  const secret = getAnalyticsSecret();
  const timestamp = Date.now().toString();
  const nonce = crypto.randomBytes(8).toString('hex');
  const payload = `${deploymentId}:${timestamp}:${nonce}`;

  const signature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  const token = `${payload}:${signature}`;
  return Buffer.from(token).toString('base64');
}

/**
 * Verify an analytics tracking token
 *
 * @param token - Base64-encoded token from client
 * @param expectedDeploymentId - Expected deployment ID
 * @returns true if valid, false otherwise
 */
export function verifyAnalyticsToken(
  token: string,
  expectedDeploymentId: string
): boolean {
  try {
    const secret = getAnalyticsSecret();

    // Decode token
    const decoded = Buffer.from(token, 'base64').toString('utf-8');
    const parts = decoded.split(':');

    if (parts.length !== 4) {
      return false; // Invalid format
    }

    const [deploymentId, timestamp, nonce, signature] = parts;

    // Verify deployment ID matches
    if (deploymentId !== expectedDeploymentId) {
      return false;
    }

    // Verify timestamp is recent (prevent replay attacks)
    const tokenAge = Date.now() - parseInt(timestamp, 10);
    if (tokenAge > TOKEN_EXPIRY_MS || tokenAge < 0) {
      return false; // Token expired or from future
    }

    // Verify signature
    const payload = `${deploymentId}:${timestamp}:${nonce}`;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    // Constant-time comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch (error) {
    // Invalid token format or other error
    return false;
  }
}

/**
 * Get analytics secret from environment
 * Generates a random secret if not configured (dev only)
 */
function getAnalyticsSecret(): string {
  const secret = process.env.ANALYTICS_SECRET;

  if (!secret) {
    // In development, use a stable secret to persist across restarts
    if (process.env.NODE_ENV === 'development') {
      console.warn(
        '[Analytics Security] ANALYTICS_SECRET not set, using development secret (not for production)'
      );
      return 'dev-analytics-secret-do-not-use-in-production-change-this-value';
    }

    throw new Error(
      'ANALYTICS_SECRET environment variable must be set in production'
    );
  }

  return secret;
}

/**
 * Validate request origin against allowed domains
 *
 * @param request - Incoming request
 * @param allowedOrigins - Array of allowed origin URLs
 * @returns true if origin is allowed, false otherwise
 */
export function validateOrigin(
  request: Request,
  allowedOrigins: string[]
): boolean {
  const origin = request.headers.get('origin') || '';
  const referer = request.headers.get('referer') || '';

  // Check if origin or referer starts with any allowed origin
  return allowedOrigins.some((allowed) => {
    return origin.startsWith(allowed) || referer.startsWith(allowed);
  });
}

/**
 * Get allowed origins for a deployment
 *
 * @param deploymentId - Deployment identifier
 * @param customDomain - Optional custom domain
 * @returns Array of allowed origin URLs
 */
export function getAllowedOrigins(
  deploymentId: string,
  customDomain?: string | null
): string[] {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  const origins: string[] = [
    `${appUrl}/deployments/${deploymentId}`, // Published deployment path
    appUrl // Base app URL (for development/testing)
  ];

  // Add localhost variations for development
  if (appUrl.includes('localhost')) {
    origins.push('http://localhost:3000');
    origins.push('http://127.0.0.1:3000');
  }

  // Add custom domain if configured
  if (customDomain) {
    origins.push(`https://${customDomain}`);
    origins.push(`http://${customDomain}`); // Allow http for testing
  }

  return origins;
}

/**
 * Generate token hash for storage (to verify tokens without storing plaintext)
 *
 * @param token - Token to hash
 * @returns SHA-256 hash of token
 */
export function hashToken(token: string): string {
  return crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');
}

/**
 * Check if user agent appears to be a bot
 *
 * @param userAgent - User agent string
 * @returns true if likely a bot, false otherwise
 */
export function isLikelyBot(userAgent: string): boolean {
  if (!userAgent) return true; // No user agent = suspicious

  const lowerUA = userAgent.toLowerCase();

  // Common bot indicators
  const botPatterns = [
    'bot',
    'crawl',
    'spider',
    'scrape',
    'curl',
    'wget',
    'python',
    'java',
    'http',
    'go-http-client',
    'axios',
    'fetch',
    'node-fetch',
    'requests', // Python
    'urllib',
    'headless',
    'phantom',
    'selenium',
    'puppeteer',
    'playwright'
  ];

  return botPatterns.some((pattern) => lowerUA.includes(pattern));
}

/**
 * Detect suspicious request patterns
 *
 * @param data - Analytics data to validate
 * @returns true if suspicious, false otherwise
 */
export function isSuspiciousRequest(data: {
  pagePath?: string;
  referrer?: string;
  userAgent?: string;
}): boolean {
  // Check for obviously fake/malicious data
  if (data.pagePath && data.pagePath.length > 500) {
    return true; // Unreasonably long path
  }

  if (data.referrer && data.referrer.length > 500) {
    return true; // Unreasonably long referrer
  }

  if (data.userAgent && data.userAgent.length > 500) {
    return true; // Unreasonably long user agent
  }

  // Check for SQL injection attempts
  const sqlPatterns = /(union|select|insert|update|delete|drop|create|alter)/i;
  if (
    (data.pagePath && sqlPatterns.test(data.pagePath)) ||
    (data.referrer && sqlPatterns.test(data.referrer))
  ) {
    return true;
  }

  return false;
}
