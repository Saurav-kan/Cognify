/**
 * Distributed Rate Limiter using Redis (Lua Optimized)
 * Tracks rate limits (RPM and TPM) per provider atomically.
 * Prevents Upstash library crashes and race conditions.
 */

import { getRedisClient, isRedisConfigured } from "../config/redis";

export type Provider =
  | "groq"
  | "gemini"
  | "siliconflow"
  | "huggingface"
  | "openrouter"
  | "github";

interface ProviderLimits {
  rpm: number; // Requests per minute
  tpm: number; // Tokens per minute
}

/**
 * Provider rate limits (conservative estimates)
 */
export const PROVIDER_LIMITS: Record<Provider, ProviderLimits> = {
  groq: { rpm: 30, tpm: 6000 },
  gemini: { rpm: 15, tpm: 1000000 },
  siliconflow: { rpm: 1000, tpm: 80000 }, // tencent/Hunyuan-MT-7B: 80k TPM, 1000 RPM
  huggingface: { rpm: 100, tpm: 100000 },
  openrouter: { rpm: 20, tpm: 100000 },
  github: { rpm: 1, tpm: 10000 },
};

const RATE_LIMIT_PREFIX = "ratelimit:";
const TOKEN_BUCKET_PREFIX = "tokens:";

/**
 * Check if provider can handle request (Atomic Lua Script)
 * Checks BOTH RPM and TPM in a single network call.
 */
export async function canProcessRequest(
  provider: Provider,
  estimatedTokens: number = 100
): Promise<{ allowed: boolean; reason?: string }> {
  if (!isRedisConfigured()) {
    // Fail open if Redis is down
    return { allowed: true };
  }

  const redis = getRedisClient();
  const limits = PROVIDER_LIMITS[provider] || { rpm: 10, tpm: 1000 };

  const rpmKey = `${RATE_LIMIT_PREFIX}${provider}:rpm`;
  const tpmKey = `${TOKEN_BUCKET_PREFIX}${provider}`;

  const now = Date.now();
  const windowStart = now - 60000; // 1 minute window

  try {
    // ATOMIC LUA SCRIPT
    // 1. Cleans old RPM entries
    // 2. Checks RPM limit
    // 3. Checks TPM limit
    // 4. Updates both if allowed
    const result = (await redis.eval(
      `
      local rpmKey = KEYS[1]
      local tpmKey = KEYS[2]
      
      local now = tonumber(ARGV[1])
      local windowStart = tonumber(ARGV[2])
      local rpmLimit = tonumber(ARGV[3])
      local tpmLimit = tonumber(ARGV[4])
      local tokenCost = tonumber(ARGV[5])
      local uniqueId = ARGV[6]

      -- 1. Clean up old RPM requests (Sliding Window)
      redis.call("ZREMRANGEBYSCORE", rpmKey, 0, windowStart)

      -- 2. Check RPM
      local currentRpm = redis.call("ZCARD", rpmKey)
      if currentRpm >= rpmLimit then
          return {0, "Rate limit exceeded: " .. rpmLimit .. " RPM"}
      end

      -- 3. Check TPM
      local currentTpm = tonumber(redis.call("GET", tpmKey) or "0")
      if currentTpm + tokenCost > tpmLimit then
           return {0, "Token limit exceeded: " .. tpmLimit .. " TPM"}
      end

      -- 4. Execute Updates (Allowed)
      -- Add to RPM set
      redis.call("ZADD", rpmKey, now, uniqueId)
      redis.call("EXPIRE", rpmKey, 120) -- Safety expiry

      -- Add to TPM bucket
      redis.call("INCRBY", tpmKey, tokenCost)
      redis.call("EXPIRE", tpmKey, 120) -- Safety expiry

      return {1, "OK"}
      `,
      [rpmKey, tpmKey], // KEYS
      [
        String(now),
        String(windowStart),
        String(limits.rpm),
        String(limits.tpm),
        String(estimatedTokens),
        `${now}-${Math.random()}`, // Unique ID
      ]
    )) as [number, string];

    const allowed = result[0] === 1;

    return {
      allowed,
      reason: allowed ? undefined : result[1],
    };
  } catch (error) {
    console.error(`[RateLimit] Error checking ${provider}:`, error);
    // In case of Redis error, we usually allow the request to proceed (fail open)
    // to prevent blocking users due to infrastructure glitches.
    return { allowed: true };
  }
}

/**
 * Get current usage for a provider (ReadOnly)
 */
export async function getProviderUsage(provider: Provider): Promise<{
  rpm: number;
  rpmLimit: number;
  tpm: number;
  tpmLimit: number;
  utilization: number;
}> {
  if (!isRedisConfigured()) {
    return { rpm: 0, rpmLimit: 0, tpm: 0, tpmLimit: 0, utilization: 0 };
  }

  const redis = getRedisClient();
  const limits = PROVIDER_LIMITS[provider];
  const now = Date.now();
  const windowStart = now - 60000;

  try {
    const rpmKey = `${RATE_LIMIT_PREFIX}${provider}:rpm`;
    const tpmKey = `${TOKEN_BUCKET_PREFIX}${provider}`;

    // Run clean up on read so we get accurate numbers
    // Note: We don't use a transaction here for speed, slight inaccuracy is fine for UI
    await redis.zremrangebyscore(rpmKey, 0, windowStart);

    const rpm = await redis.zcard(rpmKey);
    const tpmStr = await redis.get(tpmKey);
    const tpm = tpmStr ? parseInt(tpmStr as string, 10) : 0;

    const rpmUtilization = limits.rpm > 0 ? rpm / limits.rpm : 0;
    const tpmUtilization = limits.tpm > 0 ? tpm / limits.tpm : 0;
    const utilization = Math.max(rpmUtilization, tpmUtilization);

    return {
      rpm: rpm || 0,
      rpmLimit: limits.rpm,
      tpm: tpm || 0,
      tpmLimit: limits.tpm,
      utilization: Math.min(utilization, 1),
    };
  } catch (e) {
    return {
      rpm: 0,
      rpmLimit: limits.rpm,
      tpm: 0,
      tpmLimit: limits.tpm,
      utilization: 0,
    };
  }
}

/**
 * Get usage for all providers
 */
export async function getAllProviderUsage() {
  const providers: Provider[] = [
    "groq",
    "gemini",
    "siliconflow",
    "huggingface",
    "openrouter",
    "github",
  ];

  const usage = await Promise.all(
    providers.map(async (provider) => ({
      provider,
      ...(await getProviderUsage(provider)),
    }))
  );

  return usage.reduce((acc, item) => {
    const { provider, ...rest } = item;
    acc[provider] = rest;
    return acc;
  }, {} as Record<Provider, any>);
}

// Deprecated functions (kept to prevent import errors if used elsewhere, but mapped to new logic)
export async function canMakeRequest(provider: Provider): Promise<boolean> {
  const result = await canProcessRequest(provider, 0);
  return result.allowed;
}

export async function hasTokensAvailable(
  provider: Provider,
  tokens: number
): Promise<boolean> {
  const result = await canProcessRequest(provider, tokens);
  return result.allowed;
}
