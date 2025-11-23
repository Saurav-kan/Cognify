/**
 * LLM Queue Worker
 * Processes jobs from the queue respecting rate limits
 */

import { dequeueJob, updateJobStatus } from "../queue/queue";
import { processJob } from "./processor";
import { JobType } from "../queue/jobs";

const MAX_JOBS_PER_RUN = 5; // Process up to 5 jobs per worker run
const WORKER_INTERVAL_MS = 2000; // Check queue every 2 seconds

/**
 * Process jobs from a specific queue
 */
export async function processQueue(jobType: JobType): Promise<number> {
  let processed = 0;

  for (let i = 0; i < MAX_JOBS_PER_RUN; i++) {
    const jobData = await dequeueJob(jobType);

    if (!jobData) {
      break; // No more jobs
    }

    try {
      await processJob(jobData);
      processed++;
    } catch (error) {
      console.error(`[Worker] Error processing job ${jobData.jobId}:`, error);
      // Job status already updated in processor
    }
  }

  return processed;
}

/**
 * Process all queues
 */
export async function processAllQueues(): Promise<{
  explain: number;
  summarize: number;
  "summarize-batch": number;
  total: number;
}> {
  const jobTypes: JobType[] = ["explain", "summarize", "summarize-batch"];

  const results = await Promise.all(
    jobTypes.map(async (type) => ({
      type,
      count: await processQueue(type),
    }))
  );

  const explain = results.find((r) => r.type === "explain")?.count || 0;
  const summarize = results.find((r) => r.type === "summarize")?.count || 0;
  const summarizeBatch =
    results.find((r) => r.type === "summarize-batch")?.count || 0;

  return {
    explain,
    summarize,
    "summarize-batch": summarizeBatch,
    total: explain + summarize + summarizeBatch,
  };
}

/**
 * Worker entry point (for Vercel Cron Job)
 */
export async function runWorker() {
  try {
    const results = await processAllQueues();
    console.log(`[Worker] Processed ${results.total} jobs:`, results);
    return results;
  } catch (error) {
    console.error("[Worker] Error:", error);
    throw error;
  }
}

