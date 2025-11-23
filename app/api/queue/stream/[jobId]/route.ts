/**
 * Job Stream API Endpoint
 * Streams job results using Server-Sent Events (SSE)
 */

import { NextRequest } from "next/server";
import { getJobStatus } from "@/backend/queue/queue";

export const runtime = "edge";

export async function GET(
  req: NextRequest,
  { params }: { params: { jobId: string } }
) {
  try {
    const { jobId } = params;

    if (!jobId) {
      return new Response("Job ID is required", { status: 400 });
    }

    // Create SSE stream
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        let lastStatus: string | null = null;

        const sendEvent = (data: any) => {
          const message = `data: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(message));
        };

        // Poll for status updates
        const pollInterval = setInterval(async () => {
          try {
            const status = await getJobStatus(jobId);

            if (!status) {
              sendEvent({ error: "Job not found" });
              clearInterval(pollInterval);
              controller.close();
              return;
            }

            // Send update if status changed
            if (status.status !== lastStatus) {
              if (status.status === "completed" && status.result) {
                // Job completed - send result
                if (status.result.success && status.result.data) {
                  // For explain jobs, data is a string
                  if (typeof status.result.data === "string") {
                    sendEvent({
                      type: "result",
                      data: { content: status.result.data },
                    });
                  } 
                  // For batch summaries, data is an object with page summaries
                  else if (typeof status.result.data === "object") {
                    sendEvent({
                      type: "result",
                      data: { summaries: status.result.data },
                    });
                  }
                }
                controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                clearInterval(pollInterval);
                controller.close();
                return;
              } else if (status.status === "failed") {
                // Job failed - send error
                sendEvent({
                  type: "error",
                  data: { message: status.error || "Job failed" },
                });
                controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                clearInterval(pollInterval);
                controller.close();
                return;
              } else if (status.status === "processing") {
                // Job is processing - send status update
                sendEvent({
                  type: "status",
                  data: { status: "processing" },
                });
              }
              lastStatus = status.status;
            } else if (status.progress && typeof status.progress === "object") {
              // Send progress update (if processor sends incremental progress)
              if (status.progress.content) {
                sendEvent({
                  type: "progress",
                  data: { content: status.progress.content },
                });
              }
            }
          } catch (error) {
            sendEvent({
              error: error instanceof Error ? error.message : "Unknown error",
            });
            clearInterval(pollInterval);
            controller.close();
          }
        }, 1000); // Poll every second

        // Cleanup on client disconnect
        req.signal.addEventListener("abort", () => {
          clearInterval(pollInterval);
          controller.close();
        });
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("[API Queue Stream] Error:", error);
    return new Response(
      JSON.stringify({
        error:
          error instanceof Error ? error.message : "Failed to stream job",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

