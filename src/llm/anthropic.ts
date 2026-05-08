import Anthropic from "@anthropic-ai/sdk";
import type { LLMProvider, LLMRequest, LLMResponse } from "./types.ts";

export function createAnthropicProvider(apiKey: string): LLMProvider {
  const client = new Anthropic({ apiKey });

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

      const textBlock = res.content.find(
        (c): c is { type: "text"; text: string; citations?: unknown } => c.type === "text"
      );
      if (!textBlock) {
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
