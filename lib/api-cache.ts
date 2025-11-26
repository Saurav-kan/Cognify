import { LRUCache } from "lru-cache";
import crypto from "crypto";

// Configure LRU Cache
const options = {
  max: 500, // Max 500 items
  ttl: 1000 * 60 * 60 * 24, // 24 hour TTL
  allowStale: false,
  updateAgeOnGet: true,
  updateAgeOnHas: false,
};

export const cache = new LRUCache<string, string>(options);

export function generateCacheKey(
  prefix: string,
  params: Record<string, any>
): string {
  const sortedKeys = Object.keys(params).sort();
  const parts = sortedKeys.map((key) => `${key}:${params[key]}`);
  return `${prefix}:${parts.join("|")}`;
}

export function hashString(str: string): string {
  return crypto.createHash("md5").update(str).digest("hex");
}
