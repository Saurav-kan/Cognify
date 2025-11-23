/**
 * System Status API Endpoint
 * Returns overall system status including queue depth and load metrics
 */

import { NextRequest } from "next/server";
import { getAllQueueStats } from "@/backend/queue/queue";
import { getAllProviderUsage } from "@/backend/queue/rate-limiter";
import { isQueueAvailable } from "@/backend/queue/queue";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  try {
    if (!isQueueAvailable()) {
      // If queue not available, return basic status
      return new Response(
        JSON.stringify({
          queueAvailable: false,
          status: "green",
          message: "Queue system not configured",
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    const [queueStats, providerUsage] = await Promise.all([
      getAllQueueStats(),
      getAllProviderUsage(),
    ]);

    const totalWaiting = queueStats.totals.waiting;
    const totalActive = queueStats.totals.active;

    // Calculate overall utilization (max across all providers)
    const maxUtilization = Math.max(
      ...Object.values(providerUsage).map((u) => u.utilization)
    );

    // Determine status color
    let status: "green" | "yellow" | "red";
    if (totalWaiting < 10 && maxUtilization < 0.5) {
      status = "green";
    } else if (totalWaiting < 50 && maxUtilization < 0.8) {
      status = "yellow";
    } else {
      status = "red";
    }

    // Calculate estimated wait time (rough estimate: 2 seconds per job)
    const estimatedWaitTime = totalWaiting * 2;

    return new Response(
      JSON.stringify({
        queueAvailable: true,
        status,
        queue: {
          waiting: totalWaiting,
          active: totalActive,
          estimatedWaitTimeSeconds: estimatedWaitTime,
        },
        providers: providerUsage,
        utilization: maxUtilization,
        timestamp: Date.now(),
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[API System Status] Error:", error);
    return new Response(
      JSON.stringify({
        error:
          error instanceof Error ? error.message : "Failed to get system status",
        status: "red",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

