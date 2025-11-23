/**
 * Queue Client Setup using Upstash Redis
 * STABLE VERSION: Uses Lua scripts for all complex operations to avoid
 * Upstash library deserialization bugs (e.g. "Cannot use 'in' operator").
 */

import { getRedisClient, isRedisConfigured } from "../config/redis";
import { JobData, JobType, JOB_PRIORITIES, JobStatus } from "./jobs";

const QUEUE_PREFIX = "queue:";
const STATUS_PREFIX = "status:";
const PRIORITY_PREFIX = "priority:";

/**
 * Generate queue key for job type
 */
export function getQueueKey(jobType: JobType): string {
  return `${QUEUE_PREFIX}${jobType}`;
}

/**
 * Generate priority queue key
 */
export function getPriorityQueueKey(jobType: JobType): string {
  return `${PRIORITY_PREFIX}${jobType}`;
}

/**
 * Generate status key for job
 */
function getStatusKey(jobId: string): string {
  return `${STATUS_PREFIX}${jobId}`;
}

/**
 * Enqueue a job (Atomic Lua Script)
 */
export async function enqueueJob(
  jobType: JobType,
  jobData: JobData
): Promise<string> {
  if (!isRedisConfigured()) {
    throw new Error(
      "Redis not configured. Queue functionality requires Upstash Redis."
    );
  }

  try {
    const redis = getRedisClient();
    const priority = JOB_PRIORITIES[jobType] || 1;
    const jobId = jobData.jobId;

    console.log("[Queue] enqueueJob start", { jobType, jobId });

    // 1. Prepare data
    const score = priority * 1000000000000 + Date.now();
    const priorityKey = getPriorityQueueKey(jobType);
    const queueKey = getQueueKey(jobType); // Legacy support
    const statusKey = getStatusKey(jobId);

    const status: JobStatus = {
      jobId,
      status: "queued",
      createdAt: Date.now(),
    };

    // 2. Execute Atomic Lua Script
    // We pass the score as a string to ARGV[2] to prevent any number parsing issues
    await redis.eval(
      `
      -- 1. Store Job Data (24h TTL)
      redis.call("SET", KEYS[1], ARGV[1], "EX", 86400)

      -- 2. Add to Priority Queue (ZADD key score member)
      redis.call("ZADD", KEYS[2], ARGV[2], ARGV[3])

      -- 3. Add to Regular Queue (Legacy support)
      redis.call("LPUSH", KEYS[3], ARGV[3])

      -- 4. Initialize Status (24h TTL)
      redis.call("SET", KEYS[4], ARGV[4], "EX", 86400)

      return 1
      `,
      [
        `job:${jobId}`, // KEYS[1]
        priorityKey,    // KEYS[2]
        queueKey,       // KEYS[3]
        statusKey       // KEYS[4]
      ],
      [
        JSON.stringify(jobData), // ARGV[1]
        String(score),           // ARGV[2]
        jobId,                   // ARGV[3]
        JSON.stringify(status)   // ARGV[4]
      ]
    );

    console.log(`[Queue] ✅ Enqueued job ${jobId} via Lua`);
    return jobId;
  } catch (error) {
    console.error(`[Queue] ❌ Error enqueuing ${jobType} job:`, error);
    throw error;
  }
}

/**
 * Dequeue a job (Atomic Lua Script)
 * FIXES: "Cannot use 'in' operator" error by bypassing zpopmax parsing
 */
