/**
 * Job Status API Endpoint
 * Returns the current status of a queued job
 */

import { NextRequest } from "next/server";
import { getJobStatus, getQueuePosition } from "@/backend/queue/queue";
import { JobType } from "@/backend/queue/jobs";

export const runtime = "edge";

export async function GET(
  req: NextRequest,
  { params }: { params: { jobId: string } }
) {
  try {
    const { jobId } = params;

    if (!jobId) {
      return new Response(
        JSON.stringify({ error: "Job ID is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const status = await getJobStatus(jobId);

    if (!status) {
      return new Response(
        JSON.stringify({ error: "Job not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get queue position if queued
    if (status.status === "queued") {
      // Try to determine job type from status or infer from jobId
      // For now, we'll check all queues
      const jobTypes: JobType[] = ["explain", "summarize", "summarize-batch"];
      for (const type of jobTypes) {
        const position = await getQueuePosition(type, jobId);
        if (position !== null) {
          status.position = position;
          break;
        }
      }
    }

    return new Response(JSON.stringify(status), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[API Queue Status] Error:", error);
    return new Response(
      JSON.stringify({
        error:
          error instanceof Error ? error.message : "Failed to get job status",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

