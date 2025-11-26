/**
 * Batch Summarize API Route
 * Processes multiple pages in a single API call to reduce rate limit pressure
 * Uses Gemini's large context window (1M tokens) to handle multiple pages
 */

import { NextRequest } from "next/server";
import { selectModel } from "@/lib/smart-router";
import { streamFromProvider, checkApiKeys } from "@/lib/ai-providers";
import { cache, generateCacheKey, hashString } from "@/lib/api-cache";
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
    const { pages, forceRefresh }: { pages: BatchPage[]; forceRefresh?: boolean } =
      await req.json();
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
    const cacheKey = generateCacheKey("summarize-batch-v2", {
      pages: pageNumbers,
      hashes: pageTextHashes,
    });

    const cachedResponse = !forceRefresh
      ? (cache.get(cacheKey) as string | undefined)
      : undefined;
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
      modelId: "gemini-2.0-flash-lite",
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

    const prompt = `Analyze the following ${batchPages.length} pages. For each page:
1. Generate a concise 2-3 sentence summary.
2. Extract 3-5 Key Points (core facts/concepts).
3. Generate Flashcards (Cloze Deletion format) based PRIMARILY on the Key Points:
   - MANDATORY: Create at least 1-2 "General/Conceptual" cards (broad themes).
   - OPTIONAL: Create additional "Detailed" cards for specific facts/terms if the text is dense.
   - Total cards per page should be between 2 and 7, depending on information density.

Format your response as a JSON object with page numbers as keys. Each value should be an object with "summary" (string), "keyPoints" (array of strings), and "flashcards" (array of strings) fields.

Example format:
{
  "1": {
    "summary": "Page 1 covers the structure of the cell...",
    "keyPoints": ["Mitochondria produce energy", "Nucleus contains DNA", "Ribosomes make proteins"],
    "flashcards": ["The {{c1::mitochondria}} is the powerhouse of the cell."]
  },
  "2": {
    "summary": "Page 2 discusses DNA replication...",
    "keyPoints": ["Occurs in S phase", "Semi-conservative", "Involves DNA polymerase"],
    "flashcards": ["DNA replication occurs during the {{c1::S phase}} of the cell cycle."]
  }
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
        "You are a strict JSON API. Return ONLY the raw JSON object. Do not use markdown formatting (no ```json). Do not include any conversational text, introductions, or explanations.",
      maxTokens: 400 * batchPages.length, // Increased tokens for key points
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

    // Track API call (estimate tokens - batch uses ~400 tokens per page now)
    const estimatedTokens = batchPages.length * 400;
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
      cache.set(cacheKey, fullResponseText, { ttl: 86400 * 1000 }); // Cache for 24 hours
      console.log("[API Summarize Batch] Raw LLM Response:", fullResponseText);
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
