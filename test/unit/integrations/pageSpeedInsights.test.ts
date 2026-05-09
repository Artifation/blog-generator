import { describe, expect, it } from "vitest";
import { fetchPsi, classifyCwv } from "@/integrations/pageSpeedInsights";
import type { PsiResult } from "@/integrations/pageSpeedInsights";

// ---------------------------------------------------------------------------
// Minimal PSI API response fixture
// ---------------------------------------------------------------------------

function makePsiResponse(overrides: {
  lcp?: number;
  inp?: number;
  cls?: number;
  score?: number;
}) {
  return {
    lighthouseResult: {
      categories: {
        performance: { score: (overrides.score ?? 78) / 100 },
      },
      audits: {
        "largest-contentful-paint": { numericValue: overrides.lcp ?? 2100 },
        "interaction-to-next-paint": { numericValue: overrides.inp ?? 150 },
        "cumulative-layout-shift": { numericValue: overrides.cls ?? 0.05 },
      },
    },
  };
}

function makeFetch(body: unknown, status = 200): typeof fetch {
  return async () =>
    ({
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(body),
      json: async () => body,
    }) as unknown as Response;
}

// ---------------------------------------------------------------------------
// fetchPsi tests
// ---------------------------------------------------------------------------

describe("fetchPsi", () => {
  it("parses LCP / INP / CLS and performance score from PSI response", async () => {
    const result = await fetchPsi({
      url: "https://artifation.nl/ai-in-hr-mkb/",
      fetchImpl: makeFetch(makePsiResponse({ lcp: 2100, inp: 150, cls: 0.05, score: 78 })),
    });

    expect(result.url).toBe("https://artifation.nl/ai-in-hr-mkb/");
    expect(result.lcp_ms).toBe(2100);
    expect(result.inp_ms).toBe(150);
    expect(result.cls).toBeCloseTo(0.05);
    expect(result.performance_score).toBe(78);
    expect(result.fetched_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("throws on non-ok HTTP response", async () => {
    await expect(
      fetchPsi({
        url: "https://artifation.nl/bad/",
        fetchImpl: makeFetch({ error: { message: "API key invalid" } }, 403),
      })
    ).rejects.toThrow("PSI API error 403");
  });

  it("defaults missing metrics to 0", async () => {
    const emptyResponse = { lighthouseResult: { categories: {}, audits: {} } };
    const result = await fetchPsi({
      url: "https://artifation.nl/empty/",
      fetchImpl: makeFetch(emptyResponse),
    });
    expect(result.lcp_ms).toBe(0);
    expect(result.inp_ms).toBe(0);
    expect(result.cls).toBe(0);
    expect(result.performance_score).toBe(0);
  });

  it("appends apiKey to the query string when provided", async () => {
    let capturedUrl = "";
    const fetchImpl: typeof fetch = async (input) => {
      capturedUrl = typeof input === "string" ? input : input.toString();
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify(makePsiResponse({})),
        json: async () => makePsiResponse({}),
      } as unknown as Response;
    };

    await fetchPsi({
      url: "https://artifation.nl/test/",
      apiKey: "my-test-key",
      fetchImpl,
    });

    expect(capturedUrl).toContain("key=my-test-key");
  });
});

// ---------------------------------------------------------------------------
// classifyCwv tests
// ---------------------------------------------------------------------------

describe("classifyCwv", () => {
  function makeResult(lcp_ms: number, inp_ms: number, cls: number): PsiResult {
    return { url: "https://x.test/", lcp_ms, inp_ms, cls, performance_score: 80, fetched_at: new Date().toISOString() };
  }

  it("classifies all-good metrics as good overall", () => {
    const c = classifyCwv(makeResult(1500, 100, 0.05));
    expect(c.lcp).toBe("good");
    expect(c.inp).toBe("good");
    expect(c.cls).toBe("good");
    expect(c.overall).toBe("good");
  });

  it("classifies LCP=3000 as needs_improvement", () => {
    const c = classifyCwv(makeResult(3000, 100, 0.05));
    expect(c.lcp).toBe("needs_improvement");
    expect(c.overall).toBe("needs_improvement");
  });

  it("classifies LCP≥4000 as poor and sets overall to poor", () => {
    const c = classifyCwv(makeResult(4500, 100, 0.05));
    expect(c.lcp).toBe("poor");
    expect(c.overall).toBe("poor");
  });

  it("classifies INP=350 as needs_improvement", () => {
    const c = classifyCwv(makeResult(1500, 350, 0.05));
    expect(c.inp).toBe("needs_improvement");
    expect(c.overall).toBe("needs_improvement");
  });

  it("classifies INP≥500 as poor", () => {
    const c = classifyCwv(makeResult(1500, 600, 0.05));
    expect(c.inp).toBe("poor");
    expect(c.overall).toBe("poor");
  });

  it("classifies CLS=0.15 as needs_improvement", () => {
    const c = classifyCwv(makeResult(1500, 100, 0.15));
    expect(c.cls).toBe("needs_improvement");
    expect(c.overall).toBe("needs_improvement");
  });

  it("classifies CLS≥0.25 as poor", () => {
    const c = classifyCwv(makeResult(1500, 100, 0.30));
    expect(c.cls).toBe("poor");
    expect(c.overall).toBe("poor");
  });

  it("overall is poor when any single metric is poor even if others are good", () => {
    const c = classifyCwv(makeResult(1500, 100, 0.30));
    expect(c.lcp).toBe("good");
    expect(c.inp).toBe("good");
    expect(c.cls).toBe("poor");
    expect(c.overall).toBe("poor");
  });

  // Boundary tests
  it("LCP exactly 2500 is needs_improvement (not good)", () => {
    const c = classifyCwv(makeResult(2500, 100, 0.05));
    expect(c.lcp).toBe("needs_improvement");
  });

  it("LCP exactly 4000 is poor (not needs_improvement)", () => {
    const c = classifyCwv(makeResult(4000, 100, 0.05));
    expect(c.lcp).toBe("poor");
  });
});
