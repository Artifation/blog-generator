import { describe, expect, it, vi } from "vitest";

const create = vi.hoisted(() => vi.fn());

vi.mock("groq-sdk", () => ({
  default: class Groq {
    chat = { completions: { create } };
  },
}));

import { createGroqProvider } from "@/llm/groq";

const req = { systemPrompt: "s", userPrompt: "u", model: "llama-3.3-70b-versatile", maxTokens: 200 };

describe("groq provider", () => {
  it("returns text + token counts", async () => {
    create.mockResolvedValueOnce({
      choices: [{ message: { content: "groq-out" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 4, completion_tokens: 6 },
      model: "llama-3.3-70b-versatile",
    });
    const p = createGroqProvider("test-key");
    const r = await p.call(req);
    expect(r.text).toBe("groq-out");
    expect(r.inputTokens).toBe(4);
    expect(r.provider).toBe("groq");
  });

  it("throws a descriptive error naming finish_reason when the completion is empty", async () => {
    create.mockResolvedValueOnce({
      choices: [{ message: { content: "" }, finish_reason: "content_filter" }],
      usage: { prompt_tokens: 4, completion_tokens: 0 },
      model: "llama-3.3-70b-versatile",
    });
    const p = createGroqProvider("test-key");
    await expect(p.call(req)).rejects.toThrow(/content_filter/);
  });

  it("does NOT throw the empty error for a length truncation (flagged instead)", async () => {
    create.mockResolvedValueOnce({
      choices: [{ message: { content: "" }, finish_reason: "length" }],
      usage: { prompt_tokens: 4, completion_tokens: 200 },
      model: "llama-3.3-70b-versatile",
    });
    const p = createGroqProvider("test-key");
    const r = await p.call(req);
    expect(r.truncated).toBe(true);
  });
});
