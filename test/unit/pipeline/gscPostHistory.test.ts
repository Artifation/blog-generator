import { describe, expect, it, vi, beforeEach } from "vitest";
import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const querySearchConsoleMock = vi.hoisted(() => vi.fn());

vi.mock("@/integrations/searchConsole", () => ({
  querySearchConsole: querySearchConsoleMock,
}));

import {
  loadOrFetchPostHistory,
  computeHistorySummary,
} from "@/pipeline/gscPostHistory";

const NOW = new Date("2026-05-22T12:00:00Z");

beforeEach(() => {
  querySearchConsoleMock.mockReset();
});

function gscDailyRows(days: { date: string; position: number; clicks: number; impressions: number }[]) {
  return {
    rows: days.map((d) => ({
      keys: [d.date],
      clicks: d.clicks,
      impressions: d.impressions,
      ctr: d.impressions > 0 ? d.clicks / d.impressions : 0,
      position: d.position,
    })),
    totals: {
      clicks: days.reduce((s, d) => s + d.clicks, 0),
      impressions: days.reduce((s, d) => s + d.impressions, 0),
      ctr: 0,
      position: days.reduce((s, d) => s + d.position, 0) / Math.max(1, days.length),
    },
  };
}

function gscQueryRows(queries: { query: string; position: number; clicks: number; impressions: number }[]) {
  return {
    rows: queries.map((q) => ({
      keys: [q.query],
      clicks: q.clicks,
      impressions: q.impressions,
      ctr: q.impressions > 0 ? q.clicks / q.impressions : 0,
      position: q.position,
    })),
    totals: { clicks: 0, impressions: 0, ctr: 0, position: 0 },
  };
}

