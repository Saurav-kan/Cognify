/**
 * Upstash Redis Configuration
 * Used for queue management and distributed rate limiting
 */

import { Redis } from "@upstash/redis";

let redisClient: Redis | null = null;

/**
 * Get or create Redis client instance
 * Uses Upstash Redis REST API (Vercel-compatible)
 */
export function getRedisClient() {
  if (!redisClient) {
    redisClient = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
      // 👇 ADD THIS LINE
      enableAutoPipelining: false, 
      
      // Optional: Ensure retry logic is robust
      retry: {
        retries: 5,
        backoff: (retryCount) => Math.exp(retryCount) * 50,
      },
    });
  }
  return redisClient;
}
/**
 * Check if Redis is configured
 */
export function isRedisConfigured(): boolean {
  return !!(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

