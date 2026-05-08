import { describe, expect, it } from "vitest";
import { computeRunCost } from "@/pipeline/costTracker";

describe("computeRunCost", () => {
  it("computes cost from token counts per provider/model", () => {
    const cost = computeRunCost([
      { provider: "anthropic", model: "claude-sonnet-4-6", inputTokens: 2000, outputTokens: 3000 },
      { provider: "anthropic", model: "claude-haiku-4-5-20251001", inputTokens: 3000, outputTokens: 3000 },
      { provider: "anthropic", model: "claude-opus-4-7", inputTokens: 2000, outputTokens: 800 },
      { provider: "gemini", model: "gemini-2.5-pro", inputTokens: 8000, outputTokens: 1000 },
      { provider: "groq", model: "llama-3.3-70b-versatile", inputTokens: 500, outputTokens: 200 },
    ]);
    expect(cost.totalUsd).toBeGreaterThan(0);
    expect(cost.totalUsd).toBeLessThan(0.5);
    expect(cost.breakdown.length).toBe(5);
  });
});
