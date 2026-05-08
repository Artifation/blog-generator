import { describe, expect, it, vi } from "vitest";

vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class Anthropic {
      messages = {
        create: vi.fn(async (_req: unknown) => ({
          content: [{ type: "text", text: "hello" }],
          usage: { input_tokens: 10, output_tokens: 5 },
          model: "claude-sonnet-4-6",
        })),
      };
    },
  };
});

import { createAnthropicProvider } from "@/llm/anthropic";

describe("anthropic provider", () => {
  it("returns text + token counts", async () => {
    const p = createAnthropicProvider("test-key");
    const r = await p.call({
      systemPrompt: "be helpful",
      userPrompt: "hi",
      model: "claude-sonnet-4-6",
      maxTokens: 100,
    });
    expect(r.text).toBe("hello");
    expect(r.inputTokens).toBe(10);
    expect(r.outputTokens).toBe(5);
    expect(r.provider).toBe("anthropic");
  });
});
