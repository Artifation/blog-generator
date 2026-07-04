import { describe, it, expect } from "vitest";
import {
  parseUsdLimit,
  assertRunBudget,
  exceedsWeeklyBudget,
  CostBudgetExceededError,
  type UsageEntry,
} from "@/pipeline/costTracker";

// gemini-2.5-pro is $10/M output tokens → 1000 output tokens = $0.01.
const out = (outputTokens: number): UsageEntry => ({
  provider: "gemini",
  model: "gemini-2.5-pro",
  inputTokens: 0,
  outputTokens,
});

describe("parseUsdLimit", () => {
  it("treats unset / blank / invalid / non-positive as no cap (null)", () => {
    expect(parseUsdLimit(undefined)).toBe(null);
    expect(parseUsdLimit("")).toBe(null);
    expect(parseUsdLimit("   ")).toBe(null);
    expect(parseUsdLimit("abc")).toBe(null);
    expect(parseUsdLimit("0")).toBe(null);
    expect(parseUsdLimit("-3")).toBe(null);
  });

  it("parses a positive USD amount", () => {
    expect(parseUsdLimit("0.50")).toBe(0.5);
    expect(parseUsdLimit("2")).toBe(2);
  });
});

describe("assertRunBudget", () => {
  it("is a no-op when no limit is configured", () => {
    expect(() => assertRunBudget([out(10_000_000)], null)).not.toThrow();
  });

  it("does not throw while spend is under the ceiling", () => {
    // 2000 out → $0.02 < $0.05
    expect(() => assertRunBudget([out(2000)], 0.05)).not.toThrow();
  });

  it("throws CostBudgetExceededError once spend crosses the ceiling", () => {
    // 10000 out → $0.10 > $0.05
    let thrown: unknown;
    try {
      assertRunBudget([out(10_000)], 0.05);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(CostBudgetExceededError);
    const err = thrown as CostBudgetExceededError;
    expect(err.kind).toBe("run");
    expect(err.limitUsd).toBe(0.05);
    expect(err.spentUsd).toBeCloseTo(0.1, 5);
  });
});

describe("exceedsWeeklyBudget", () => {
  it("is false when no limit is configured", () => {
    expect(exceedsWeeklyBudget(999, null)).toBe(false);
  });

  it("is false under the cap and true at or over it", () => {
    expect(exceedsWeeklyBudget(0.4, 0.5)).toBe(false);
    expect(exceedsWeeklyBudget(0.5, 0.5)).toBe(true);
    expect(exceedsWeeklyBudget(0.6, 0.5)).toBe(true);
  });
});
