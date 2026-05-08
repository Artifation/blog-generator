import { describe, expect, it, vi } from "vitest";
import { runWriter } from "@/agents/writer";
import type { LLMProvider } from "@/llm/types";

const draftPass = JSON.stringify({
  draft_html: "<div class='tldr'>...</div><h2>x</h2>" + "p ".repeat(2000),
  self_score: 8.5,
  self_critique: "ok",
});

const draftLow = JSON.stringify({
  draft_html: "<h2>weak</h2>" + "p ".repeat(2000),
  self_score: 5,
  self_critique: "te kort",
});

describe("runWriter", () => {
  it("returns first draft if self_score >= 7", async () => {
    const provider: LLMProvider = {
      name: "anthropic",
      call: vi.fn(async () => ({
        text: draftPass,
        inputTokens: 1,
        outputTokens: 1,
        model: "x",
        provider: "anthropic" as const,
      })),
    };
    const r = await runWriter(
      { outline: {} as any, brand_voice: "x", ban_list: [], contrarian_hint: "" },
      { provider, sleepImpl: () => Promise.resolve() }
    );
    expect(r.iterations).toBe(1);
    expect(provider.call).toHaveBeenCalledTimes(1);
  });

  it("re-iterates on self_score < 7 (max 2 extra)", async () => {
    const calls = [draftLow, draftLow, draftPass];
    let i = 0;
    const provider: LLMProvider = {
      name: "anthropic",
      call: vi.fn(async () => ({
        text: calls[i++]!,
        inputTokens: 1,
        outputTokens: 1,
        model: "x",
        provider: "anthropic" as const,
      })),
    };
    const r = await runWriter(
      { outline: {} as any, brand_voice: "x", ban_list: [], contrarian_hint: "" },
      { provider, sleepImpl: () => Promise.resolve() }
    );
    expect(r.iterations).toBe(3);
    expect(provider.call).toHaveBeenCalledTimes(3);
  });

  it("caps at 3 iterations even if score stays low", async () => {
    const provider: LLMProvider = {
      name: "anthropic",
      call: vi.fn(async () => ({
        text: draftLow,
        inputTokens: 1,
        outputTokens: 1,
        model: "x",
        provider: "anthropic" as const,
      })),
    };
    const r = await runWriter(
      { outline: {} as any, brand_voice: "x", ban_list: [], contrarian_hint: "" },
      { provider, sleepImpl: () => Promise.resolve() }
    );
    expect(r.iterations).toBe(3);
    expect(provider.call).toHaveBeenCalledTimes(3);
  });
});
