import { describe, expect, it, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock googleapis
// ---------------------------------------------------------------------------

const searchanalyticsQueryMock = vi.hoisted(() => vi.fn());
const sitesListMock = vi.hoisted(() => vi.fn());

vi.mock("googleapis", () => ({
  google: {
    auth: {
      JWT: class {
        constructor(_opts: unknown) {}
      },
    },
    searchconsole: vi.fn(() => ({
      searchanalytics: { query: searchanalyticsQueryMock },
      sites: { list: sitesListMock },
    })),
  },
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { querySearchConsole, listProperties } from "@/integrations/searchConsole";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FAKE_SA_JSON = JSON.stringify({
  client_email: "bot@project.iam.gserviceaccount.com",
  private_key: "-----BEGIN RSA PRIVATE KEY-----\nfake\n-----END RSA PRIVATE KEY-----\n",
});

const OPTS = { serviceAccountJson: FAKE_SA_JSON };

const BASE_INPUT = {
  propertyUrl: "sc-domain:artifation.nl",
  startDate: "2026-02-08",
  endDate: "2026-05-08",
  dimensions: ["query", "page"] as ("query" | "page")[],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("querySearchConsole", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("happy path: returns typed rows + computed totals", async () => {
    searchanalyticsQueryMock.mockResolvedValueOnce({
      data: {
        rows: [
          { keys: ["ai tools mkb", "https://artifation.nl/ai-tools/"], clicks: 50, impressions: 400, ctr: 0.125, position: 3.2 },
          { keys: ["ai tools mkb", "https://artifation.nl/ai-tools-2/"], clicks: 10, impressions: 200, ctr: 0.05, position: 7.1 },
        ],
      },
    });

    const result = await querySearchConsole(OPTS, BASE_INPUT);

    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      keys: ["ai tools mkb", "https://artifation.nl/ai-tools/"],
      clicks: 50,
      impressions: 400,
      ctr: 0.125,
      position: 3.2,
    });
    expect(result.rows[1]).toMatchObject({
      keys: ["ai tools mkb", "https://artifation.nl/ai-tools-2/"],
      clicks: 10,
      impressions: 200,
    });

    // Totals
    expect(result.totals.clicks).toBe(60);
    expect(result.totals.impressions).toBe(600);
    expect(result.totals.ctr).toBeCloseTo(60 / 600);
    expect(result.totals.position).toBeCloseTo((3.2 + 7.1) / 2);
  });

  it("empty result: returns zero-totals when API returns no rows", async () => {
    searchanalyticsQueryMock.mockResolvedValueOnce({ data: {} });

    const result = await querySearchConsole(OPTS, BASE_INPUT);

    expect(result.rows).toHaveLength(0);
    expect(result.totals).toEqual({ clicks: 0, impressions: 0, ctr: 0, position: 0 });
  });

  it("API error: propagates exception", async () => {
    searchanalyticsQueryMock.mockRejectedValueOnce(new Error("403 Forbidden"));

    await expect(querySearchConsole(OPTS, BASE_INPUT)).rejects.toThrow("403 Forbidden");
  });
});

describe("listProperties", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns siteUrl list from API response", async () => {
    sitesListMock.mockResolvedValueOnce({
      data: {
        siteEntry: [
          { siteUrl: "sc-domain:artifation.nl" },
          { siteUrl: "https://artifation.nl/" },
        ],
      },
    });

    const props = await listProperties(OPTS);
    expect(props).toEqual(["sc-domain:artifation.nl", "https://artifation.nl/"]);
  });

  it("returns empty array when no sites registered", async () => {
    sitesListMock.mockResolvedValueOnce({ data: {} });

    const props = await listProperties(OPTS);
    expect(props).toEqual([]);
  });
});
