/**
 * Analytics Tracking System
 * Tracks user actions, API calls, and usage metrics
 */

import { getRedisClient, isRedisConfigured } from "@/backend/config/redis";

interface AnalyticsEvent {
  type: string;
  userId: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

const ANALYTICS_PREFIX = "analytics:";
const ACTIVE_USERS_KEY = `${ANALYTICS_PREFIX}active_users`;
const EVENTS_KEY = `${ANALYTICS_PREFIX}events`;
const TTS_USAGE_KEY = `${ANALYTICS_PREFIX}tts_usage`;
const API_CALLS_KEY = `${ANALYTICS_PREFIX}api_calls`;
const TOKEN_USAGE_KEY = `${ANALYTICS_PREFIX}token_usage`;

/**
 * Track an analytics event
 */
export async function trackEvent(
  type: string,
  userId: string,
  metadata?: Record<string, any>
): Promise<void> {
  if (!isRedisConfigured()) {
    return; // Silently fail if Redis not configured
  }

  try {
    const redis = getRedisClient();
    const event: AnalyticsEvent = {
      type,
      userId,
      timestamp: Date.now(),
      metadata,
    };

    // Store event (keep last 10000 events, 7 days TTL)
    await redis.lpush(EVENTS_KEY, JSON.stringify(event));
    await redis.ltrim(EVENTS_KEY, 0, 9999);
    await redis.expire(EVENTS_KEY, 7 * 24 * 60 * 60); // 7 days

    // Track active users (set with TTL of 5 minutes)
    await redis.set(`${ACTIVE_USERS_KEY}:${userId}`, "1", { ex: 300 });
  } catch (error) {
    console.error("[Analytics] Error tracking event:", error);
    // Don't throw - analytics failures shouldn't break the app
  }
}

/**
 * Track API call
 */
export async function trackApiCall(
  endpoint: string,
  provider: string,
  tokensUsed: number,
  userId: string,
  cached: boolean = false
): Promise<void> {
  if (!isRedisConfigured()) {
    return;
  }

  try {
    const redis = getRedisClient();
    const today = new Date().toISOString().split("T")[0];
    const hour = new Date().getHours();

    // Track by endpoint
    await redis.hincrby(`${API_CALLS_KEY}:endpoint:${today}`, endpoint, 1);
    await redis.expire(`${API_CALLS_KEY}:endpoint:${today}`, 7 * 24 * 60 * 60);

    // Track by provider
    await redis.hincrby(`${API_CALLS_KEY}:provider:${today}`, provider, 1);
    await redis.expire(`${API_CALLS_KEY}:provider:${today}`, 7 * 24 * 60 * 60);

    // Track tokens used
    await redis.hincrby(`${TOKEN_USAGE_KEY}:${today}`, provider, tokensUsed);
    await redis.expire(`${TOKEN_USAGE_KEY}:${today}`, 7 * 24 * 60 * 60);

    // Track cache hits
    if (cached) {
      await redis.hincrby(`${API_CALLS_KEY}:cache:${today}`, "hits", 1);
    } else {
      await redis.hincrby(`${API_CALLS_KEY}:cache:${today}`, "misses", 1);
    }
    await redis.expire(`${API_CALLS_KEY}:cache:${today}`, 7 * 24 * 60 * 60);

    // Track hourly distribution
    await redis.hincrby(`${API_CALLS_KEY}:hourly:${today}`, hour.toString(), 1);
    await redis.expire(`${API_CALLS_KEY}:hourly:${today}`, 7 * 24 * 60 * 60);

    // Track event
    await trackEvent("api_call", userId, {
      endpoint,
      provider,
      tokensUsed,
      cached,
    });
  } catch (error) {
    console.error("[Analytics] Error tracking API call:", error);
  }
}

/**
 * Track TTS usage
 */
export async function trackTTSUsage(userId: string, duration: number): Promise<void> {
  if (!isRedisConfigured()) {
    return;
  }

  try {
    const redis = getRedisClient();
    const today = new Date().toISOString().split("T")[0];

    // Track TTS usage count
    await redis.hincrby(TTS_USAGE_KEY, today, 1);
    await redis.expire(TTS_USAGE_KEY, 7 * 24 * 60 * 60);

    // Track TTS duration
    await redis.hincrby(`${TTS_USAGE_KEY}:duration:${today}`, userId, duration);
    await redis.expire(`${TTS_USAGE_KEY}:duration:${today}`, 7 * 24 * 60 * 60);

    // Track event
    await trackEvent("tts_usage", userId, { duration });
  } catch (error) {
    console.error("[Analytics] Error tracking TTS usage:", error);
  }
}

/**
 * Track feature usage
 */
export async function trackFeatureUsage(
  feature: string,
  userId: string,
  metadata?: Record<string, any>
): Promise<void> {
  await trackEvent(`feature:${feature}`, userId, metadata);
}

/**
 * Get active user count
 */
export async function getActiveUserCount(): Promise<number> {
  if (!isRedisConfigured()) {
    return 0;
  }

  try {
    const redis = getRedisClient();
    const keys = await redis.keys(`${ACTIVE_USERS_KEY}:*`);
    return keys.length;
  } catch (error) {
    console.error("[Analytics] Error getting active user count:", error);
    return 0;
  }
}

/**
 * Get API call statistics
 */
export async function getApiCallStats(days: number = 7): Promise<{
  byEndpoint: Record<string, number>;
  byProvider: Record<string, number>;
  totalCalls: number;
  cacheHitRate: number;
  tokenUsage: Record<string, number>;
  hourlyDistribution: Record<number, number>;
}> {
  if (!isRedisConfigured()) {
    return {
      byEndpoint: {},
      byProvider: {},
      totalCalls: 0,
      cacheHitRate: 0,
      tokenUsage: {},
      hourlyDistribution: {},
    };
  }

  try {
    const redis = getRedisClient();
    const today = new Date();
    const stats = {
      byEndpoint: {} as Record<string, number>,
      byProvider: {} as Record<string, number>,
      totalCalls: 0,
      cacheHitRate: 0,
      tokenUsage: {} as Record<string, number>,
      hourlyDistribution: {} as Record<number, number>,
    };

    // Aggregate data for last N days
    for (let i = 0; i < days; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split("T")[0];

      // Get endpoint stats
      const endpointData = await redis.hgetall(`${API_CALLS_KEY}:endpoint:${dateStr}`);
      for (const [endpoint, count] of Object.entries(endpointData || {})) {
        stats.byEndpoint[endpoint] = (stats.byEndpoint[endpoint] || 0) + parseInt(count as string, 10);
      }

      // Get provider stats
      const providerData = await redis.hgetall(`${API_CALLS_KEY}:provider:${dateStr}`);
      for (const [provider, count] of Object.entries(providerData || {})) {
        stats.byProvider[provider] = (stats.byProvider[provider] || 0) + parseInt(count as string, 10);
      }

      // Get token usage
      const tokenData = await redis.hgetall(`${TOKEN_USAGE_KEY}:${dateStr}`);
      for (const [provider, tokens] of Object.entries(tokenData || {})) {
        stats.tokenUsage[provider] = (stats.tokenUsage[provider] || 0) + parseInt(tokens as string, 10);
      }

      // Get cache stats
      const cacheData = await redis.hgetall(`${API_CALLS_KEY}:cache:${dateStr}`);
      const hits = parseInt((cacheData?.hits as string) || "0", 10);
      const misses = parseInt((cacheData?.misses as string) || "0", 10);
      const total = hits + misses;
      if (total > 0) {
        const hitRate = hits / total;
        stats.cacheHitRate = (stats.cacheHitRate + hitRate) / (i + 1);
      }

      // Get hourly distribution (use today only)
      if (i === 0) {
        const hourlyData = await redis.hgetall(`${API_CALLS_KEY}:hourly:${dateStr}`);
        for (const [hour, count] of Object.entries(hourlyData || {})) {
          stats.hourlyDistribution[parseInt(hour, 10)] = parseInt(count as string, 10);
        }
      }
    }

    // Calculate total calls
    stats.totalCalls = Object.values(stats.byEndpoint).reduce((sum, count) => sum + count, 0);

    return stats;
  } catch (error) {
    console.error("[Analytics] Error getting API call stats:", error);
    return {
      byEndpoint: {},
      byProvider: {},
      totalCalls: 0,
      cacheHitRate: 0,
      tokenUsage: {},
      hourlyDistribution: {},
    };
  }
}

/**
 * Get TTS usage statistics
 */
export async function getTTSStats(days: number = 7): Promise<{
  totalUsage: number;
  uniqueUsers: number;
  averageDuration: number;
  usageByDay: Record<string, number>;
}> {
  if (!isRedisConfigured()) {
    return {
      totalUsage: 0,
      uniqueUsers: 0,
      averageDuration: 0,
      usageByDay: {},
    };
  }

  try {
    const redis = getRedisClient();
    const today = new Date();
    const stats = {
      totalUsage: 0,
      uniqueUsers: 0,
      averageDuration: 0,
      usageByDay: {} as Record<string, number>,
    };

    let totalDuration = 0;
    const userSet = new Set<string>();

    for (let i = 0; i < days; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split("T")[0];

      const usage = await redis.hget(TTS_USAGE_KEY, dateStr);
      const dayUsage = parseInt((usage as string) || "0", 10);
      stats.usageByDay[dateStr] = dayUsage;
      stats.totalUsage += dayUsage;

      // Get duration data
      const durationData = await redis.hgetall(`${TTS_USAGE_KEY}:duration:${dateStr}`);
      for (const [userId, duration] of Object.entries(durationData || {})) {
        userSet.add(userId);
        totalDuration += parseInt(duration as string, 10);
      }
    }

    stats.uniqueUsers = userSet.size;
    stats.averageDuration = stats.totalUsage > 0 ? totalDuration / stats.totalUsage : 0;

    return stats;
  } catch (error) {
    console.error("[Analytics] Error getting TTS stats:", error);
    return {
      totalUsage: 0,
      uniqueUsers: 0,
      averageDuration: 0,
      usageByDay: {},
    };
  }
}

/**
 * Get feature usage statistics
 */
export async function getFeatureStats(days: number = 7): Promise<Record<string, number>> {
  if (!isRedisConfigured()) {
    return {};
  }

  try {
    const redis = getRedisClient();
    const featureCounts: Record<string, number> = {};

    // Get events from last N days
    const events = await redis.lrange(EVENTS_KEY, 0, 9999);
    const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000;

    for (const eventStr of events) {
      try {
        const event = JSON.parse(eventStr as string) as AnalyticsEvent;
        if (event.timestamp < cutoffTime) continue;

        if (event.type.startsWith("feature:")) {
          const feature = event.type.replace("feature:", "");
          featureCounts[feature] = (featureCounts[feature] || 0) + 1;
        }
      } catch (e) {
        // Skip invalid events
      }
    }

    return featureCounts;
  } catch (error) {
    console.error("[Analytics] Error getting feature stats:", error);
    return {};
  }
}

/**
 * Get unique visitor count (HyperLogLog)
 */
export async function getUniqueVisitorCount(days: number = 1): Promise<number> {
  if (!isRedisConfigured()) {
    return 0;
  }

  try {
    const redis = getRedisClient();
    const today = new Date().toISOString().split("T")[0];
    
    // For "today", we just check today's key
    if (days === 1) {
      return await redis.pfcount(`analytics:unique_visitors:${today}`);
    }
    
    // For "all time", we check the all-time key
    if (days > 30) {
      return await redis.pfcount("analytics:unique_visitors:all_time");
    }

    // For other ranges, we would need to merge HLLs, but for now let's just return today's count
    // or implement merging if needed. For simplicity, we'll return today's count for short ranges.
    return await redis.pfcount(`analytics:unique_visitors:${today}`);
  } catch (error) {
    console.error("[Analytics] Error getting unique visitor count:", error);
    return 0;
  }
}

/**
 * Get overall analytics summary
 */
export async function getAnalyticsSummary(): Promise<{
  activeUsers: number;
  uniqueVisitors: number; // Today's unique visitors
  totalUniqueUsers: number; // All-time unique visitors
  totalApiCalls: number;
  cacheHitRate: number;
  totalTokensUsed: number;
  ttsUsageCount: number;
  ttsUsagePercentage: number;
  topProviders: Array<{ provider: string; calls: number }>;
  topEndpoints: Array<{ endpoint: string; calls: number }>;
}> {
  const [activeUsers, uniqueVisitors, totalUniqueUsers, apiStats, ttsStats] = await Promise.all([
    getActiveUserCount(),
    getUniqueVisitorCount(1), // Today's unique visitors
    getUniqueVisitorCount(999), // All-time unique visitors
    getApiCallStats(7),
    getTTSStats(7),
  ]);

  // Calculate TTS usage percentage (estimate based on active users)
  const ttsUsagePercentage =
    activeUsers > 0 ? (ttsStats.uniqueUsers / activeUsers) * 100 : 0;

  // Get top providers
  const topProviders = Object.entries(apiStats.byProvider)
    .map(([provider, calls]) => ({ provider, calls }))
    .sort((a, b) => b.calls - a.calls)
    .slice(0, 5);

  // Get top endpoints
  const topEndpoints = Object.entries(apiStats.byEndpoint)
    .map(([endpoint, calls]) => ({ endpoint, calls }))
    .sort((a, b) => b.calls - a.calls)
    .slice(0, 5);

  const totalTokensUsed = Object.values(apiStats.tokenUsage).reduce(
    (sum, tokens) => sum + tokens,
    0
  );

  return {
    activeUsers,
    uniqueVisitors,
    totalUniqueUsers,
    totalApiCalls: apiStats.totalCalls,
    cacheHitRate: apiStats.cacheHitRate,
    totalTokensUsed,
    ttsUsageCount: ttsStats.totalUsage,
    ttsUsagePercentage,
    topProviders,
    topEndpoints,
  };
}

