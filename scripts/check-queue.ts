// scripts/check-queue.ts
import { Redis } from "@upstash/redis";
import * as dotenv from "dotenv";
import * as path from "path";

// Try to load .env.local first, then fall back to .env
// We resolve the path relative to the current working directory
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

async function checkRedis() {
  console.log("🔌 Connecting to Redis...");
  
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    console.error("❌ Error: UPSTASH_REDIS_REST_URL or TOKEN is missing from env variables.");
    process.exit(1);
  }

  const redis = new Redis({ url, token });

  console.log("\n🔍 Checking Queue Status...");
  
  // 1. Check Priority Keys (The "Real" Queue)
  const priorityKeys = await redis.keys("priority:*");
  if (priorityKeys.length === 0) {
    console.log("   [Priority Queue] Empty (No keys found)");
  } else {
    for (const key of priorityKeys) {
      const count = await redis.zcard(key);
      console.log(`   [Priority Queue] ${key}: ${count} jobs waiting`);
      
      // Show the first few items
      if (count > 0) {
        const items = await redis.zrange(key, 0, -1, { withScores: true });
        console.log(`      -> Contents:`, items);
      }
    }
  }

  // 2. Check Regular Keys (Compatibility Queue)
  const regularKeys = await redis.keys("queue:*");
  for (const key of regularKeys) {
    const count = await redis.llen(key);
    console.log(`   [Regular Queue ] ${key}: ${count} items`);
  }

  // 3. Check Job Data availability (Sanity Check)
  // Just checking one random job if we found any
  if (priorityKeys.length > 0) {
     const sample = await redis.zrange(priorityKeys[0], 0, 0);
     if (sample.length > 0) {
       const jobId = sample[0];
       const exists = await redis.exists(`job:${jobId}`);
       console.log(`\n   [Data Check] Checking job payload for '${jobId}': ${exists ? "✅ Found" : "❌ MISSING"}`);
     }
  }
}

checkRedis().catch(console.error);