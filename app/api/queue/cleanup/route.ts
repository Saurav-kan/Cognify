/**
 * Queue Cleanup API Endpoint
 * Cleans up orphaned queue entries
 */

import { NextRequest } from "next/server";
import { cleanupAllQueues } from "@/backend/queue/cleanup";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  try {
    const results = await cleanupAllQueues();
    return new Response(JSON.stringify({ success: true, results }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[API Queue Cleanup] Error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Failed to cleanup queues",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

