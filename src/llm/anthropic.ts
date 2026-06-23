import Anthropic from "@anthropic-ai/sdk";
import type { LLMProvider, LLMRequest, LLMResponse } from "./types.ts";
import { LLM_TIMEOUT_MS } from "./timeout.ts";

export function createAnthropicProvider(apiKey: string): LLMProvider {
  // Explicit per-request timeout + maxRetries: 0 so retries/backoff are governed
  // by runAgent, not silently doubled by the SDK.
  const client = new Anthropic({ apiKey, timeout: LLM_TIMEOUT_MS, maxRetries: 0 });

  return {
    name: "anthropic",
    async call(req: LLMRequest): Promise<LLMResponse> {
      const res = await client.messages.create({
        model: req.model,
        max_tokens: req.maxTokens,
        temperature: req.temperature ?? 1.0,
        system: req.systemPrompt,
        messages: [{ role: "user", content: req.userPrompt }],
      });

      const textBlock = res.content.find((c) => c.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        throw new Error("Anthropic response had no text block");
      }

      return {
        text: textBlock.text,
        inputTokens: res.usage.input_tokens,
        outputTokens: res.usage.output_tokens,
        model: res.model,
        provider: "anthropic",
      };
    },
  };
}
