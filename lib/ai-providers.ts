/**
 * AI Provider Clients and Configuration
 * Multi-provider setup for free tier optimization
 */

import OpenAI from "openai";
import { streamText, OpenAIStream } from "ai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  ModelSelection,
  COMPRESSED_SYSTEM_PROMPT,
  getOptimizedHistory,
} from "./smart-router";

export interface StreamOptions {
  model: ModelSelection;
  prompt: string;
  systemPrompt?: string;
  history?: Array<{ role: string; content: string }>;
  maxTokens?: number;
}

/**
 * Streams text from the selected AI provider
 */
export async function streamFromProvider(options: StreamOptions) {
  const { model, prompt, systemPrompt, history, maxTokens } = options;

  console.log(
    `[AI Provider] Streaming from ${model.provider} using model ${model.modelId}`
  );
  console.log(
    `[AI Provider] Prompt length: ${prompt.length} chars, Max tokens: ${
      maxTokens || "default"
    }`
  );

  // Use compressed system prompt by default
  const finalSystemPrompt = systemPrompt || COMPRESSED_SYSTEM_PROMPT;

  // Optimize history based on provider
  const optimizedHistory = history
    ? getOptimizedHistory(history, model.provider)
    : undefined;

  try {
    switch (model.provider) {
      case "groq": {
        // Groq uses OpenAI-compatible API
        console.log(
          `[AI Provider] Initializing Groq client for ${model.modelId}`
        );
        const groqClient = new OpenAI({
          baseURL: model.baseUrl || "https://api.groq.com/openai/v1",
          apiKey: process.env.GROQ_API_KEY,
        });

        const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] =
          [];
        if (finalSystemPrompt) {
          messages.push({ role: "system", content: finalSystemPrompt });
        }
        if (optimizedHistory) {
          messages.push(
            ...(optimizedHistory as OpenAI.Chat.Completions.ChatCompletionMessageParam[])
          );
        }
        messages.push({ role: "user", content: prompt });

        console.log(
          `[AI Provider] Calling Groq API with ${messages.length} messages...`
        );
        const response = await groqClient.chat.completions.create({
          model: model.modelId,
          messages,
          max_tokens: maxTokens || 200,
          stream: true,
        });

        console.log(
          `[AI Provider] ✅ Groq API call successful, converting to stream...`
        );
        return OpenAIStream(response as any);
      }

      case "openrouter": {
        // OpenRouter uses OpenAI-compatible API
        console.log(
          `[AI Provider] Initializing OpenRouter client for ${model.modelId}`
        );
        const openRouterClient = new OpenAI({
          baseURL: model.baseUrl || "https://openrouter.ai/api/v1",
          apiKey: process.env.OPENROUTER_API_KEY,
          defaultHeaders: {
            "HTTP-Referer":
              process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
            "X-Title": "NeuroFocus Study Tool",
          },
        });

        const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] =
          [];
        if (finalSystemPrompt) {
          messages.push({ role: "system", content: finalSystemPrompt });
        }
        if (optimizedHistory) {
          messages.push(
            ...(optimizedHistory as OpenAI.Chat.Completions.ChatCompletionMessageParam[])
          );
        }
        messages.push({ role: "user", content: prompt });

        console.log(
          `[AI Provider] Calling OpenRouter API with ${messages.length} messages...`
        );
        const response = await openRouterClient.chat.completions.create({
          model: model.modelId,
          messages,
          max_tokens: maxTokens || 500,
          stream: true,
        });

        console.log(
          `[AI Provider] ✅ OpenRouter API call successful, converting to stream...`
        );
        return OpenAIStream(response as any);
      }

      case "siliconflow": {
        // SiliconFlow uses OpenAI-compatible API
        console.log(
          `[AI Provider] Initializing SiliconFlow client for ${model.modelId}`
        );

        const apiKey = process.env.SILICONFLOW_API_KEY?.trim();
        if (!apiKey) {
          throw new Error(
            "SILICONFLOW_API_KEY is not set in environment variables"
          );
        }

        // Validate API key format (should start with sk-)
        if (!apiKey.startsWith("sk-")) {
          console.warn(
            `[AI Provider] ⚠️ SiliconFlow API key doesn't start with 'sk-'. Key format: ${apiKey.substring(
              0,
              5
            )}...`
          );
        }

        console.log(
          `[AI Provider] SiliconFlow API key present: ${apiKey.substring(
            0,
            10
          )}... (length: ${apiKey.length})`
        );

        const baseURL = model.baseUrl || "https://api.siliconflow.com/v1";
        console.log(`[AI Provider] SiliconFlow baseURL: ${baseURL}`);

        const sfClient = new OpenAI({
          baseURL: baseURL,
          apiKey: apiKey,
        });

        const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] =
          [];
        if (finalSystemPrompt) {
          messages.push({ role: "system", content: finalSystemPrompt });
        }
        if (optimizedHistory) {
          messages.push(
            ...(optimizedHistory as OpenAI.Chat.Completions.ChatCompletionMessageParam[])
          );
        }
        messages.push({ role: "user", content: prompt });

        console.log(
          `[AI Provider] Calling SiliconFlow API with ${messages.length} messages...`
        );
        console.log(
          `[AI Provider] Request details: model=${model.modelId}, baseURL=${sfClient.baseURL}`
        );

        try {
          const response = await sfClient.chat.completions.create({
            model: model.modelId,
            messages,
            max_tokens: maxTokens || 500,
            stream: true,
          });

          console.log(
            `[AI Provider] ✅ SiliconFlow API call successful, converting to stream...`
          );
          return OpenAIStream(response as any);
        } catch (error: any) {
          console.error(`[AI Provider] ❌ SiliconFlow API error:`, error);
          console.error(`[AI Provider] Error status:`, error?.status);
          console.error(`[AI Provider] Error code:`, error?.code);
          console.error(`[AI Provider] Error type:`, error?.type);
          console.error(`[AI Provider] Error message:`, error?.message);
          console.error(`[AI Provider] Error response:`, error?.response);

          // Try to extract response body
          let responseBody = null;
          if (error?.response) {
            try {
              if (typeof error.response.json === "function") {
                responseBody = await error.response.json();
              } else if (error.response.data) {
                responseBody =
                  typeof error.response.data === "string"
                    ? JSON.parse(error.response.data)
                    : error.response.data;
              }
              if (responseBody) {
                console.error(
                  `[AI Provider] Error response body:`,
                  JSON.stringify(responseBody, null, 2)
                );
              }
            } catch (e) {
              console.error(
                `[AI Provider] Could not parse error response body`
              );
            }
          }

          // Extract more detailed error message
          let errorMessage = "SiliconFlow API error";
          if (error?.status === 401) {
            const details = [];
            if (responseBody?.error?.message) {
              details.push(`Server message: ${responseBody.error.message}`);
            }
            if (responseBody?.error?.code) {
              details.push(`Error code: ${responseBody.error.code}`);
            }
            if (error?.message) {
              details.push(`Client error: ${error.message}`);
            }
            const detailStr =
              details.length > 0 ? ` ${details.join(". ")}.` : "";
            errorMessage = `SiliconFlow authentication failed (401).${detailStr} Please verify: 1) API key is correct, 2) API key has access to model 'tencent/Hunyuan-MT-7B', 3) Your IP is not restricted, 4) API key permissions are sufficient.`;
          } else if (error?.message) {
            errorMessage = `SiliconFlow API error: ${error.message}`;
          } else if (responseBody) {
            errorMessage = `SiliconFlow API error: ${JSON.stringify(
              responseBody
            )}`;
          }

          throw new Error(errorMessage);
        }
      }

      case "gemini": {
        // Gemini using Google Generative AI SDK
        console.log(
          `[AI Provider] Initializing Gemini client for ${
            model.modelId || "gemini-2.5-flash"
          }`
        );
        const genAI = new GoogleGenerativeAI(
          process.env.GOOGLE_GENERATIVE_AI_API_KEY || ""
        );
        const geminiModel = genAI.getGenerativeModel({
          model: model.modelId || "gemini-2.0-flash-lite",
        });

        // Build the prompt with system message and history
        let fullPrompt = finalSystemPrompt
          ? `${finalSystemPrompt}\n\n${prompt}`
          : prompt;

        // Add history if available
        if (optimizedHistory && optimizedHistory.length > 0) {
          const conversationHistory = optimizedHistory
            .map(
              (msg) =>
                `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`
            )
            .join("\n\n");
          fullPrompt = `${conversationHistory}\n\nUser: ${prompt}`;
        }

        // Generate content stream
        console.log(
          `[AI Provider] Calling Gemini API with prompt (${fullPrompt.length} chars)...`
        );
        const result = await geminiModel.generateContentStream(fullPrompt);
        const stream = result.stream;
        console.log(
          `[AI Provider] ✅ Gemini API call successful, converting to stream...`
        );

        // Convert Gemini stream to OpenAI-compatible format
        const encoder = new TextEncoder();
        const readableStream = new ReadableStream({
          async start(controller) {
            try {
              for await (const chunk of stream) {
                const text = chunk.text();
                if (text) {
                  // Format as OpenAI SSE format
                  const data = JSON.stringify({
                    id: `chatcmpl-${Date.now()}`,
                    object: "chat.completion.chunk",
                    created: Math.floor(Date.now() / 1000),
                    model: model.modelId,
                    choices: [
                      {
                        index: 0,
                        delta: { content: text },
                        finish_reason: null,
                      },
                    ],
                  });
                  controller.enqueue(encoder.encode(`data: ${data}\n\n`));
                }
              }
              // Send [DONE] marker
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              controller.close();
            } catch (error) {
              controller.error(error);
            }
          },
        });

        return readableStream;
      }

      case "github": {
        // GitHub Models use OpenAI-compatible API
        const githubClient = new OpenAI({
          baseURL: model.baseUrl || "https://models.inference.ai.azure.com",
          apiKey: process.env.GITHUB_TOKEN,
        });

        const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] =
          [];
        if (finalSystemPrompt) {
          messages.push({ role: "system", content: finalSystemPrompt });
        }
        if (optimizedHistory) {
          messages.push(
            ...(optimizedHistory as OpenAI.Chat.Completions.ChatCompletionMessageParam[])
          );
        }
        messages.push({ role: "user", content: prompt });

        const response = await githubClient.chat.completions.create({
          model: model.modelId,
          messages,
          max_tokens: maxTokens || 500,
          stream: true,
        });

        return OpenAIStream(response as any);
      }

      case "huggingface": {
        // HuggingFace Inference API uses OpenAI-compatible endpoint
        const hfClient = new OpenAI({
          baseURL: model.baseUrl || "https://router.huggingface.co/v1",
          apiKey: process.env.HUGGINGFACE_API_KEY,
        });

        const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] =
          [];
        if (finalSystemPrompt) {
          messages.push({ role: "system", content: finalSystemPrompt });
        }
        if (optimizedHistory) {
          messages.push(
            ...(optimizedHistory as OpenAI.Chat.Completions.ChatCompletionMessageParam[])
          );
        }
        messages.push({ role: "user", content: prompt });

        const response = await hfClient.chat.completions.create({
          model: model.modelId,
          messages,
          max_tokens: maxTokens || 500,
          stream: true,
        });

        return OpenAIStream(response as any);
      }

      default:
        throw new Error(`Unsupported provider: ${model.provider}`);
    }
  } catch (error) {
    // Try fallback providers if primary provider fails
    if (model.provider !== "siliconflow") {
      console.warn(
        `Provider ${model.provider} failed, trying fallback providers:`,
        error
      );

      // Try fallback providers in order of preference
      // OpenRouter moved to last position due to 50/day limit - only use as last resort
      const fallbackProviders: Array<
        "groq" | "gemini" | "siliconflow" | "huggingface" | "openrouter"
      > = ["groq", "gemini", "siliconflow", "huggingface", "openrouter"].filter(
        (p) => p !== model.provider
      ) as Array<
        "groq" | "gemini" | "siliconflow" | "huggingface" | "openrouter"
      >;

      for (const fallbackProvider of fallbackProviders) {
        const keyCheck = checkApiKeys(fallbackProvider);
        if (!keyCheck.available) continue;

        try {
          if (fallbackProvider === "groq") {
            const groqClient = new OpenAI({
              baseURL: "https://api.groq.com/openai/v1",
              apiKey: process.env.GROQ_API_KEY,
            });
            const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] =
              [];
            if (finalSystemPrompt) {
              messages.push({ role: "system", content: finalSystemPrompt });
            }
            if (optimizedHistory) {
              messages.push(
                ...(optimizedHistory as OpenAI.Chat.Completions.ChatCompletionMessageParam[])
              );
            }
            messages.push({ role: "user", content: prompt });
            const response = await groqClient.chat.completions.create({
              model: "llama-3.1-8b-instant",
              messages,
              max_tokens: maxTokens || 200,
              stream: true,
            });
            return OpenAIStream(response as any);
          }

          if (fallbackProvider === "siliconflow") {
            const sfClient = new OpenAI({
              baseURL: "https://api.siliconflow.com/v1",
              apiKey: process.env.SILICONFLOW_API_KEY,
            });
            const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] =
              [];
            if (finalSystemPrompt) {
              messages.push({ role: "system", content: finalSystemPrompt });
            }
            if (optimizedHistory) {
              messages.push(
                ...(optimizedHistory as OpenAI.Chat.Completions.ChatCompletionMessageParam[])
              );
            }
            messages.push({ role: "user", content: prompt });
            const response = await sfClient.chat.completions.create({
              model: "tencent/Hunyuan-MT-7B",
              messages,
              max_tokens: maxTokens || 500,
              stream: true,
            });
            return OpenAIStream(response as any);
          }

          if (fallbackProvider === "huggingface") {
            const hfClient = new OpenAI({
              baseURL: "https://router.huggingface.co/v1",
              apiKey: process.env.HUGGINGFACE_API_KEY,
            });
            const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] =
              [];
            if (finalSystemPrompt) {
              messages.push({ role: "system", content: finalSystemPrompt });
            }
            if (optimizedHistory) {
              messages.push(
                ...(optimizedHistory as OpenAI.Chat.Completions.ChatCompletionMessageParam[])
              );
            }
            messages.push({ role: "user", content: prompt });
            const response = await hfClient.chat.completions.create({
              model: "meta-llama/Llama-3.1-8B-Instruct",
              messages,
              max_tokens: maxTokens || 500,
              stream: true,
            });
            return OpenAIStream(response as any);
          }

          if (fallbackProvider === "gemini") {
            try {
              const genAI = new GoogleGenerativeAI(
                process.env.GOOGLE_GENERATIVE_AI_API_KEY || ""
              );
              const geminiModel = genAI.getGenerativeModel({
                model: "gemini-2.0-flash-lite",
              });

              let fullPrompt = finalSystemPrompt
                ? `${finalSystemPrompt}\n\n${prompt}`
                : prompt;

              if (optimizedHistory && optimizedHistory.length > 0) {
                const conversationHistory = optimizedHistory
                  .map(
                    (msg) =>
                      `${msg.role === "user" ? "User" : "Assistant"}: ${
                        msg.content
                      }`
                  )
                  .join("\n\n");
                fullPrompt = `${conversationHistory}\n\nUser: ${prompt}`;
              }

              const result = await geminiModel.generateContentStream(
                fullPrompt
              );
              const stream = result.stream;

              const encoder = new TextEncoder();
              const readableStream = new ReadableStream({
                async start(controller) {
                  try {
                    for await (const chunk of stream) {
                      const text = chunk.text();
                      if (text) {
                        const data = JSON.stringify({
                          id: `chatcmpl-${Date.now()}`,
                          object: "chat.completion.chunk",
                          created: Math.floor(Date.now() / 1000),
                          model: "gemini-2.5-flash",
                          choices: [
                            {
                              index: 0,
                              delta: { content: text },
                              finish_reason: null,
                            },
                          ],
                        });
                        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
                      }
                    }
                    controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                    controller.close();
                  } catch (error) {
                    controller.error(error);
                  }
                },
              });

              return readableStream;
            } catch (geminiError) {
              console.warn("Gemini fallback failed:", geminiError);
              continue;
            }
          }
        } catch (fallbackError) {
          console.warn(
            `Fallback provider ${fallbackProvider} also failed:`,
            fallbackError
          );
          continue; // Try next fallback
        }
      }
    }

    // If all providers failed, throw the original error
    throw error;
  }
}

/**
 * Checks if required API keys are available
 */
export function checkApiKeys(
  provider:
    | "groq"
    | "openrouter"
    | "gemini"
    | "siliconflow"
    | "huggingface"
    | "github"
): {
  available: boolean;
  missing: string[];
} {
  const required: Record<string, string> = {
    groq: "GROQ_API_KEY",
    openrouter: "OPENROUTER_API_KEY",
    gemini: "GOOGLE_GENERATIVE_AI_API_KEY",
    siliconflow: "SILICONFLOW_API_KEY",
    github: "GITHUB_TOKEN",
    huggingface: "HUGGINGFACE_API_KEY",
  };

  const key = required[provider];
  const available = !!process.env[key];

  return {
    available,
    missing: available ? [] : [key],
  };
}