export async function dequeueJob(jobType: JobType): Promise<JobData | null> {
  if (!isRedisConfigured()) {
    return null;
  }

  const redis = getRedisClient();
  const priorityKey = getPriorityQueueKey(jobType);

  try {
    // Lua script to pop the max score item
    // Returns strictly an array [member, score] or null/empty
    const result = await redis.eval(
      `
      local result = redis.call("zpopmax", KEYS[1])
      return result
      `,
      [priorityKey],
      []
    );

    // Validate result format (Upstash returns array or null)
    if (!result || !Array.isArray(result) || result.length === 0) {
      return null;
    }

    // result[0] is the member (jobId)
    // result[1] is the score (we don't need it)
    const jobId = String(result[0]);

    if (!jobId || jobId === "undefined" || jobId === "null") {
      return null;
    }

    console.log(`[Queue] Dequeued job ${jobId} from ${jobType} queue`);

    // Fetch Job Data
    const jobData = await redis.get(`job:${jobId}`);

    if (!jobData) {
      console.warn(`[Queue] Job ${jobId} data missing (Zombie job)`);
      // Cleanup legacy queue just in case
      await redis.lrem(getQueueKey(jobType), 1, jobId).catch(() => {});
      return null;
    }

    // Cleanup legacy queue asynchronously
    redis.lrem(getQueueKey(jobType), 1, jobId).catch(() => {});

    // Return parsed data
    if (typeof jobData === "string") {
      return JSON.parse(jobData) as JobData;
    }
    return jobData as JobData;

  } catch (error) {
    console.error(`[Queue] ❌ Error dequeuing from ${jobType}:`, error);
    return null;
  }
}

/**
 * Update job status (Atomic Lua Script)
 * FIXES: Race conditions when updating status
 */
export async function updateJobStatus(
  jobId: string,
  updates: Partial<JobStatus>
): Promise<void> {
  if (!isRedisConfigured()) {
    return;
  }

  const redis = getRedisClient();
  const statusKey = getStatusKey(jobId);
  const updatesString = JSON.stringify(updates);

  try {
    await redis.eval(
      `
      local key = KEYS[1]
      local updates = cjson.decode(ARGV[1])
      
      -- Get current data
      local current_data = redis.call("GET", key)
      local status = {}

      if current_data then
          status = cjson.decode(current_data)
      end

      -- Merge updates into status
      for k,v in pairs(updates) do
          status[k] = v
      end

      -- Encode and save back
      local new_val = cjson.encode(status)
      redis.call("SET", key, new_val, "EX", 86400)
      return new_val
      `,
      [statusKey],
      [updatesString]
    );
  } catch (error) {
    console.error(`[Queue] Failed to update status for ${jobId}:`, error);
  }
}

/**
 * Get job status
 */
export async function getJobStatus(jobId: string): Promise<JobStatus | null> {
  if (!isRedisConfigured()) {
    return null;
  }

  const redis = getRedisClient();
  const statusData = await redis.get(getStatusKey(jobId));

  if (!statusData) {
    return null;
  }

  if (typeof statusData === "string") {
    return JSON.parse(statusData) as JobStatus;
  }
  return statusData as JobStatus;
}

/**
 * Get queue statistics
 */
export async function getQueueStats(jobType: JobType) {
  if (!isRedisConfigured()) {
    return { waiting: 0, active: 0, completed: 0, failed: 0, total: 0 };
  }

  const redis = getRedisClient();
  const priorityKey = getPriorityQueueKey(jobType);

  // Use zcard (safe, returns number)
  const waiting = await redis.zcard(priorityKey);
  
  return {
    waiting: waiting || 0,
    active: 0, // TODO: Implement active tracking
    completed: 0,
    failed: 0,
    total: waiting || 0,
  };
}

/**
 * Get all queue statistics
 */
export async function getAllQueueStats() {
  const jobTypes: JobType[] = ["explain", "summarize", "summarize-batch"];
  const stats = await Promise.all(
    jobTypes.map(async (type) => ({
      type,
      ...(await getQueueStats(type)),
    }))
  );

  const totals = stats.reduce(
    (acc, stat) => ({
      waiting: acc.waiting + stat.waiting,
      active: acc.active + stat.active,
      completed: acc.completed + stat.completed,
      failed: acc.failed + stat.failed,
    }),
    { waiting: 0, active: 0, completed: 0, failed: 0 }
  );

  return { queues: stats, totals };
}

/**
 * Get queue position for a job
 */
export async function getQueuePosition(
  jobType: JobType,
  jobId: string
): Promise<number | null> {
  if (!isRedisConfigured()) {
    return null;
  }
  const redis = getRedisClient();
  const rank = await redis.zrank(getPriorityQueueKey(jobType), jobId);
  return rank !== null ? rank + 1 : null;
}

/**
 * Check if queue system is available
 */
export function isQueueAvailable(): boolean {
  return isRedisConfigured();
}