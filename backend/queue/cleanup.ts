/**
 * Queue Cleanup Utilities
 * Removes orphaned entries and fixes queue inconsistencies
 */

import { getRedisClient, isRedisConfigured } from "../config/redis";
import { JobType } from "./jobs";
import { getQueueKey, getPriorityQueueKey } from "./queue";

/**
 * Clean up orphaned entries in regular queue that don't exist in priority queue
 */
export async function cleanupOrphanedQueueEntries(jobType: JobType): Promise<number> {
  if (!isRedisConfigured()) {
    return 0;
  }

  const redis = getRedisClient();
  const priorityKey = getPriorityQueueKey(jobType);
  const regularKey = getQueueKey(jobType);

  // Get all job IDs from both queues
  const priorityJobs = await redis.zrange(priorityKey, 0, -1);
  const regularJobs = await redis.lrange(regularKey, 0, -1);

  // Find orphaned entries (in regular queue but not in priority queue)
  const prioritySet = new Set(priorityJobs.map((j) => String(j)));
  const orphaned = regularJobs.filter((jobId) => !prioritySet.has(String(jobId)));

  // Remove orphaned entries from regular queue
  let removed = 0;
  for (const jobId of orphaned) {
    await redis.lrem(regularKey, 0, String(jobId)); // Remove all occurrences
    removed++;
  }

  if (removed > 0) {
    console.log(`[Queue Cleanup] Removed ${removed} orphaned entries from ${jobType} regular queue`);
  }

  return removed;
}

/**
 * Clean up all queue types
 */
export async function cleanupAllQueues(): Promise<{
  explain: number;
  summarize: number;
  "summarize-batch": number;
  total: number;
}> {
  const jobTypes: JobType[] = ["explain", "summarize", "summarize-batch"];
  const results = await Promise.all(
    jobTypes.map(async (type) => ({
      type,
      removed: await cleanupOrphanedQueueEntries(type),
    }))
  );

  const total = results.reduce((sum, r) => sum + r.removed, 0);

  return {
    explain: results.find((r) => r.type === "explain")?.removed || 0,
    summarize: results.find((r) => r.type === "summarize")?.removed || 0,
    "summarize-batch": results.find((r) => r.type === "summarize-batch")?.removed || 0,
    total,
  };
}

