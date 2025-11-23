/**
 * Vercel Cron Job Endpoint
 * Processes queue jobs periodically
 */

import { runWorker } from "@/backend/workers/llm-worker";

export const runtime = "nodejs";

export async function GET(req: Request) {
  // Verify this is a Vercel Cron request (skip in development)
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  
  // In development, allow access without secret or with any secret
  // In production, require CRON_SECRET
  if (process.env.NODE_ENV === "production" && cronSecret) {
    if (authHeader !== `Bearer ${cronSecret}`) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  try {
    const results = await runWorker();
    return Response.json({
      success: true,
      processed: results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Cron Worker] Error:", error);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

