import { GoogleGenAI } from "@google/genai";
import type { LLMProvider, LLMRequest, LLMResponse } from "./types.ts";

export function createGeminiProvider(apiKey: string): LLMProvider {
  const client = new GoogleGenAI({ apiKey });

  return {
    name: "gemini",
    async call(req: LLMRequest): Promise<LLMResponse> {
      const res = await client.models.generateContent({
        model: req.model,
        contents: [
          { role: "user", parts: [{ text: `${req.systemPrompt}\n\n${req.userPrompt}` }] },
        ],
        config: {
          maxOutputTokens: req.maxTokens,
          temperature: req.temperature ?? 1.0,
        },
      });

      return {
        text: res.text ?? "",
        inputTokens: res.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: res.usageMetadata?.candidatesTokenCount ?? 0,
        model: req.model,
        provider: "gemini",
      };
    },
  };
}
