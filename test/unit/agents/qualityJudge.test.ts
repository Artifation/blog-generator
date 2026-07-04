import { describe, expect, it, vi } from "vitest";
import { runQualityJudge } from "@/agents/qualityJudge";
import type { LLMProvider } from "@/llm/types";
import { resolveAgentModel } from "@/llm/client";

const goOut = JSON.stringify({
  scores: {
    semantic_completeness: 8.5,
    originality: 8,
    anti_ai_cliche: 9,
    fact_check: 10,
    seo_meta: 8,
    seo_schema: 7,
    brand_voice: 9,
    readability: 8,
  },
  weighted_total: 8.6,
  hard_fails: [],
  verdict: "GO",
  reasoning: "alles goed",
  improvement_suggestions: [],
});

const noGoOut = JSON.stringify({
  scores: {
    semantic_completeness: 7,
    originality: 5,
    anti_ai_cliche: 7,
    fact_check: 10,
    seo_meta: 6,
    seo_schema: 5,
    brand_voice: 7,
    readability: 7,
  },
  weighted_total: 6.5,
  hard_fails: ["originality < 6"],
  verdict: "NO-GO",
  reasoning: "te generiek",
  improvement_suggestions: ["voeg eigen casus toe"],
});

describe("runQualityJudge", () => {
  it("returns GO verdict on high scores", async () => {
    const provider: LLMProvider = {
      name: "anthropic",
      call: vi.fn(async () => ({
        text: goOut,
        inputTokens: 1,
        outputTokens: 1,
        model: "x",
        provider: "anthropic" as const,
      })),
    };
    const r = await runQualityJudge(
      {
        edited_html: "x",
        target_keyword: "y",
        deterministic_signals: {} as any,
        fact_check_verdict: "pass",
        fabricated_claims_count: 0,
      },
      { provider, model: resolveAgentModel("qualityJudge"), sleepImpl: () => Promise.resolve() }
    );
    expect(r.parsed.verdict).toBe("GO");
  });

  it("returns NO-GO with hard fail", async () => {
    const provider: LLMProvider = {
      name: "anthropic",
      call: vi.fn(async () => ({
        text: noGoOut,
        inputTokens: 1,
        outputTokens: 1,
        model: "x",
        provider: "anthropic" as const,
      })),
    };
    const r = await runQualityJudge(
      {
        edited_html: "x",
        target_keyword: "y",
        deterministic_signals: {} as any,
        fact_check_verdict: "pass",
        fabricated_claims_count: 0,
      },
      { provider, model: resolveAgentModel("qualityJudge"), sleepImpl: () => Promise.resolve() }
    );
    expect(r.parsed.verdict).toBe("NO-GO");
    expect(r.parsed.hard_fails).toHaveLength(1);
  });
});
