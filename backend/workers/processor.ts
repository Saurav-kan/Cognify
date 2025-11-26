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
              ? "gemini-2.0-flash-lite"
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
      "You are a study assistant. Return a JSON object with 'definition' (string) and'synonyms' (array of strings)";
    prompt = `Context: "${context}"\n\nTarget word: ${term}\n\nBased on the context, provide a definition and 3 synonyms. Return ONLY JSON.`;

    console.log(`[Worker] Context being sent to prompt:`);
    console.log(`[Worker] ========================================`);
    console.log(`[Worker] ${context}`);
    console.log(`[Worker] ========================================`);
    console.log(`[Worker] Full prompt being sent:`);
    console.log(`[Worker] ${prompt}`);
  } else {
    systemPrompt =
      "Study assistant. Return a JSON object with 'definition' (string) and 'synonyms' (array of strings).";
    prompt = `Target word: ${term}\n\nExplain this term. Provide a simple definition and 3 synonyms in English. Return ONLY JSON.`;
    console.log(`[Worker] No context provided - using general explanation`);
    console.log(`[Worker] Prompt: ${prompt}`);
  }

  console.log(`[Worker] Stream start for Explain: ${term}`);

  // Process request
  const stream = await streamFromProvider({
    model: modelSelection,
    prompt,
    systemPrompt,
    maxTokens: 300, // Increased for JSON
  });

  // Use Universal Reader
  const fullResponse = await readStream(stream);

  console.log(`[Worker] Stream finished. Length: ${fullResponse.length}`);

  // Parse JSON
  let parsedData = {
    definition: fullResponse,
    synonyms: [],
  };

  try {
    let jsonText = fullResponse.trim();
    if (jsonText.startsWith("```json")) {
      jsonText = jsonText.replace(/^```json\n?/, "").replace(/\n?```$/, "");
    } else if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```\n?/, "").replace(/\n?```$/, "");
    }
    
    // If it still doesn't start with {, try to find the first { and last }
    if (!jsonText.startsWith("{")) {
      const match = jsonText.match(/\{[\s\S]*\}/);
      if (match) {
        jsonText = match[0];
      }
    }
    
    const parsed = JSON.parse(jsonText);
    if (parsed.definition) {
      parsedData = parsed;
    }
  } catch (e) {
    console.warn("[Worker] Failed to parse explain JSON, using raw text");
  }

  // Track API call
  trackApiCall(
    "explain",
    modelSelection.provider,
    150,
    jobData.clientId,
    false
  ).catch(() => {});

  return {
    success: true,
    data: parsedData, // Return structured data
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
        modelId: "gemini-2.0-flash-lite",
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
        modelId: "gemini-2.0-flash-lite",
        baseUrl: undefined,
        reason: "Best for batch summaries",
      };
    }
  }

  const pagesText = pages
    .map((p, idx) => `Page ${p.pageNumber}:\n${p.pageText}`)
    .join("\n\n---\n\n");

  const prompt = `Analyze the following ${pages.length} pages. For each page:
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

  const stream = await streamFromProvider({
    model: modelSelection,
    prompt,
    systemPrompt:
      "You are a strict JSON API. Return ONLY the raw JSON object. Do not use markdown formatting (no ```json). Do not include any conversational text, introductions, or explanations.",
    maxTokens: pages.length * 400,
  });

  // Use Universal Reader
  const fullResponse = await readStream(stream);

  // Parse JSON response
  let summaries: any = {};
  try {
    let jsonText = fullResponse.trim();
    if (jsonText.startsWith("```json")) {
      jsonText = jsonText.replace(/^```json\n?/, "").replace(/\n?```$/, "");
    } else if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```\n?/, "").replace(/\n?```$/, "");
    }

    // If it still doesn't start with {, try to find the first { and last }
    if (!jsonText.startsWith("{")) {
      const match = jsonText.match(/\{[\s\S]*\}/);
      if (match) {
        jsonText = match[0];
      }
    }
    summaries = JSON.parse(jsonText);
  } catch (e) {
    // If parsing fails, create a fallback structure
    summaries = pages.reduce((acc, p) => {
      acc[p.pageNumber.toString()] = {
        summary: fullResponse,
        keyPoints: [],
        flashcards: [],
      };
      return acc;
    }, {} as any);
  }

  const estimatedTokens = pages.length * 400;
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
