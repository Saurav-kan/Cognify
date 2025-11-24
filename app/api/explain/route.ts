import { NextRequest } from "next/server";
import { selectModel } from "@/lib/smart-router";
import { streamFromProvider, checkApiKeys } from "@/lib/ai-providers";
import { cache, generateCacheKey, hashString } from "@/lib/cache";
import { rateLimiter, getClientIdentifier } from "@/lib/rate-limit";
import { enqueueJob, isQueueAvailable } from "@/backend/queue/queue";
import { ExplainJobData } from "@/backend/queue/jobs";
import { trackApiCall } from "@/lib/analytics";

import { triggerWorker } from "@/lib/trigger-worker";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { term, taskType, context } = await req.json();

    if (!term || typeof term !== "string") {
      return new Response(JSON.stringify({ error: "Term is required" }), {
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

    // Check cache (only for explanations without context, as context makes each request unique)
    const cacheKey = context
      ? generateCacheKey("explain", {
          term: hashString(term),
          context: hashString(context),
          taskType: taskType || "simple",
        })
      : generateCacheKey("explain", {
          term: hashString(term.toLowerCase().trim()),
          taskType: taskType || "simple",
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
          "Cache-Control": "public, max-age=3600",
          "X-Cache": "HIT",
          "X-RateLimit-Remaining": rateLimitResult.remaining.toString(),
          "X-Provider": "cached",
          "X-Model": "cached",
        },
      });
    }

    // Track API call (cached)
    trackApiCall("explain", "cached", 0, clientId, true).catch(() => {
      // Silently fail
    });

    // If queue is available, enqueue the job instead of processing directly
    if (isQueueAvailable()) {
      try {
        const jobId = `explain-${Date.now()}-${Math.random()
          .toString(36)
          .substr(2, 9)}`;
        const jobData: ExplainJobData = {
          type: "explain",
          jobId,
          clientId,
          timestamp: Date.now(),
          term,
          context,
          taskType: taskType || "simple",
        };

        await enqueueJob("explain", jobData);

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
      } catch (queueError) {
        console.error("[API Explain] Error enqueuing job:", queueError);
        // Fall through to direct processing if queue fails
        console.log("[API Explain] Falling back to direct processing");
      }
    }

    // Fallback to direct processing if queue not available
    // Select optimal model based on input
    let modelSelection = selectModel({
      text: term,
      taskType: taskType || "simple",
      wordCount: term.split(/\s+/).length,
    });

    console.log(
      `[API Explain] Selected provider: ${modelSelection.provider}, model: ${modelSelection.modelId}`
    );
    console.log(`[API Explain] Reason: ${modelSelection.reason}`);

    // Check if API key is available for selected provider
    let keyCheck = checkApiKeys(modelSelection.provider);

    // If primary provider key is missing, try fallback providers in order
    if (!keyCheck.available) {
      // SiliconFlow prioritized first (1K RPM), then Groq, then others. OpenRouter last due to 50/day limit
      const fallbackProviders: Array<
        | "groq"
        | "gemini"
        | "siliconflow"
        | "huggingface"
        | "openrouter"
        | "github"
      > = [
        "siliconflow",
        "groq",
        "gemini",
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
            `[API Explain] Fallback to provider: ${provider}, model: ${modelSelection.modelId}`
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

    // Build prompt with context if available
    let prompt: string;
    let systemPrompt: string;

    if (context && typeof context === "string" && context.trim().length > 0) {
      // Concise context-based explanation
      systemPrompt =
        "You are a study assistant. Based on the context provided, give the definition of the target word. Keep it short and focused on how the word is used in that specific context.";
      prompt = `Context: "${context}"\n\nTarget word: ${term}\n\nBased on the context of the sentence above, give the definition of the target word. Keep it short.`;

      console.log(`[API Explain] Context being sent to prompt:`);
      console.log(`[API Explain] ========================================`);
      console.log(`[API Explain] ${context}`);
      console.log(`[API Explain] ========================================`);
      console.log(`[API Explain] Full prompt being sent:`);
      console.log(`[API Explain] ${prompt}`);
    } else {
      systemPrompt =
        "Study assistant. Be concise. Use bullet points. Omit polite filler. Max 100 words.";
      prompt = `Target word: ${term}\n\nExplain this term in simple terms using an analogy.`;
      console.log(
        `[API Explain] No context provided - using general explanation`
      );
      console.log(`[API Explain] Prompt: ${prompt}`);
    }

    // Stream from selected provider
    console.log(
      `[API Explain] Making API call to ${modelSelection.provider} (${modelSelection.modelId})...`
    );
    const stream = await streamFromProvider({
      model: modelSelection,
      prompt,
      systemPrompt,
      maxTokens: 50,
    });
    console.log(
      `[API Explain] ✅ Stream received from ${modelSelection.provider}`
    );

    // Collect stream for caching (only cache if no context, as context makes responses unique)
    let fullResponse = "";
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    const chunks: Uint8Array[] = [];

    // Create a new stream that both caches and streams
    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            chunks.push(value);
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

          // Cache the response (only if no context, as context makes each request unique)
          if (fullResponse && !context) {
            cache.set(cacheKey, fullResponse, 3600 * 1000); // 1 hour TTL
          }

          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });

    // Convert OpenAIStream to Response
    return new Response(readableStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": context ? "no-cache" : "public, max-age=3600",
        "X-Cache": "MISS",
        "X-RateLimit-Remaining": rateLimitResult.remaining.toString(),
        "X-Provider": modelSelection.provider,
        "X-Model": modelSelection.modelId,
        Connection: "keep-alive",
      },
    });

    // Track API call (estimate tokens - explain uses ~50 tokens)
    trackApiCall("explain", modelSelection.provider, 50, clientId, false).catch(
      () => {
        // Silently fail
      }
    );
  } catch (error) {
    console.error("Error in explain API:", error);
    return new Response(
      JSON.stringify({
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate explanation",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
