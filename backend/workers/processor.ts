/**
 * Job Processor - Handles processing of different job types
 * UPDATED: Includes robust stream parsing for both Vercel SDK (0:"text") and OpenAI (data: {...})
 */

import { streamFromProvider, checkApiKeys } from "@/lib/ai-providers";
import { selectModel } from "@/lib/smart-router";
import {
  JobData,
  ExplainJobData,
  SummarizeJobData,
  SummarizeBatchJobData,
  JobResult,
} from "../queue/jobs";
import { canProcessRequest } from "../queue/rate-limiter";
import { updateJobStatus } from "../queue/queue";
import { trackApiCall } from "@/lib/analytics";

// --- HELPER: Universal Stream Reader ---
async function readStream(stream: ReadableStream): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let fullResponse = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // 1. Handle Vercel AI SDK Format (0:"text")
      if (trimmed.startsWith("0:")) {
        try {
          // Remove "0:" prefix and decode the JSON string
          const content = trimmed.slice(2);
          // JSON.parse removes the surrounding quotes and unescapes chars
          const text = JSON.parse(content);
          fullResponse += text;
        } catch (e) {
          // If parse fails, ignore (incomplete chunk)
        }
      }
      // 2. Handle OpenAI SSE Format (data: {...})
      else if (trimmed.startsWith("data: ")) {
        const data = trimmed.slice(6);
        if (data === "[DONE]") continue;
        try {
          const parsed = JSON.parse(data);
          if (parsed.choices?.[0]?.delta?.content) {
            fullResponse += parsed.choices[0].delta.content;
          }
        } catch (e) {
          // Ignore
        }
      }
      // 3. Fallback: If it doesn't look like a stream protocol, treat as raw text
      // (Only do this if we haven't matched other formats to avoid garbage)
      else if (!trimmed.startsWith("d:") && !trimmed.startsWith("e:")) {
        // Only append if we aren't seeing protocol headers
        // This handles providers that might return raw text streams
        // fullResponse += trimmed + "\n"; // Risky, keeping commented unless needed
      }
    }
  }

  return fullResponse.trim();
}

/**
 * Process an explain job
 */
export async function processExplainJob(
  jobData: ExplainJobData
): Promise<JobResult> {
  const { term, context, taskType } = jobData;

  // Select optimal model
  let modelSelection = selectModel({
    text: term,
    taskType:
      (taskType === "summary"
        ? "simple"
        : (taskType as
            | "simple"
            | "complex_reasoning"
            | "long_context"
            | "vision"
            | undefined)) || "simple",
    wordCount: term.split(/\s+/).length,
  });

  // Check rate limits
  const rateCheck = await canProcessRequest(modelSelection.provider, 50);
  if (!rateCheck.allowed) {
    // Try fallback providers (SiliconFlow prioritized first for high RPM)
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

    for (const provider of fallbackProviders) {
      if (provider === modelSelection.provider) continue;

      const providerCheck = checkApiKeys(provider);
      if (!providerCheck.available) continue;

      const fallbackRateCheck = await canProcessRequest(provider, 50);
      if (fallbackRateCheck.allowed) {
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
          reason: `Rate limit on primary provider, using ${provider}`,
        };
        break;
      }
    }
  }

  // Build prompt
  let prompt: string;
  let systemPrompt: string;

  if (context && typeof context === "string" && context.trim().length > 0) {
    // Concise context-based explanation
    systemPrompt =
      "You are a study assistant. Based on the context provided, give the definition of the target word. Keep it short and focused on how the word is used in that specific context.";
    prompt = `Context: "${context}"\n\nTarget word: ${term}\n\nBased on the context of the sentence above, give the definition of the target word. Keep it short.`;

    console.log(`[Worker] Context being sent to prompt:`);
    console.log(`[Worker] ========================================`);
    console.log(`[Worker] ${context}`);
    console.log(`[Worker] ========================================`);
    console.log(`[Worker] Full prompt being sent:`);
    console.log(`[Worker] ${prompt}`);
  } else {
    systemPrompt =
      "Study assistant. Be concise. Use bullet points. Omit polite filler. Max 100 words.";
    prompt = `Target word: ${term}\n\nExplain this term in simple terms using an analogy.`;
    console.log(`[Worker] No context provided - using general explanation`);
    console.log(`[Worker] Prompt: ${prompt}`);
  }

  console.log(`[Worker] Stream start for Explain: ${term}`);

  // Process request
  const stream = await streamFromProvider({
    model: modelSelection,
    prompt,
    systemPrompt,
    maxTokens: 50,
  });

  // Use Universal Reader
  const fullResponse = await readStream(stream);

  console.log(`[Worker] Stream finished. Length: ${fullResponse.length}`);

  // Track API call
  trackApiCall(
    "explain",
    modelSelection.provider,
    50,
    jobData.clientId,
    false
  ).catch(() => {});

  return {
    success: true,
    data: fullResponse, // This will now contain the actual text
    provider: modelSelection.provider,
    model: modelSelection.modelId,
  };
}

/**
 * Process a summarize job
 */
