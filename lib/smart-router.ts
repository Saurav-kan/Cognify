/**
 * Smart Router for Multi-Provider Free Tier Mesh
 * Balances load across Groq, OpenRouter, Google Gemini, SiliconFlow, HuggingFace, and GitHub Models
 */

export interface RouterInput {
  text: string;
  hasImage?: boolean;
  historyLength?: number;
  taskType?: "simple" | "complex_reasoning" | "long_context" | "vision";
  wordCount?: number;
}

export interface ModelSelection {
  provider:
    | "groq"
    | "openrouter"
    | "gemini"
    | "siliconflow"
    | "huggingface"
    | "github";
  modelId: string;
  baseUrl?: string;
  reason: string;
}

/**
 * Selects the optimal model based on input characteristics
 */
export function selectModel(input: RouterInput): ModelSelection {
  const wordCount = input.wordCount || input.text.split(/\s+/).length;
  const hasImage = input.hasImage || false;
  const historyLength = input.historyLength || 0;
  const taskType = input.taskType || "simple";

  // Strategy 1: Vision or very long text -> Gemini (1M token window, handles images)
  if (hasImage || wordCount > 10000 || input.text.length > 50000) {
    return {
      provider: "gemini",
      modelId: "gemini-2.5-flash",
      reason:
        "Large context or image input - Gemini handles 1M tokens and vision",
    };
  }

  // Strategy 2: Complex reasoning -> HuggingFace (OpenRouter only as last resort due to 50/day limit)
  if (taskType === "complex_reasoning") {
    // Use HuggingFace for complex reasoning (better free tier than OpenRouter's 50/day)
    return {
      provider: "huggingface",
      modelId: "meta-llama/Llama-3.1-8B-Instruct",
      baseUrl: "https://router.huggingface.co/v1",
      reason:
        "Complex reasoning task - HuggingFace has generous free tier limits",
    };
  }

  // Note: OpenRouter model default is x-ai/grok-4.1-fast:free (configured via OPENROUTER_MODEL env var)

  // Strategy 3: Long conversation history -> SiliconFlow (high RPM, better than OpenRouter's 50/day)
  if (historyLength > 10) {
    return {
      provider: "siliconflow",
      modelId: "tencent/Hunyuan-MT-7B",
      baseUrl: "https://api.siliconflow.com/v1",
      reason: "Long conversation history - SiliconFlow has 1K RPM capacity",
    };
  }

  // Strategy 4: Default -> SiliconFlow (1K RPM vs Groq's 30 RPM, better for high volume)
  return {
    provider: "siliconflow",
    modelId: "tencent/Hunyuan-MT-7B",
    baseUrl: "https://api.siliconflow.com/v1",
    reason:
      "Short interaction - SiliconFlow provides 1K RPM (vs Groq's 30 RPM) for better throughput",
  };
}

/**
 * Compressed system prompt for token savings
 */
export const COMPRESSED_SYSTEM_PROMPT =
  "Study assistant. Be concise. Use bullet points. Omit polite filler. Max 100 words.";

/**
 * Manages context window by limiting history
 */
export function getOptimizedHistory(
  history: Array<{ role: string; content: string }>,
  provider:
    | "groq"
    | "openrouter"
    | "gemini"
    | "siliconflow"
    | "huggingface"
    | "github"
): Array<{ role: string; content: string }> {
  // Groq, SiliconFlow, HuggingFace: Only last 6 messages (rolling window)
  if (
    provider === "groq" ||
    provider === "siliconflow" ||
    provider === "huggingface"
  ) {
    return history.slice(-6);
  }

  // OpenRouter: Can handle longer history, use last 10 messages
  if (provider === "openrouter") {
    return history.slice(-10);
  }

  // Gemini: Can handle full history (1M token window)
  if (provider === "gemini") {
    return history;
  }

  // GitHub: Conservative - last 10 messages
  if (provider === "github") {
    return history.slice(-10);
  }

  return history;
}

/**
 * Determines if screenshot optimization should be used
 */
export function shouldUseScreenshotHack(wordCount: number): boolean {
  // If text > 1000 words, screenshot hack saves ~80% tokens
  return wordCount > 1000;
}
