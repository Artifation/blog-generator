import { describe, expect, it, vi } from "vitest";
import { runImagePrompter } from "@/agents/imagePrompter";
import type { LLMProvider } from "@/llm/types";
import { resolveAgentModel } from "@/llm/client";

describe("runImagePrompter", () => {
  it("returns prompt + negative + alt", async () => {
    const provider: LLMProvider = {
      name: "groq",
      call: vi.fn(async () => ({
        text: JSON.stringify({
          prompt: "editorial corporate blue gradient abstract data flow",
          negative_prompt: "people, faces, logos, text",
          alt_text_nl: "Abstracte visualisatie van AI in HR voor MKB",
        }),
        inputTokens: 1,
        outputTokens: 1,
        model: "x",
        provider: "groq" as const,
      })),
    };
    const r = await runImagePrompter(
      { title: "AI in HR", tldr: "summary", brand_style: "blue corporate" },
      { provider, model: resolveAgentModel("imagePrompter"), sleepImpl: () => Promise.resolve() }
    );
    expect(r.parsed.prompt.length).toBeGreaterThan(0);
    expect(r.parsed.alt_text_nl.length).toBeLessThanOrEqual(100);
  });
});
