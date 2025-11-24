import { waitUntil } from "@vercel/functions";

/**
 * Triggers the background worker immediately.
 * Uses waitUntil to ensure the request completes even after the response is sent.
 */
export function triggerWorker() {
  // Determine the base URL for the worker
  // Priority: APP_URL > NEXT_PUBLIC_APP_URL > VERCEL_PROJECT_PRODUCTION_URL > VERCEL_URL > localhost
  let baseUrl =
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : null) ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
    "http://localhost:3000";

  // Ensure no trailing slash
  if (baseUrl.endsWith("/")) {
    baseUrl = baseUrl.slice(0, -1);
  }

  const workerUrl = `${baseUrl}/api/cron/worker`;
  const cronSecret = process.env.CRON_SECRET;

  console.log(`[Trigger] 🚀 Preparing to trigger worker...`);
  console.log(`[Trigger] Target URL: ${workerUrl}`);
  console.log(`[Trigger] Secret available: ${!!cronSecret}`);

  if (!cronSecret) {
    console.error(
      "[Trigger] ❌ CRON_SECRET is missing! Worker request will likely fail 401."
    );
  }

  // Fire and forget (but keep alive with waitUntil)
  waitUntil(
    fetch(workerUrl, {
      method: "GET", // Cron jobs are usually GET
      headers: {
        Authorization: `Bearer ${cronSecret}`,
        "X-Trigger-Source": "instant",
      },
    })
      .then(async (res) => {
        if (res.ok) {
          console.log(`[Trigger] ✅ Worker triggered successfully: ${res.status}`);
        } else {
          const text = await res.text().catch(() => "No body");
          console.error(
            `[Trigger] ❌ Failed to trigger worker: ${res.status} ${res.statusText}`
          );
          console.error(`[Trigger] Response body: ${text}`);
        }
      })
      .catch((err) => {
        console.error("[Trigger] ❌ Network error triggering worker:", err);
      })
  );
}
