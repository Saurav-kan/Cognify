/**
 * Vercel Cron Job Entry Point
 * This file is called by Vercel Cron Jobs to process the queue
 */

import { runWorker } from "./llm-worker";

export const config = {
  runtime: "nodejs",
};

export default async function handler() {
  try {
    const results = await runWorker();
    return Response.json({
      success: true,
      processed: results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Vercel Worker] Error:", error);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

