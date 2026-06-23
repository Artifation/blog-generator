import { describe, expect, it } from "vitest";
import {
  JUDGE_WEIGHTS,
  JUDGE_GO_THRESHOLD,
  judgeWeightedTotal,
} from "@/agents/scoring";

describe("judge scoring (deterministic publish gate)", () => {
  it("judge weights sum to exactly 1.0", () => {
    const sum = Object.values(JUDGE_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(Math.abs(sum - 1)).toBeLessThan(1e-9);
  });

  it("all-10 scores produce a perfect 10", () => {
    const scores = Object.fromEntries(
      Object.keys(JUDGE_WEIGHTS).map((k) => [k, 10]),
    ) as Record<keyof typeof JUDGE_WEIGHTS, number>;
    expect(judgeWeightedTotal(scores)).toBe(10);
  });

  it("matches the prompt formula on a mixed example", () => {
    // 0.20*sem + 0.25*orig + 0.15*cliche + 0.15*fact + 0.05*seo_meta
    // + 0.05*seo_schema + 0.10*voice + 0.05*read
    const scores = {
      semantic_completeness: 8,
      originality: 7,
      anti_ai_cliche: 9,
      fact_check: 10,
      seo_meta: 6,
      seo_schema: 5,
      brand_voice: 8,
      readability: 7,
    };
    const expected =
      0.2 * 8 + 0.25 * 7 + 0.15 * 9 + 0.15 * 10 + 0.05 * 6 + 0.05 * 5 + 0.1 * 8 + 0.05 * 7;
    expect(judgeWeightedTotal(scores)).toBeCloseTo(Math.round(expected * 100) / 100, 5);
  });

  it("clamps out-of-range scores before weighting", () => {
    const scores = Object.fromEntries(
      Object.keys(JUDGE_WEIGHTS).map((k) => [k, 999]),
    ) as Record<keyof typeof JUDGE_WEIGHTS, number>;
    expect(judgeWeightedTotal(scores)).toBe(10); // clamped to 10 each
  });

  it("a borderline-low set lands below the GO threshold", () => {
    const scores = {
      semantic_completeness: 7,
      originality: 7,
      anti_ai_cliche: 7,
      fact_check: 10,
      seo_meta: 7,
      seo_schema: 7,
      brand_voice: 7,
      readability: 7,
    };
    expect(judgeWeightedTotal(scores)).toBeLessThan(JUDGE_GO_THRESHOLD);
  });
});
