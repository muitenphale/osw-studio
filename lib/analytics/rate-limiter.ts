/**
 * Rate Limiter for Analytics Endpoints
 *
 * In-memory sliding window rate limiter to prevent abuse.
 * Uses LRU-like cleanup to prevent memory leaks.
 */

interface RateLimitConfig {
  limit: number;      // Max requests per window
  windowMs: number;   // Time window in milliseconds
}

class RateLimiter {
  private requests = new Map<string, number[]>();
  private lastCleanup = Date.now();
  private readonly CLEANUP_INTERVAL = 60 * 1000; // Clean up every minute
  private readonly MAX_KEYS = 10000; // Prevent memory exhaustion

  /**
   * Check if request should be allowed
   * @param identifier - Usually IP address
   * @param config - Rate limit configuration
   * @returns true if allowed, false if rate limited
   */
  check(identifier: string, config: RateLimitConfig): boolean {
    const now = Date.now();

    // Periodic cleanup to prevent memory leaks
    if (now - this.lastCleanup > this.CLEANUP_INTERVAL) {
      this.cleanup(config.windowMs);
    }

    // Get existing requests for this identifier
    const timestamps = this.requests.get(identifier) || [];

    // Filter to only recent requests within the window
    const recentRequests = timestamps.filter(t => now - t < config.windowMs);

    // Check if limit exceeded
    if (recentRequests.length >= config.limit) {
      return false; // Rate limited
    }

    // Add current request
    recentRequests.push(now);
    this.requests.set(identifier, recentRequests);

    // Prevent memory exhaustion - if too many identifiers, remove oldest
    if (this.requests.size > this.MAX_KEYS) {
      const firstKey = this.requests.keys().next().value;
      if (firstKey !== undefined) {
        this.requests.delete(firstKey);
      }
    }

    return true; // Allowed
  }

  /**
   * Get current request count for an identifier
   */
  getCount(identifier: string, windowMs: number): number {
    const now = Date.now();
    const timestamps = this.requests.get(identifier) || [];
    return timestamps.filter(t => now - t < windowMs).length;
  }

  /**
   * Get time until rate limit resets (in seconds)
   */
  getResetTime(identifier: string, config: RateLimitConfig): number {
    const timestamps = this.requests.get(identifier) || [];
    if (timestamps.length === 0) return 0;

    const now = Date.now();
    const recentRequests = timestamps.filter(t => now - t < config.windowMs);

    if (recentRequests.length === 0) return 0;

    const oldestRequest = Math.min(...recentRequests);
    const resetTime = oldestRequest + config.windowMs - now;

    return Math.ceil(resetTime / 1000); // Convert to seconds
  }

  /**
   * Clean up old entries to prevent memory leaks
   */
  private cleanup(windowMs: number): void {
    const now = Date.now();

    for (const [identifier, timestamps] of this.requests.entries()) {
      const recent = timestamps.filter(t => now - t < windowMs);

      if (recent.length === 0) {
        // No recent requests, remove entirely
        this.requests.delete(identifier);
      } else {
        // Update with only recent requests
        this.requests.set(identifier, recent);
      }
    }

    this.lastCleanup = now;
  }

  /**
   * Clear all rate limit data (for testing)
   */
  clear(): void {
    this.requests.clear();
  }

  /**
   * Get current stats (for monitoring)
   */
  getStats(): { totalIdentifiers: number; totalRequests: number } {
    let totalRequests = 0;
    for (const timestamps of this.requests.values()) {
      totalRequests += timestamps.length;
    }

    return {
      totalIdentifiers: this.requests.size,
      totalRequests,
    };
  }
}

// Singleton instances for different endpoints
export const pageviewRateLimiter = new RateLimiter();
export const interactionRateLimiter = new RateLimiter();
export const reviewPasswordRateLimiter = new RateLimiter();
export const reviewCommentRateLimiter = new RateLimiter();

// Predefined configurations
export const RATE_LIMIT_CONFIG = {
  pageview: {
    limit: 100,           // 100 requests
    windowMs: 10 * 60 * 1000 // per 10 minutes
  },
  interaction: {
    limit: 500,           // 500 requests (higher for heatmaps)
    windowMs: 10 * 60 * 1000 // per 10 minutes
  },
  strict: {
    limit: 10,            // Very strict for suspicious activity
    windowMs: 60 * 1000   // per 1 minute
  },
  /**
   * Review-copy password submissions. Far tighter than `strict`, because this is a credential
   * check rather than a traffic valve: `strict` still permits 14,400 guesses a day, and the
   * password is the only thing between a URL-holder and a client's unpublished site. Five attempts
   * per five minutes leaves room for a mistyped password while making online guessing pointless,
   * and caps the bcrypt work an unauthenticated caller can force — a cost-12 verify is a quarter
   * second of server CPU, so the limit is a denial-of-service bound as much as a guessing one.
   */
  reviewPassword: {
    limit: 5,
    windowMs: 5 * 60 * 1000
  },
  /**
   * Review comment and profile writes. Unlike the analytics limits above, what is being paced here
   * is a person typing, not a browser emitting telemetry, so the ceiling can be far lower: 60 in
   * ten minutes is one every ten seconds sustained, well past what anyone reviewing a page does,
   * while still leaving headroom for a whole client team sharing one office IP — the identifier is
   * an address, not a participant.
   *
   * It is a flood bound rather than a CPU one. Each accepted write is a durable row in the
   * deployment's review database and a line in the digest that goes out to the other participants,
   * so an unbounded rate is unbounded storage on the host and unbounded mail sent in the agency's
   * name. Looser than reviewPassword because a wrong guess and a real comment are not comparable:
   * these callers have already passed the gate.
   */
  reviewComment: {
    limit: 60,
    windowMs: 10 * 60 * 1000
  }
} as const;

/**
 * Extract identifier (IP address) from request
 */
export function getIdentifier(request: Request): string {
  // Try to get real IP from common headers
  const forwardedFor = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const cfConnectingIp = request.headers.get('cf-connecting-ip'); // Cloudflare

  if (forwardedFor) {
    // x-forwarded-for can be comma-separated, take first
    return forwardedFor.split(',')[0].trim();
  }

  if (cfConnectingIp) {
    return cfConnectingIp;
  }

  if (realIp) {
    return realIp;
  }

  // Fallback to 'unknown' (should rarely happen)
  return 'unknown';
}
