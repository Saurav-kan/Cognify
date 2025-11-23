import { NextRequest } from "next/server";
import { selectModel } from "@/lib/smart-router";
import { streamFromProvider, checkApiKeys } from "@/lib/ai-providers";
import { cache, generateCacheKey, hashString } from "@/lib/cache";
import { rateLimiter, getClientIdentifier } from "@/lib/rate-limit";
import { enqueueJob, isQueueAvailable } from "@/backend/queue/queue";
import { SummarizeJobData } from "@/backend/queue/jobs";
import { trackApiCall } from "@/lib/analytics";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  try {
    const { pageText, pageNumber } = await req.json();

    if (!pageText || typeof pageText !== "string") {
      return new Response(JSON.stringify({ error: "Page text is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Rate limiting (increased to 100/hour for better capacity)
    const clientId = getClientIdentifier(req);
    const rateLimitResult = rateLimiter.check(clientId);

    if (!rateLimitResult.allowed) {
      return new Response(
        JSON.stringify({
          error: "Rate limit exceeded. Please try again later.",
          retryAfter: Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000),
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "X-RateLimit-Limit": "100",
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": rateLimitResult.resetAt.toString(),
            "Retry-After": Math.ceil(
              (rateLimitResult.resetAt - Date.now()) / 1000
            ).toString(),
          },
        }
      );
    }

    // Check cache (hash page text for cache key)
    const pageTextHash = hashString(pageText.trim());
    const cacheKey = generateCacheKey("summarize", {
      pageText: pageTextHash,
      pageNumber: pageNumber || 0,
    });

    const cachedResponse = cache.get<string>(cacheKey);
    if (cachedResponse) {
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
          "Cache-Control": "public, max-age=86400", // 24 hours for summaries
          "X-Cache": "HIT",
          "X-RateLimit-Remaining": rateLimitResult.remaining.toString(),
          "X-Provider": "cached",
          "X-Model": "cached",
        },
      });
    }

    // Track API call (cached)
    trackApiCall("summarize", "cached", 0, clientId, true).catch(() => {
      // Silently fail
    });

    // If queue is available, enqueue the job instead of processing directly
    if (isQueueAvailable()) {
      const jobId = `summarize-${Date.now()}-${Math.random()
        .toString(36)
        .substr(2, 9)}`;
      const jobData: SummarizeJobData = {
        type: "summarize",
        jobId,
        clientId,
        timestamp: Date.now(),
        pageNumber: pageNumber || 0,
        pageText,
      };

      await enqueueJob("summarize", jobData);

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
    // Select optimal model for summaries - prefer Gemini > SiliconFlow > Groq
    // Gemini has 1M TPM (Tier 1) or high free tier limits, best for batch operations
    let modelSelection = selectModel({
      text: pageText,
      taskType: "simple", // Use "simple" as base, then override below
      wordCount: pageText.split(/\s+/).length,
    });

    // Override to prefer providers with higher TPM limits for summaries
    // Priority: Gemini (1M TPM) > SiliconFlow (500K TPM) > Groq (6K TPM)
    // NOTE: OpenRouter (50/day) is too limiting for summaries - only use as last resort fallback
    const geminiCheck = checkApiKeys("gemini");
    if (geminiCheck.available) {
      modelSelection = {
        provider: "gemini",
        modelId: "gemini-2.5-flash",
        reason:
          "Summary task - Gemini has 1M TPM capacity (highest limit) for batch operations",
      };
    } else {
      const siliconFlowCheck = checkApiKeys("siliconflow");
      if (siliconFlowCheck.available && modelSelection.provider === "groq") {
        modelSelection = {
          provider: "siliconflow",
          modelId: "tencent/Hunyuan-MT-7B",
          baseUrl: "https://api.siliconflow.com/v1",
          reason:
            "Summary task - SiliconFlow has 80K TPM and 1K RPM capacity for batch operations",
        };
      }
      // OpenRouter removed from primary selection - 50/day is too limiting
      // It will still be used as fallback if all other providers fail
      // Default model: x-ai/grok-4.1-fast:free (configured via OPENROUTER_MODEL env var)
    }

    console.log(
      `[API Summarize] Selected provider: ${modelSelection.provider}, model: ${modelSelection.modelId}`
    );
    console.log(`[API Summarize] Reason: ${modelSelection.reason}`);

    // Check if API key is available for selected provider
    let keyCheck = checkApiKeys(modelSelection.provider);

    // If primary provider key is missing, try fallback providers in order
    if (!keyCheck.available) {
      // OpenRouter moved to last position due to 50/day limit - only use as last resort
      const fallbackProviders: Array<
        | "groq"
        | "gemini"
        | "siliconflow"
        | "huggingface"
        | "openrouter"
        | "github"
      > = [
        "groq",
        "gemini",
        "siliconflow",
        "huggingface",
        "openrouter",
        "github",
      ];

      // Remove the already-tried provider from fallback list
      const availableFallbacks = fallbackProviders.filter(
        (p) => p !== modelSelection.provider
      );

      let foundProvider = false;
      for (const provider of availableFallbacks) {
        const providerCheck = checkApiKeys(provider);
        if (providerCheck.available) {
          // Use the first available provider
          modelSelection = {
            provider,
            modelId:
              provider === "groq"
                ? "llama-3.1-8b-instant"
                : provider === "openrouter"
                ? process.env.OPENROUTER_MODEL || "x-ai/grok-4.1-fast:free"
                : provider === "siliconflow"
                ? "tencent/Hunyuan-MT-7B"
                : provider === "gemini"
                ? "gemini-2.5-flash"
                : provider === "huggingface"
                ? "meta-llama/Llama-3.1-8B-Instruct"
                : "gpt-4o",
            baseUrl:
              provider === "groq"
                ? "https://api.groq.com/openai/v1"
                : provider === "openrouter"
                ? "https://openrouter.ai/api/v1"
                : provider === "siliconflow"
                ? "https://api.siliconflow.com/v1"
                : provider === "huggingface"
                ? "https://router.huggingface.co/v1"
                : provider === "github"
                ? "https://models.inference.ai.azure.com"
                : undefined,
            reason: `Primary provider unavailable, using ${provider} as fallback`,
          };
          keyCheck = providerCheck;
          foundProvider = true;
          console.log(
            `[API Summarize] Fallback to provider: ${provider}, model: ${modelSelection.modelId}`
          );
          break;
        }
      }

      // If no providers are configured, return error
      if (!foundProvider) {
        return new Response(
          JSON.stringify({
            error: `No API keys configured. Please configure at least one provider (GROQ_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, SILICONFLOW_API_KEY, HUGGINGFACE_API_KEY, OPENROUTER_API_KEY, or GITHUB_TOKEN) in your environment variables.`,
          }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // Build prompt for page summary
    const prompt = `Provide a concise 2-3 sentence summary of the key points on this page. Focus on main concepts and important details.\n\nPage content:\n${pageText}`;

    // Stream from selected provider
    console.log(
      `[API Summarize] Making API call to ${modelSelection.provider} (${modelSelection.modelId})...`
    );
    const stream = await streamFromProvider({
      model: modelSelection,
      prompt,
      systemPrompt:
        "Study assistant. Provide concise page summaries. Focus on key concepts. Be clear and direct. Max 3 sentences.",
      maxTokens: 150,
    });
    console.log(
      `[API Summarize] ✅ Stream received from ${modelSelection.provider}`
    );

    // Collect stream for caching
    let fullResponse = "";
    const reader = stream.getReader();
    const decoder = new TextDecoder();

    // Create a new stream that both caches and streams
    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            controller.enqueue(value);

            // Decode chunk for caching
            const chunkText = decoder.decode(value, { stream: true });
            const lines = chunkText.split("\n");
            for (const line of lines) {
              if (line.startsWith("data: ")) {
                const data = line.slice(6);
                if (data === "[DONE]") continue;
                try {
                  const parsed = JSON.parse(data);
                  if (parsed.choices?.[0]?.delta?.content) {
                    fullResponse += parsed.choices[0].delta.content;
                  }
                } catch (e) {
                  // Ignore parse errors
                }
              }
            }
          }

          // Cache the response
          if (fullResponse) {
            cache.set(cacheKey, fullResponse, 24 * 3600 * 1000); // 24 hours TTL for summaries
          }

          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });

    // Convert OpenAIStream to Response
    const response = new Response(readableStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "public, max-age=86400", // 24 hours
        "X-Cache": "MISS",
        "X-RateLimit-Remaining": rateLimitResult.remaining.toString(),
        "X-Provider": modelSelection.provider,
        "X-Model": modelSelection.modelId,
        Connection: "keep-alive",
      },
    });

    // Track API call (estimate tokens - summarize uses ~100 tokens)
    trackApiCall(
      "summarize",
      modelSelection.provider,
      100,
      clientId,
      false
    ).catch(() => {
      // Silently fail
    });

    return response;
  } catch (error) {
    console.error("Error in summarize API:", error);
    return new Response(
      JSON.stringify({
        error:
          error instanceof Error ? error.message : "Failed to generate summary",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
