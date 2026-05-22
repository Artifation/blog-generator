import { describe, expect, it, vi, beforeEach } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const querySearchConsoleMock = vi.hoisted(() => vi.fn());

vi.mock("@/integrations/searchConsole", () => ({
  querySearchConsole: querySearchConsoleMock,
}));

import { runGscSnapshot, type PublishedPostRef } from "@/pipeline/gscSnapshot";
import type { GscQueryResult } from "@/integrations/searchConsole";

const GSC_OPTS = {
  serviceAccountJson: '{"client_email":"bot@x.iam.gserviceaccount.com","private_key":"fake"}',
};

function makeRows(rows: GscQueryResult["rows"]): GscQueryResult {
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

const POSTS: PublishedPostRef[] = [
  {
    url: "https://artifation.nl/ai-voor-mkb/",
    published_at: "2026-04-01",
    target_keyword: "ai voor mkb",
    pillar: "ai-per-afdeling",
  },
  {
    url: "https://artifation.nl/ai-act-mkb/",
    published_at: "2026-04-15",
    target_keyword: "ai act mkb",
    pillar: "ai-act",
  },
];

describe("runGscSnapshot", () => {
  let tmpDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "gsc-snap-"));
  });

  it("writes snapshot file with per-post perf + summary aggregates", async () => {
    // 3 calls per post: last_30d, all_time, top_queries → 6 total
    querySearchConsoleMock
      // post 1
      .mockResolvedValueOnce(makeRows([{ keys: ["https://artifation.nl/ai-voor-mkb/"], clicks: 12, impressions: 850, ctr: 0.014, position: 18.3 }]))
      .mockResolvedValueOnce(makeRows([{ keys: ["https://artifation.nl/ai-voor-mkb/"], clicks: 45, impressions: 2400, ctr: 0.019, position: 21.5 }]))
      .mockResolvedValueOnce(makeRows([
        { keys: ["ai voor mkb"], clicks: 8, impressions: 320, ctr: 0.025, position: 12.3 },
        { keys: ["mkb ai tools"], clicks: 3, impressions: 180, ctr: 0.017, position: 22.1 },
      ]))
      // post 2
      .mockResolvedValueOnce(makeRows([{ keys: ["https://artifation.nl/ai-act-mkb/"], clicks: 0, impressions: 5, ctr: 0, position: 88.0 }]))
      .mockResolvedValueOnce(makeRows([{ keys: ["https://artifation.nl/ai-act-mkb/"], clicks: 1, impressions: 12, ctr: 0.08, position: 70.4 }]))
      .mockResolvedValueOnce(makeRows([]));

    const result = await runGscSnapshot({
      tenantSlug: "artifation",
      propertyUrl: "sc-domain:artifation.nl",
      posts: POSTS,
      gsc: GSC_OPTS,
      now: new Date("2026-05-22T10:00:00Z"),
      dataDir: tmpDir,
    });

    expect(result.snapshot.snapshot_date).toBe("2026-05-22");
    expect(result.snapshot.posts).toHaveLength(2);
    expect(result.snapshot.posts[0]!.last_30d.clicks).toBe(12);
    expect(result.snapshot.posts[0]!.top_queries).toHaveLength(2);
    expect(result.snapshot.posts[0]!.top_queries[0]!.query).toBe("ai voor mkb");
    expect(result.snapshot.posts[0]!.days_live).toBe(51);
    expect(result.snapshot.posts[1]!.last_30d.impressions).toBe(5);
    expect(result.snapshot.summary.posts_with_data).toBe(2);
    expect(result.snapshot.summary.posts_with_zero_impressions).toBe(0);
    expect(result.snapshot.summary.total_clicks_last_30d).toBe(12);
    expect(result.snapshot.summary.total_impressions_last_30d).toBe(855);

    const persisted = JSON.parse(await readFile(result.filePath, "utf-8"));
    expect(persisted.tenant_slug).toBe("artifation");
    expect(persisted.posts).toHaveLength(2);

    await rm(tmpDir, { recursive: true, force: true });
  });

  it("tolerates GSC errors per post and continues", async () => {
    querySearchConsoleMock
      .mockRejectedValueOnce(new Error("rate limit"))
      .mockResolvedValueOnce(makeRows([]))
      .mockResolvedValueOnce(makeRows([]))
      .mockResolvedValueOnce(makeRows([{ keys: ["https://artifation.nl/ai-act-mkb/"], clicks: 2, impressions: 30, ctr: 0.066, position: 45 }]))
      .mockResolvedValueOnce(makeRows([{ keys: ["https://artifation.nl/ai-act-mkb/"], clicks: 5, impressions: 90, ctr: 0.055, position: 50 }]))
      .mockResolvedValueOnce(makeRows([]));

    const result = await runGscSnapshot({
      tenantSlug: "artifation",
      propertyUrl: "sc-domain:artifation.nl",
      posts: POSTS,
      gsc: GSC_OPTS,
      now: new Date("2026-05-22T10:00:00Z"),
      dataDir: tmpDir,
    });

    expect(result.snapshot.posts).toHaveLength(2);
    // Post 1 last_30d call failed → empty window
    expect(result.snapshot.posts[0]!.last_30d.clicks).toBe(0);
    // Post 2 has real data
    expect(result.snapshot.posts[1]!.last_30d.clicks).toBe(2);

    await rm(tmpDir, { recursive: true, force: true });
  });

  it("handles empty posts list gracefully", async () => {
    const result = await runGscSnapshot({
      tenantSlug: "artifation",
      propertyUrl: "sc-domain:artifation.nl",
      posts: [],
      gsc: GSC_OPTS,
      now: new Date("2026-05-22T10:00:00Z"),
      dataDir: tmpDir,
    });

    expect(result.snapshot.posts).toHaveLength(0);
    expect(result.snapshot.summary.posts_with_data).toBe(0);
    expect(querySearchConsoleMock).not.toHaveBeenCalled();

    await rm(tmpDir, { recursive: true, force: true });
  });
});
