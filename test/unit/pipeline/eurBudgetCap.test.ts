import { describe, it, expect } from "vitest";
import {
  USD_PER_EUR,
  eurToUsd,
  usdToEur,
  effectiveUsdCap,
} from "@/pipeline/costTracker";

describe("eurToUsd / usdToEur", () => {
  it("converts with the fixed rate and round-trips", () => {
    expect(eurToUsd(10)).toBeCloseTo(10 * USD_PER_EUR, 10);
    expect(usdToEur(eurToUsd(10))).toBeCloseTo(10, 10);
  });
});

describe("effectiveUsdCap", () => {
  it("uses the per-site euro cap (converted to USD) when set", () => {
    expect(effectiveUsdCap(5, "40")).toBeCloseTo(5 * USD_PER_EUR, 10);
  });

  it("falls back to the env USD cap when per-site is null/undefined", () => {
    expect(effectiveUsdCap(null, "40")).toBe(40);
    expect(effectiveUsdCap(undefined, "40")).toBe(40);
  });

  it("treats a per-site value of 0 or negative as unset (falls back to env)", () => {
    expect(effectiveUsdCap(0, "40")).toBe(40);
    expect(effectiveUsdCap(-2, "40")).toBe(40);
  });

  it("returns null (no cap) when both per-site and env are empty", () => {
    expect(effectiveUsdCap(null, undefined)).toBe(null);
    expect(effectiveUsdCap(null, "")).toBe(null);
  });
});