describe("loadOrFetchPostHistory", () => {
  it("fetches fresh data when no cache exists", async () => {
    const tmp = await mkdtemp(path.join(tmpdir(), "post-hist-"));
    querySearchConsoleMock
      .mockResolvedValueOnce(
        gscDailyRows([
          { date: "2026-05-20", position: 5, clicks: 3, impressions: 100 },
          { date: "2026-05-21", position: 4, clicks: 4, impressions: 110 },
        ])
      )
      .mockResolvedValueOnce(
        gscQueryRows([{ query: "ai voor mkb", position: 4.5, clicks: 5, impressions: 200 }])
      );

    const result = await loadOrFetchPostHistory({
      cacheDir: tmp,
      siteSlug: "demo",
      postId: "pub_x",
      url: "https://example.com/x",
      propertyUrl: "sc-domain:example.com",
      gsc: { serviceAccountJson: "{}" },
      now: NOW,
    });

    expect(result.days).toHaveLength(2);
    expect(result.topQueries[0]!.query).toBe("ai voor mkb");
    expect(querySearchConsoleMock).toHaveBeenCalledTimes(2);
  });

  it("uses cache when fresh (within ttl)", async () => {
    const tmp = await mkdtemp(path.join(tmpdir(), "post-hist-"));
    // Pre-populate cache
    const cached = {
      pulled_at_iso: new Date(NOW.getTime() - 60 * 60 * 1000).toISOString(), // 1h ago
      url: "https://example.com/x",
      days: [{ date: "2026-05-20", position: 5, clicks: 3, impressions: 100, ctr: 0.03 }],
      topQueries: [{ query: "cached query", position: 5, clicks: 3, impressions: 100 }],
    };
    const dir = path.join(tmp, "demo");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "pub_x.json"), JSON.stringify(cached), "utf-8");

    const result = await loadOrFetchPostHistory({
      cacheDir: tmp,
      siteSlug: "demo",
      postId: "pub_x",
      url: "https://example.com/x",
      propertyUrl: "sc-domain:example.com",
      gsc: { serviceAccountJson: "{}" },
      now: NOW,
    });

    expect(result.topQueries[0]!.query).toBe("cached query");
    expect(querySearchConsoleMock).not.toHaveBeenCalled();
  });

  it("refetches when cache is stale (older than ttl)", async () => {
    const tmp = await mkdtemp(path.join(tmpdir(), "post-hist-"));
    const cached = {
      pulled_at_iso: new Date(NOW.getTime() - 10 * 60 * 60 * 1000).toISOString(), // 10h ago > 6h ttl
      url: "https://example.com/x",
      days: [],
      topQueries: [],
    };
    const dir = path.join(tmp, "demo");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "pub_x.json"), JSON.stringify(cached), "utf-8");

    querySearchConsoleMock
      .mockResolvedValueOnce(gscDailyRows([{ date: "2026-05-21", position: 3, clicks: 5, impressions: 200 }]))
      .mockResolvedValueOnce(gscQueryRows([{ query: "fresh", position: 3, clicks: 5, impressions: 200 }]));

    const result = await loadOrFetchPostHistory({
      cacheDir: tmp,
      siteSlug: "demo",
      postId: "pub_x",
      url: "https://example.com/x",
      propertyUrl: "sc-domain:example.com",
      gsc: { serviceAccountJson: "{}" },
      now: NOW,
    });

    expect(result.topQueries[0]!.query).toBe("fresh");
    expect(querySearchConsoleMock).toHaveBeenCalledTimes(2);
  });

  it("writes the result back to the cache after fetching", async () => {
    const tmp = await mkdtemp(path.join(tmpdir(), "post-hist-"));
    querySearchConsoleMock
      .mockResolvedValueOnce(gscDailyRows([{ date: "2026-05-21", position: 5, clicks: 3, impressions: 100 }]))
      .mockResolvedValueOnce(gscQueryRows([{ query: "q1", position: 5, clicks: 3, impressions: 100 }]));

    await loadOrFetchPostHistory({
      cacheDir: tmp,
      siteSlug: "demo",
      postId: "pub_x",
      url: "https://example.com/x",
      propertyUrl: "sc-domain:example.com",
      gsc: { serviceAccountJson: "{}" },
      now: NOW,
    });

    const cacheFile = await readFile(path.join(tmp, "demo", "pub_x.json"), "utf-8");
    const parsed = JSON.parse(cacheFile);
    expect(parsed.url).toBe("https://example.com/x");
    expect(parsed.days).toHaveLength(1);
    expect(parsed.topQueries[0].query).toBe("q1");
  });

  it("force-refetches when forceRefresh=true even if cache is fresh", async () => {
    const tmp = await mkdtemp(path.join(tmpdir(), "post-hist-"));
    const cached = {
      pulled_at_iso: new Date(NOW.getTime() - 60 * 1000).toISOString(),
      url: "https://example.com/x",
      days: [{ date: "2026-05-20", position: 99, clicks: 0, impressions: 1, ctr: 0 }],
      topQueries: [{ query: "stale", position: 99, clicks: 0, impressions: 1 }],
    };
    const dir = path.join(tmp, "demo");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "pub_x.json"), JSON.stringify(cached), "utf-8");

    querySearchConsoleMock
      .mockResolvedValueOnce(gscDailyRows([{ date: "2026-05-21", position: 1, clicks: 50, impressions: 1000 }]))
      .mockResolvedValueOnce(gscQueryRows([{ query: "forced", position: 1, clicks: 50, impressions: 1000 }]));

    const result = await loadOrFetchPostHistory({
      cacheDir: tmp,
      siteSlug: "demo",
      postId: "pub_x",
      url: "https://example.com/x",
      propertyUrl: "sc-domain:example.com",
      gsc: { serviceAccountJson: "{}" },
      now: NOW,
      forceRefresh: true,
    });

    expect(result.topQueries[0]!.query).toBe("forced");
    expect(querySearchConsoleMock).toHaveBeenCalledTimes(2);
  });
});

describe("computeHistorySummary", () => {
  it("returns last-7d aggregates and prior-7d delta", () => {
    const days = [
      // prior-7d window (days 8-14 ago) avg position 10
      ...Array.from({ length: 7 }, (_, i) => ({
        date: `2026-05-${(8 + i).toString().padStart(2, "0")}`,
        position: 10,
        clicks: 1,
        impressions: 50,
        ctr: 0.02,
      })),
      // last-7d avg position 4 (days 0-7 ago)
      ...Array.from({ length: 7 }, (_, i) => ({
        date: `2026-05-${(15 + i).toString().padStart(2, "0")}`,
        position: 4,
        clicks: 5,
        impressions: 100,
        ctr: 0.05,
      })),
    ];
    const sum = computeHistorySummary(days, new Date("2026-05-22T00:00:00Z"));
    expect(sum.last7d.avgPosition).toBeCloseTo(4, 1);
    expect(sum.last7d.clicks).toBe(35);
    expect(sum.last7d.impressions).toBe(700);
    // Position improved (lower = better) → positionDelta negative
    expect(sum.deltaVsPrior).not.toBeNull();
    expect(sum.deltaVsPrior!.positionDelta).toBeLessThan(0);
  });

  it("returns null delta when prior window has no data", () => {
    const days = [
      { date: "2026-05-21", position: 4, clicks: 5, impressions: 100, ctr: 0.05 },
    ];
    const sum = computeHistorySummary(days, new Date("2026-05-22T00:00:00Z"));
    expect(sum.deltaVsPrior).toBeNull();
  });
});
