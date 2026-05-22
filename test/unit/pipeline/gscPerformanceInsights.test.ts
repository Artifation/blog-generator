import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { derivePerformanceInsights, loadLatestSnapshot } from "@/pipeline/gscPerformanceInsights";
import type { GscSnapshot } from "@/pipeline/gscSnapshot";

const SNAPSHOT: GscSnapshot = {
  snapshot_date: "2026-05-22",
  tenant_slug: "artifation",
  property_url: "sc-domain:artifation.nl",
  pulled_at_iso: "2026-05-22T07:00:00Z",
  posts: [
    {
      url: "https://artifation.nl/ai-voor-mkb/",
      published_at: "2026-01-01",
      target_keyword: "ai voor mkb",
      pillar: "ai-per-afdeling",
      days_live: 141,
      last_30d: { clicks: 85, impressions: 4200, ctr: 0.02, avg_position: 6.4 },
      all_time: { clicks: 320, impressions: 18000, ctr: 0.017, avg_position: 8.1 },
      top_queries: [
        { query: "ai voor mkb", impressions: 1200, clicks: 30, position: 5.2 },
        { query: "ai mkb tools", impressions: 800, clicks: 18, position: 7.0 },
      ],
    },
    {
      url: "https://artifation.nl/ai-act-mkb/",
      published_at: "2026-02-01",
      target_keyword: "ai act mkb",
      pillar: "ai-act",
      days_live: 110,
      last_30d: { clicks: 4, impressions: 30, ctr: 0.13, avg_position: 45 },
      all_time: { clicks: 10, impressies: 80, ctr: 0.12, avg_position: 40 } as never,
      top_queries: [],
    },
    {
      url: "https://artifation.nl/ai-roi/",
      published_at: "2026-03-01",
      target_keyword: "ai roi",
      pillar: "ai-per-afdeling",
      days_live: 82,
      last_30d: { clicks: 8, impressions: 250, ctr: 0.032, avg_position: 14.3 },
      all_time: { clicks: 25, impressions: 700, ctr: 0.036, avg_position: 15 },
      top_queries: [
        { query: "ai roi berekenen", impressions: 180, clicks: 6, position: 12.5 },
      ],
    },
    {
      url: "https://artifation.nl/verse-post/",
      published_at: "2026-05-15",
      target_keyword: "verse keyword",
      pillar: "ai-per-afdeling",
      days_live: 7,
      last_30d: { clicks: 0, impressions: 2, ctr: 0, avg_position: 88 },
      all_time: { clicks: 0, impressions: 2, ctr: 0, avg_position: 88 },
      top_queries: [],
    },
  ],
  summary: {
    posts_with_data: 4,
    posts_with_zero_impressions: 0,
    total_clicks_last_30d: 97,
    total_impressions_last_30d: 4482,
  },
};

describe("derivePerformanceInsights", () => {
  it("identifies top performers above the clicks threshold", () => {
    const ins = derivePerformanceInsights(SNAPSHOT);
    expect(ins.top_performers).toHaveLength(1);
    expect(ins.top_performers[0]!.url).toBe("https://artifation.nl/ai-voor-mkb/");
    expect(ins.top_performers[0]!.clicks_30d).toBe(85);
  });

  it("flags underperformers (low impressions, days live >= minDaysLive)", () => {
    const ins = derivePerformanceInsights(SNAPSHOT);
    // ai-act-mkb has 30 impressions and 110 days live → underperformer.
    // verse-post has 2 impressions but only 7 days live → excluded.
    expect(ins.underperformers.map((p) => p.url)).toContain("https://artifation.nl/ai-act-mkb/");
    expect(ins.underperformers.map((p) => p.url)).not.toContain("https://artifation.nl/verse-post/");
  });

  it("finds striking-distance posts (pos 11-20 + impressies >= threshold)", () => {
    const ins = derivePerformanceInsights(SNAPSHOT);
    expect(ins.striking_distance_posts).toHaveLength(1);
    expect(ins.striking_distance_posts[0]!.url).toBe("https://artifation.nl/ai-roi/");
    expect(ins.striking_distance_posts[0]!.avg_position).toBeCloseTo(14.3);
  });

  it("collects ranking_keywords (top-10 positions only) across all posts", () => {
    const ins = derivePerformanceInsights(SNAPSHOT);
    const queries = ins.ranking_keywords.map((k) => k.query);
    expect(queries).toContain("ai voor mkb");
    expect(queries).toContain("ai mkb tools");
    // ai roi berekenen is pos 12.5 → niet top-10, niet meegenomen
    expect(queries).not.toContain("ai roi berekenen");
  });

  it("respects custom thresholds", () => {
    const ins = derivePerformanceInsights(SNAPSHOT, {
      thresholds: { topPerformerClicks: 100 },
    });
    expect(ins.top_performers).toHaveLength(0);
  });
});

describe("loadLatestSnapshot", () => {
  it("returns null when no snapshot dir exists", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "snap-load-"));
    const result = await loadLatestSnapshot("nonexistent", tmp);
    expect(result).toBeNull();
    await rm(tmp, { recursive: true, force: true });
  });

  it("returns latest dated file when multiple exist", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "snap-load-"));
    const dir = path.join(tmp, "gsc-snapshots", "artifation");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "2026-05-15.json"), JSON.stringify({ ...SNAPSHOT, snapshot_date: "2026-05-15" }));
    await writeFile(path.join(dir, "2026-05-22.json"), JSON.stringify({ ...SNAPSHOT, snapshot_date: "2026-05-22" }));
    await writeFile(path.join(dir, "2026-05-08.json"), JSON.stringify({ ...SNAPSHOT, snapshot_date: "2026-05-08" }));
    const result = await loadLatestSnapshot("artifation", tmp);
    expect(result?.snapshot_date).toBe("2026-05-22");
    await rm(tmp, { recursive: true, force: true });
  });

  it("ignores non-dated files in the snapshot dir", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "snap-load-"));
    const dir = path.join(tmp, "gsc-snapshots", "artifation");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "README.md"), "ignored");
    await writeFile(path.join(dir, "2026-05-22.json"), JSON.stringify({ ...SNAPSHOT, snapshot_date: "2026-05-22" }));
    const result = await loadLatestSnapshot("artifation", tmp);
    expect(result?.snapshot_date).toBe("2026-05-22");
    await rm(tmp, { recursive: true, force: true });
  });
});
