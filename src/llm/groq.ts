import Groq from "groq-sdk";
import type { LLMProvider, LLMRequest, LLMResponse } from "./types.ts";

export function createGroqProvider(apiKey: string): LLMProvider {
  const client = new Groq({ apiKey });

  return {
    name: "groq",
    async call(req: LLMRequest): Promise<LLMResponse> {
      const res = await client.chat.completions.create({
        model: req.model,
        max_tokens: req.maxTokens,
        temperature: req.temperature ?? 1.0,
        messages: [
          { role: "system", content: req.systemPrompt },
          { role: "user", content: req.userPrompt },
        ],
      });

      return {
        text: res.choices[0]?.message.content ?? "",
        inputTokens: res.usage?.prompt_tokens ?? 0,
        outputTokens: res.usage?.completion_tokens ?? 0,
        model: res.model,
        provider: "groq",
      };
    },
  };
}
