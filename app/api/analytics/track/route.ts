/**
 * Analytics Tracking Endpoint
 * Client-side endpoint for tracking analytics events
 */

import { NextRequest } from "next/server";
import {
  trackEvent,
  trackTTSUsage,
  trackApiCall,
  trackFeatureUsage,
} from "@/lib/analytics";
import { getClientIdentifier } from "@/lib/rate-limit";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  try {
    const { type, userId, ...metadata } = await req.json();
    const clientId = userId || getClientIdentifier(req);

    switch (type) {
      case "tts_usage":
        await trackTTSUsage(clientId, metadata.duration || 0);
        break;
      case "api_call":
        await trackApiCall(
          metadata.endpoint || "unknown",
          metadata.provider || "unknown",
          metadata.tokensUsed || 0,
          clientId,
          metadata.cached || false
        );
        break;
      case "feature":
        await trackFeatureUsage(metadata.feature || "unknown", clientId, metadata);
        break;
      default:
        await trackEvent(type, clientId, metadata);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[Analytics Track] Error:", error);
    // Don't fail the request - analytics failures shouldn't break the app
    return new Response(JSON.stringify({ success: false }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
}

