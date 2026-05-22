import { describe, expect, it } from "vitest";
import { computeRefreshEffect } from "@/pipeline/refreshEffect";

const NOW = new Date("2026-05-22T12:00:00Z");
const TRIGGERED_45D_AGO = new Date(NOW.getTime() - 45 * 86_400_000).toISOString();
const TRIGGERED_10D_AGO = new Date(NOW.getTime() - 10 * 86_400_000).toISOString();

describe("computeRefreshEffect", () => {
  it("returns 'improved' when position drops and clicks rise meaningfully", () => {
    const r = computeRefreshEffect({
      before: { clicks_30d: 10, impressions_30d: 500, avg_position: 14 },
      current: { clicks_30d: 25, impressions_30d: 700, avg_position: 7 },
      triggeredAt: TRIGGERED_45D_AGO,
      now: NOW,
    });
    expect(r.verdict).toBe("improved");
    expect(r.positionDelta).toBe(-7);
    expect(r.clicksDelta).toBe(15);
  });

  it("returns 'regressed' when position rises and clicks fall", () => {
    const r = computeRefreshEffect({
      before: { clicks_30d: 50, impressions_30d: 1500, avg_position: 5 },
      current: { clicks_30d: 30, impressions_30d: 1200, avg_position: 9 },
      triggeredAt: TRIGGERED_45D_AGO,
      now: NOW,
    });
    expect(r.verdict).toBe("regressed");
  });

  it("returns 'neutral' when deltas are within noise tolerance", () => {
    const r = computeRefreshEffect({
      before: { clicks_30d: 10, impressions_30d: 500, avg_position: 8 },
      current: { clicks_30d: 11, impressions_30d: 505, avg_position: 8.2 },
      triggeredAt: TRIGGERED_45D_AGO,
      now: NOW,
    });
    expect(r.verdict).toBe("neutral");
  });

  it("returns 'too_early' when daysSinceRefresh < 30, regardless of deltas", () => {
    const r = computeRefreshEffect({
      before: { clicks_30d: 10, impressions_30d: 500, avg_position: 14 },
      current: { clicks_30d: 25, impressions_30d: 700, avg_position: 7 },
      triggeredAt: TRIGGERED_10D_AGO,
      now: NOW,
    });
    expect(r.verdict).toBe("too_early");
    // But deltas should still be reported (UI shows them in muted form)
    expect(r.positionDelta).toBe(-7);
  });

  it("returns 'no_data' when before-snapshot is missing", () => {
    const r = computeRefreshEffect({
      before: null,
      current: { clicks_30d: 25, impressions_30d: 700, avg_position: 7 },
      triggeredAt: TRIGGERED_45D_AGO,
      now: NOW,
    });
    expect(r.verdict).toBe("no_data");
    expect(r.positionDelta).toBeNull();
  });

  it("returns 'no_data' when current metrics are unavailable", () => {
    const r = computeRefreshEffect({
      before: { clicks_30d: 10, impressions_30d: 500, avg_position: 14 },
      current: null,
      triggeredAt: TRIGGERED_45D_AGO,
      now: NOW,
    });
    expect(r.verdict).toBe("no_data");
  });

  it("handles partial before-snapshot (e.g. only position known)", () => {
    const r = computeRefreshEffect({
      before: { avg_position: 14 },
      current: { clicks_30d: 25, impressions_30d: 700, avg_position: 7 },
      triggeredAt: TRIGGERED_45D_AGO,
      now: NOW,
    });
    expect(r.verdict).toBe("improved");
    expect(r.positionDelta).toBe(-7);
    expect(r.clicksDelta).toBeNull();
    expect(r.impressionsDelta).toBeNull();
  });
});
