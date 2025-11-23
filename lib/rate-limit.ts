/**
 * Simple rate limiting for Edge runtime
 * Uses in-memory storage (per-instance)
 * For production, consider using Vercel KV or Redis for distributed rate limiting
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

class RateLimiter {
  private limits = new Map<string, RateLimitEntry>();
  private readonly windowMs: number;
  private readonly maxRequests: number;

  constructor(maxRequests: number = 10, windowMs: number = 60 * 60 * 1000) {
    // Default: 10 requests per hour
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  /**
   * Check if request is allowed
   * @param identifier - Unique identifier (IP, user ID, etc.)
   * @returns { allowed: boolean, remaining: number, resetAt: number }
   */
  check(identifier: string): {
    allowed: boolean;
    remaining: number;
    resetAt: number;
  } {
    const now = Date.now();
    const entry = this.limits.get(identifier);

    if (!entry || now > entry.resetAt) {
      // Create new window
      const resetAt = now + this.windowMs;
      this.limits.set(identifier, { count: 1, resetAt });
      return {
        allowed: true,
        remaining: this.maxRequests - 1,
        resetAt,
      };
    }

    if (entry.count >= this.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: entry.resetAt,
      };
    }

    // Increment count
    entry.count++;
    return {
      allowed: true,
      remaining: this.maxRequests - entry.count,
      resetAt: entry.resetAt,
    };
  }

  /**
   * Get remaining requests for identifier
   */
  getRemaining(identifier: string): number {
    const entry = this.limits.get(identifier);
    if (!entry || Date.now() > entry.resetAt) {
      return this.maxRequests;
    }
    return Math.max(0, this.maxRequests - entry.count);
  }

  /**
   * Clean up expired entries
   */
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.limits.entries()) {
      if (now > entry.resetAt) {
        this.limits.delete(key);
      }
    }
  }
}

// Global rate limiter instance
// Increased limits for better capacity:
// - 100 requests per hour per user (up from 20)
// - This allows ~1.67 requests per minute per user
// - With caching, most requests won't hit the limit
export const rateLimiter = new RateLimiter(100, 60 * 60 * 1000);

/**
 * Get client identifier from request
 * Uses IP address or a combination of headers
 */
export function getClientIdentifier(req: Request): string {
  // Try to get IP from various headers (Vercel, Cloudflare, etc.)
  const forwarded = req.headers.get("x-forwarded-for");
  const realIp = req.headers.get("x-real-ip");
  const cfConnectingIp = req.headers.get("cf-connecting-ip");

  const ip = forwarded?.split(",")[0] || realIp || cfConnectingIp || "unknown";
  
  // Hash IP for privacy (don't store raw IPs)
  return hashString(ip);
}

/**
 * Hash function for creating stable identifiers
 */
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

