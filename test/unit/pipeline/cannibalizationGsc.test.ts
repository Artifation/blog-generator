import { describe, expect, it, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock querySearchConsole
// ---------------------------------------------------------------------------

const querySearchConsoleMock = vi.hoisted(() => vi.fn());

vi.mock("@/integrations/searchConsole", () => ({
  querySearchConsole: querySearchConsoleMock,
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { detectCannibalizationViaGsc } from "@/pipeline/cannibalizationGsc";
import type { GscQueryResult } from "@/integrations/searchConsole";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const OPTS = { serviceAccountJson: '{"client_email":"bot@x.iam.gserviceaccount.com","private_key":"fake"}' };

const BASE_INPUT = {
  gscOpts: OPTS,
  propertyUrl: "sc-domain:artifation.nl",
  targetKeyword: "ai tools mkb",
  now: new Date("2026-05-08T12:00:00Z"),
};

function makeResult(rows: GscQueryResult["rows"]): GscQueryResult {
  const totalClicks = rows.reduce((s, r) => s + r.clicks, 0);
  const totalImpressions = rows.reduce((s, r) => s + r.impressions, 0);
  return {
    rows,
    totals: {
      clicks: totalClicks,
      impressions: totalImpressions,
      ctr: totalImpressions > 0 ? totalClicks / totalImpressions : 0,
      position: rows.length > 0 ? rows.reduce((s, r) => s + r.position, 0) / rows.length : 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("detectCannibalizationViaGsc", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("2 pages with sufficient impressions → cannibalized", async () => {
    querySearchConsoleMock.mockResolvedValueOnce(
      makeResult([
        { keys: ["ai tools mkb", "https://artifation.nl/ai-tools/"], clicks: 50, impressions: 400, ctr: 0.125, position: 3.2 },
        { keys: ["ai tools mkb", "https://artifation.nl/ai-tools-v2/"], clicks: 10, impressions: 150, ctr: 0.067, position: 7.5 },
      ])
    );

    const result = await detectCannibalizationViaGsc(BASE_INPUT);

    expect(result.isCannibalized).toBe(true);
    expect(result.competingPages).toHaveLength(2);
    // Sorted by impressions desc
    expect(result.competingPages[0]!.page).toBe("https://artifation.nl/ai-tools/");
    expect(result.competingPages[1]!.page).toBe("https://artifation.nl/ai-tools-v2/");
    expect(result.reason).toMatch(/2 pages/);
    expect(result.reason).toMatch(/ai tools mkb/);
  });

  it("1 page → not cannibalized", async () => {
    querySearchConsoleMock.mockResolvedValueOnce(
      makeResult([
        { keys: ["ai tools mkb", "https://artifation.nl/ai-tools/"], clicks: 50, impressions: 400, ctr: 0.125, position: 3.2 },
      ])
    );

    const result = await detectCannibalizationViaGsc(BASE_INPUT);

    expect(result.isCannibalized).toBe(false);
    expect(result.competingPages).toHaveLength(1);
    expect(result.reason).toMatch(/Slechts 1 page/);
  });

  it("0 pages → not cannibalized", async () => {
    querySearchConsoleMock.mockResolvedValueOnce(makeResult([]));

    const result = await detectCannibalizationViaGsc(BASE_INPUT);

    expect(result.isCannibalized).toBe(false);
    expect(result.competingPages).toHaveLength(0);
    expect(result.reason).toMatch(/Geen pages/);
  });

  it("3 pages → cannibalized, sorted by impressions desc", async () => {
    querySearchConsoleMock.mockResolvedValueOnce(
      makeResult([
        { keys: ["ai tools mkb", "https://artifation.nl/ai-tools-v2/"], clicks: 5, impressions: 120, ctr: 0.042, position: 8.0 },
        { keys: ["ai tools mkb", "https://artifation.nl/ai-tools/"], clicks: 80, impressions: 600, ctr: 0.133, position: 2.5 },
        { keys: ["ai tools mkb", "https://artifation.nl/ai-tools-old/"], clicks: 2, impressions: 110, ctr: 0.018, position: 12.0 },
      ])
    );

    const result = await detectCannibalizationViaGsc(BASE_INPUT);

    expect(result.isCannibalized).toBe(true);
    expect(result.competingPages).toHaveLength(3);
    // Winner should be the one with most impressions
    expect(result.competingPages[0]!.page).toBe("https://artifation.nl/ai-tools/");
    expect(result.competingPages[0]!.impressions).toBe(600);
    expect(result.reason).toMatch(/3 pages/);
    expect(result.reason).toMatch(/https:\/\/artifation\.nl\/ai-tools\//);
  });

  it("pages below minImpressions threshold are excluded", async () => {
    querySearchConsoleMock.mockResolvedValueOnce(
      makeResult([
        { keys: ["ai tools mkb", "https://artifation.nl/ai-tools/"], clicks: 50, impressions: 400, ctr: 0.125, position: 3.2 },
        // This page has only 50 impressions (below default 100)
        { keys: ["ai tools mkb", "https://artifation.nl/ai-tools-minor/"], clicks: 1, impressions: 50, ctr: 0.02, position: 15.0 },
      ])
    );

    const result = await detectCannibalizationViaGsc(BASE_INPUT);

    // Only 1 page qualifies → not cannibalized
    expect(result.isCannibalized).toBe(false);
    expect(result.competingPages).toHaveLength(1);
  });

  it("API error → propagates exception", async () => {
    querySearchConsoleMock.mockRejectedValueOnce(new Error("GSC quota exceeded"));

    await expect(detectCannibalizationViaGsc(BASE_INPUT)).rejects.toThrow("GSC quota exceeded");
  });
});
