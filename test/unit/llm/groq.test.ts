import { describe, expect, it, vi } from "vitest";

vi.mock("groq-sdk", () => ({
  default: class Groq {
    chat = {
      completions: {
        create: vi.fn(async () => ({
          choices: [{ message: { content: "groq-out" } }],
          usage: { prompt_tokens: 4, completion_tokens: 6 },
          model: "llama-3.3-70b-versatile",
        })),
      },
    };
  },
}));

import { createGroqProvider } from "@/llm/groq";

describe("groq provider", () => {
  it("returns text + token counts", async () => {
    const p = createGroqProvider("test-key");
    const r = await p.call({
      systemPrompt: "s",
      userPrompt: "u",
      model: "llama-3.3-70b-versatile",
      maxTokens: 200,
    });
    expect(r.text).toBe("groq-out");
    expect(r.inputTokens).toBe(4);
    expect(r.provider).toBe("groq");
  });
});