export async function processSummarizeJob(
  jobData: SummarizeJobData
): Promise<JobResult> {
  const { pageNumber, pageText } = jobData;

  // Select model (prefer Gemini for summaries)
  let modelSelection = selectModel({
    text: pageText,
    taskType: "simple",
    wordCount: pageText.split(/\s+/).length,
  });

  const geminiCheck = checkApiKeys("gemini");
  if (geminiCheck.available) {
    const rateCheck = await canProcessRequest("gemini", 200);
    if (rateCheck.allowed) {
      modelSelection = {
        provider: "gemini",
        modelId: "gemini-2.5-flash",
        baseUrl: undefined,
        reason: "Best for summaries",
      };
    }
  }

  const prompt = `Provide a concise 2-3 sentence summary of the key points on this page. Focus on main concepts and important details.\n\nPage text:\n${pageText}`;

  const stream = await streamFromProvider({
    model: modelSelection,
    prompt,
    systemPrompt: "Summarize concisely. Focus on key concepts.",
    maxTokens: 100,
  });

  // Use Universal Reader
  const fullResponse = await readStream(stream);

  trackApiCall(
    "summarize",
    modelSelection.provider,
    100,
    jobData.clientId,
    false
  ).catch(() => {});

  return {
    success: true,
    data: { pageNumber, summary: fullResponse },
    provider: modelSelection.provider,
    model: modelSelection.modelId,
  };
}

/**
 * Process a summarize-batch job
 */
export async function processSummarizeBatchJob(
  jobData: SummarizeBatchJobData
): Promise<JobResult> {
  const { pages } = jobData;

  // Prefer Gemini for batch summaries
  let modelSelection = selectModel({
    text: pages.map((p) => p.pageText).join("\n"),
    taskType: "simple",
    wordCount: pages.reduce(
      (sum, p) => sum + p.pageText.split(/\s+/).length,
      0
    ),
  });

  const geminiCheck = checkApiKeys("gemini");
  if (geminiCheck.available) {
    const rateCheck = await canProcessRequest("gemini", pages.length * 200);
    if (rateCheck.allowed) {
      modelSelection = {
        provider: "gemini",
        modelId: "gemini-2.5-flash",
        baseUrl: undefined,
        reason: "Best for batch summaries",
      };
    }
  }

  const pagesText = pages
    .map((p, idx) => `Page ${p.pageNumber}:\n${p.pageText}`)
    .join("\n\n---\n\n");

  const prompt = `Provide concise 2-3 sentence summaries for each page. Return a JSON object mapping page numbers to summaries.\n\nFormat: {"1": "summary...", "2": "summary...", ...}\n\nPages:\n${pagesText}`;

  const stream = await streamFromProvider({
    model: modelSelection,
    prompt,
    systemPrompt: "Return only valid JSON. Summarize each page concisely.",
    maxTokens: pages.length * 150,
  });

  // Use Universal Reader
  const fullResponse = await readStream(stream);

  // Parse JSON response
  let summaries: Record<string, string> = {};
  try {
    let jsonText = fullResponse.trim();
    if (jsonText.startsWith("```json")) {
      jsonText = jsonText.replace(/^```json\n?/, "").replace(/\n?```$/, "");
    } else if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```\n?/, "").replace(/\n?```$/, "");
    }
    summaries = JSON.parse(jsonText);
  } catch (e) {
    // If parsing fails, create a fallback structure
    summaries = pages.reduce((acc, p) => {
      acc[p.pageNumber.toString()] = fullResponse;
      return acc;
    }, {} as Record<string, string>);
  }

  const estimatedTokens = pages.length * 150;
  trackApiCall(
    "summarize-batch",
    modelSelection.provider,
    estimatedTokens,
    jobData.clientId,
    false
  ).catch(() => {});

  return {
    success: true,
    data: summaries,
    provider: modelSelection.provider,
    model: modelSelection.modelId,
  };
}

/**
 * Process any job type
 */
export async function processJob(jobData: JobData): Promise<JobResult> {
  try {
    await updateJobStatus(jobData.jobId, {
      status: "processing",
      startedAt: Date.now(),
    });

    let result: JobResult;

    switch (jobData.type) {
      case "explain":
        result = await processExplainJob(jobData);
        break;
      case "summarize":
        result = await processSummarizeJob(jobData);
        break;
      case "summarize-batch":
        result = await processSummarizeBatchJob(jobData);
        break;
      default:
        throw new Error(`Unknown job type: ${(jobData as any).type}`);
    }

    await updateJobStatus(jobData.jobId, {
      status: "completed",
      completedAt: Date.now(),
      result,
    });

    return result;
  } catch (error: any) {
    // Extract detailed error message
    let errorMessage = "Unknown error";

    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (error?.message) {
      errorMessage = error.message;
    } else if (typeof error === "string") {
      errorMessage = error;
    }

    // Log detailed error for debugging
    console.error(`[Worker] Error processing job ${jobData.jobId}:`, error);
    console.error(`[Worker] Error type:`, typeof error);
    console.error(`[Worker] Error status:`, error?.status);
    console.error(`[Worker] Error response:`, error?.response);

    // If it's an OpenAI API error, try to extract more details
    if (error?.status === 401) {
      errorMessage = `Authentication failed (401). Please verify your API key is correct. Original error: ${errorMessage}`;
    } else if (error?.response?.data) {
      const responseData =
        typeof error.response.data === "string"
          ? error.response.data
          : JSON.stringify(error.response.data);
      errorMessage = `${errorMessage}. Response: ${responseData}`;
    }

    await updateJobStatus(jobData.jobId, {
      status: "failed",
      completedAt: Date.now(),
      error: errorMessage,
    });

    return {
      success: false,
      error: errorMessage,
    };
  }
}
