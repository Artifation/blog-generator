import { describe, expect, it, vi } from "vitest";

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = {
      generateContent: vi.fn(async () => ({
        text: "world",
        usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 3 },
      })),
    };
  },
}));

import { createGeminiProvider } from "@/llm/gemini";

describe("gemini provider", () => {
  it("returns text + token counts", async () => {
    const p = createGeminiProvider("test-key");
    const r = await p.call({
      systemPrompt: "s",
      userPrompt: "u",
      model: "gemini-2.5-pro",
      maxTokens: 1000,
    });
    expect(r.text).toBe("world");
    expect(r.inputTokens).toBe(7);
    expect(r.provider).toBe("gemini");
  });
});
