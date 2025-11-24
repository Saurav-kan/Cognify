import { waitUntil } from "@vercel/functions";

/**
 * Triggers the background worker immediately.
 * Uses waitUntil to ensure the request completes even after the response is sent.
 */
export function triggerWorker() {
  const workerUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}/api/cron/worker`
    : "http://localhost:3000/api/cron/worker";

  const cronSecret = process.env.CRON_SECRET;

  console.log("[Trigger] 🚀 Triggering background worker...");

  // Fire and forget (but keep alive with waitUntil)
  waitUntil(
    fetch(workerUrl, {
      headers: {
        Authorization: `Bearer ${cronSecret}`,
      },
    })
      .then((res) => {
        console.log(`[Trigger] Worker triggered: ${res.status}`);
      })
      .catch((err) => {
        console.error("[Trigger] Failed to trigger worker:", err);
      })
  );
}
