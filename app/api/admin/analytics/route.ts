/**
 * Admin Analytics API Endpoint
 * Returns analytics data for the admin panel
 */

import { NextRequest } from "next/server";
import {
  getAnalyticsSummary,
  getApiCallStats,
  getTTSStats,
  getFeatureStats,
  getDailyActivity,
} from "@/lib/analytics";
import { getAllQueueStats } from "@/backend/queue/queue";
import { getAllProviderUsage } from "@/backend/queue/rate-limiter";

export const runtime = "edge";

// Simple admin authentication (in production, use proper auth)
function isAdmin(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  const adminSecret = process.env.ADMIN_SECRET;
  
  // In development, allow access without secret
  if (process.env.NODE_ENV !== "production") {
    return true;
  }
  
  if (!adminSecret) {
    // If no admin secret set in production, deny access
    return false;
  }

  return authHeader === `Bearer ${adminSecret}`;
}

export async function GET(req: NextRequest) {
  // Check admin authentication
  if (!isAdmin(req)) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const url = new URL(req.url);
    const type = url.searchParams.get("type") || "summary";

    switch (type) {
      case "summary": {
        const summary = await getAnalyticsSummary();
        const [queueStats, providerUsage] = await Promise.all([
          getAllQueueStats(),
          getAllProviderUsage(),
        ]);

        return new Response(
          JSON.stringify({
            ...summary,
            queue: queueStats.totals,
            providerUtilization: providerUsage,
          }),
          { headers: { "Content-Type": "application/json" } }
        );
      }

      case "api": {
        const days = parseInt(url.searchParams.get("days") || "7", 10);
        const stats = await getApiCallStats(days);
        return new Response(JSON.stringify(stats), {
          headers: { "Content-Type": "application/json" },
        });
      }

      case "tts": {
        const days = parseInt(url.searchParams.get("days") || "7", 10);
        const stats = await getTTSStats(days);
        return new Response(JSON.stringify(stats), {
          headers: { "Content-Type": "application/json" },
        });
      }

      case "features": {
        const days = parseInt(url.searchParams.get("days") || "7", 10);
        const stats = await getFeatureStats(days);
        return new Response(JSON.stringify(stats), {
          headers: { "Content-Type": "application/json" },
        });
      }

      case "queue": {
        const stats = await getAllQueueStats();
        return new Response(JSON.stringify(stats), {
          headers: { "Content-Type": "application/json" },
        });
      }

      case "providers": {
        const usage = await getAllProviderUsage();
        return new Response(JSON.stringify(usage), {
          headers: { "Content-Type": "application/json" },
        });
      }

      case "daily-activity": {
        const days = parseInt(url.searchParams.get("days") || "365", 10);
        const activity = await getDailyActivity(days);
        return new Response(JSON.stringify(activity), {
          headers: { "Content-Type": "application/json" },
        });
      }

      default:
        return new Response(
          JSON.stringify({ error: "Invalid type parameter" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
    }
  } catch (error) {
    console.error("[Admin Analytics] Error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Failed to get analytics",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

