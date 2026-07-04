import { describe, expect, it, vi } from "vitest";

const generateContent = vi.hoisted(() => vi.fn());

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent };
  },
}));

import { createGeminiProvider } from "@/llm/gemini";

const req = { systemPrompt: "s", userPrompt: "u", model: "gemini-2.5-pro", maxTokens: 1000 };

describe("gemini provider", () => {
  it("returns text + token counts", async () => {
    generateContent.mockResolvedValueOnce({
      text: "world",
      usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 3 },
    });
    const p = createGeminiProvider("test-key");
    const r = await p.call(req);
    expect(r.text).toBe("world");
    expect(r.inputTokens).toBe(7);
    expect(r.provider).toBe("gemini");
  });

  it("throws a descriptive error naming finishReason when the response has no text", async () => {
    generateContent.mockResolvedValueOnce({
      text: "",
      candidates: [{ finishReason: "SAFETY" }],
      promptFeedback: { blockReason: "SAFETY" },
      usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 0 },
    });
    const p = createGeminiProvider("test-key");
    await expect(p.call(req)).rejects.toThrow(/SAFETY/);
  });

  it("does NOT throw the empty-text error for a MAX_TOKENS truncation (flagged instead)", async () => {
    generateContent.mockResolvedValueOnce({
      text: "",
      candidates: [{ finishReason: "MAX_TOKENS" }],
      usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 0 },
    });
    const p = createGeminiProvider("test-key");
    const r = await p.call(req);
    expect(r.truncated).toBe(true);
  });
});
