/**
 * Batch Summarize API Route
 * Processes multiple pages in a single API call to reduce rate limit pressure
 * Uses Gemini's large context window (1M tokens) to handle multiple pages
 */

import { NextRequest } from "next/server";
import { selectModel } from "@/lib/smart-router";
import { streamFromProvider, checkApiKeys } from "@/lib/ai-providers";
import { cache, generateCacheKey, hashString } from "@/lib/cache";
import { rateLimiter, getClientIdentifier } from "@/lib/rate-limit";
import { enqueueJob, isQueueAvailable } from "@/backend/queue/queue";
import { SummarizeBatchJobData } from "@/backend/queue/jobs";
import { trackApiCall } from "@/lib/analytics";

import { triggerWorker } from "@/lib/trigger-worker";

export const runtime = "nodejs";

interface BatchPage {
  pageNumber: number;
  pageText: string;
}

export async function POST(req: NextRequest) {
  try {
    const { pages }: { pages: BatchPage[] } = await req.json();
    const userIp = req.ip || "anonymous";

    if (!pages || !Array.isArray(pages) || pages.length === 0) {
      return new Response(
        JSON.stringify({ error: "Pages array is required" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Limit batch size to 5 pages (configurable)
    const maxBatchSize = 5;
    const batchPages = pages.slice(0, maxBatchSize);

    // Apply rate limiting (batch counts as 1 request)
    const clientId = getClientIdentifier(req);
    const rateLimitResult = rateLimiter.check(clientId);
    if (!rateLimitResult.allowed) {
      console.warn(
        `[API Summarize Batch] Rate limit exceeded for client: ${clientId}`
      );
      return new Response(
        JSON.stringify({
          error: "Rate limit exceeded. Please try again later.",
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": Math.ceil(
              (rateLimitResult.resetAt - Date.now()) / 1000
            ).toString(),
            "X-RateLimit-Remaining": rateLimitResult.remaining.toString(),
            "X-RateLimit-Limit": "100",
          },
        }
      );
    }

    // Check cache for all pages in batch
    const pageNumbers = batchPages.map((p) => p.pageNumber).join(",");
    const pageTextHashes = batchPages
      .map((p) => hashString(p.pageText.trim()))
      .join("-");
    const cacheKey = generateCacheKey("summarize-batch", {
      pages: pageNumbers,
      hashes: pageTextHashes,
    });

    const cachedResponse = cache.get<string>(cacheKey);
    if (cachedResponse) {
      console.log(`[API Summarize Batch] Cache HIT for pages ${pageNumbers}`);
      // Return cached response as SSE stream
      const encoder = new TextEncoder();
      const readableStream = new ReadableStream({
        start(controller) {
          // Split cached response into chunks to simulate streaming
          const chunks = cachedResponse.match(/.{1,50}/g) || [cachedResponse];
          chunks.forEach((chunk, index) => {
            const data = JSON.stringify({
              id: `chatcmpl-cached-${Date.now()}`,
              object: "chat.completion.chunk",
              created: Math.floor(Date.now() / 1000),
              model: "cached",
              choices: [
                {
                  index: 0,
                  delta: { content: chunk },
                  finish_reason: index === chunks.length - 1 ? "stop" : null,
                },
              ],
            });
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          });
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        },
      });

      return new Response(readableStream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "public, max-age=86400", // 24 hours
          "X-Cache": "HIT",
          "X-RateLimit-Remaining": rateLimitResult.remaining.toString(),
          "X-Provider": "cached",
          "X-Model": "cached",
        },
      });
    }

    // Track API call (cached)
    trackApiCall("summarize-batch", "cached", 0, clientId, true).catch(() => {
      // Silently fail
    });

    // If queue is available, enqueue the job instead of processing directly
    if (isQueueAvailable()) {
      const jobId = `summarize-batch-${Date.now()}-${Math.random()
        .toString(36)
        .substr(2, 9)}`;
      const jobData: SummarizeBatchJobData = {
        type: "summarize-batch",
        jobId,
        clientId,
        timestamp: Date.now(),
        pages: batchPages,
      };

      await enqueueJob("summarize-batch", jobData);

      // 🚀 Trigger worker immediately (fire and forget)
      triggerWorker();

      // Return job ID and status endpoint
      return new Response(
        JSON.stringify({
          jobId,
          status: "queued",
          statusUrl: `/api/queue/status/${jobId}`,
          streamUrl: `/api/queue/stream/${jobId}`,
        }),
        {
          status: 202, // Accepted
          headers: {
            "Content-Type": "application/json",
            "X-RateLimit-Remaining": rateLimitResult.remaining.toString(),
          },
        }
      );
    }

    // Fallback to direct processing if queue not available
    // Always use Gemini for batch processing (1M token window)
    let modelSelection: {
      provider:
        | "gemini"
        | "groq"
        | "openrouter"
        | "siliconflow"
        | "huggingface"
        | "github";
      modelId: string;
      reason: string;
      baseUrl?: string;
    } = {
      provider: "gemini",
      modelId: "gemini-2.5-flash",
      reason:
        "Batch processing - Gemini has 1M token window for multiple pages",
    };

    // Check if Gemini is available, fallback to other providers
    let keyCheck = checkApiKeys("gemini");
    if (!keyCheck.available) {
      console.warn(
        `[API Summarize Batch] Gemini not available, trying fallbacks...`
      );
      const fallbackProviders: Array<
        "groq" | "openrouter" | "gemini" | "siliconflow" | "huggingface"
      > = ["siliconflow", "groq", "openrouter", "huggingface"];

      let foundProvider = false;
      for (const provider of fallbackProviders) {
        const providerCheck = checkApiKeys(provider);
        if (providerCheck.available) {
          modelSelection = {
            provider,
            modelId:
              provider === "groq"
                ? "llama-3.1-8b-instant"
                : provider === "openrouter"
                ? process.env.OPENROUTER_MODEL || "x-ai/grok-4.1-fast:free"
                : provider === "siliconflow"
                ? "tencent/Hunyuan-MT-7B"
                : "meta-llama/Llama-3.1-8B-Instruct",
            baseUrl:
              provider === "groq"
                ? "https://api.groq.com/openai/v1"
                : provider === "openrouter"
                ? "https://openrouter.ai/api/v1"
                : provider === "siliconflow"
                ? "https://api.siliconflow.com/v1"
                : "https://router.huggingface.co/v1",
            reason: `Batch processing - Using ${provider} as fallback`,
          };
          keyCheck = providerCheck;
          foundProvider = true;
          console.log(
            `[API Summarize Batch] Using ${modelSelection.provider} as fallback`
          );
          break;
        }
      }

      if (!foundProvider) {
        return new Response(
          JSON.stringify({
            error: `No API keys configured for batch processing. Please configure at least one provider.`,
          }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // Build prompt for batch summary
    const pagesText = batchPages
      .map((page, index) => `--- Page ${page.pageNumber} ---\n${page.pageText}`)
      .join("\n\n");

    const prompt = `Provide concise 2-3 sentence summaries for each of the following ${batchPages.length} pages. Format your response as a JSON object with page numbers as keys and summaries as values.

Example format:
{
  "1": "Summary for page 1...",
  "2": "Summary for page 2...",
  "3": "Summary for page 3..."
}

Pages to summarize:
${pagesText}`;

    console.log(
      `[API Summarize Batch] Making API call to ${modelSelection.provider} (${modelSelection.modelId}) for ${batchPages.length} pages...`
    );

    // Stream from selected provider
    const stream = await streamFromProvider({
      model: modelSelection,
      prompt,
      systemPrompt:
        "Study assistant. Provide concise page summaries in JSON format. Focus on key concepts. Be clear and direct. Max 3 sentences per page.",
      maxTokens: 150 * batchPages.length, // Scale tokens with page count
    });

    console.log(
      `[API Summarize Batch] ✅ Stream received from ${modelSelection.provider}`
    );

    // Convert stream to Response
    const response = new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Cache": "MISS",
        "X-RateLimit-Remaining": rateLimitResult.remaining.toString(),
        "X-Provider": modelSelection.provider,
        "X-Model": modelSelection.modelId,
      },
    });

    // Track API call (estimate tokens - batch uses ~150 tokens per page)
    const estimatedTokens = batchPages.length * 150;
    trackApiCall(
      "summarize-batch",
      modelSelection.provider,
      estimatedTokens,
      clientId,
      false
    ).catch(() => {
      // Silently fail
    });

    // Cache the full streamed response
    const clonedResponse = response.clone();
    const reader = clonedResponse.body?.getReader();
    let fullResponseText = "";
    if (reader) {
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullResponseText += decoder.decode(value, { stream: true });
      }
      cache.set(cacheKey, fullResponseText, 86400 * 1000); // Cache for 24 hours
    }

    return response;
  } catch (error) {
    console.error("[API Summarize Batch] Error:", error);
    return new Response(
      JSON.stringify({
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate batch summaries",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
