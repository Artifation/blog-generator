import { describe, expect, it } from "vitest";
import { deriveRefreshOpportunities, type PublishedPostRef, type RefreshHistoryEntry } from "@/pipeline/refreshOpportunities";
import type { GscSnapshot } from "@/pipeline/gscSnapshot";

const NOW = new Date("2026-05-22T12:00:00Z");

const POSTS: PublishedPostRef[] = [
  {
    publishedPostId: "pub_decaying",
    url: "https://artifation.nl/ai-voor-mkb/",
    title: "AI voor MKB",
    publishedAt: "2025-10-01T08:00:00Z",
    targetKeyword: "ai voor mkb",
    pillarSlug: "ai-per-afdeling",
    slug: "ai-voor-mkb",
  },
  {
    publishedPostId: "pub_striking",
    url: "https://artifation.nl/ai-roi/",
    title: "AI ROI berekenen",
    publishedAt: "2026-02-20T08:00:00Z",
    targetKeyword: "ai roi",
    pillarSlug: "ai-per-afdeling",
    slug: "ai-roi",
  },
  {
    publishedPostId: "pub_evergreen_stagnant",
    url: "https://artifation.nl/ai-veiligheid/",
    title: "AI veiligheid uitleg",
    publishedAt: "2025-09-01T08:00:00Z",
    targetKeyword: "ai veiligheid",
    pillarSlug: "ai-act",
    slug: "ai-veiligheid",
  },
  {
    publishedPostId: "pub_freshness",
    url: "https://artifation.nl/ai-prompts/",
    title: "AI prompt-engineering basics",
    publishedAt: "2025-08-01T08:00:00Z",
    targetKeyword: "ai prompts",
    pillarSlug: "ai-tools",
    slug: "ai-prompts",
  },
  {
    publishedPostId: "pub_recent",
    url: "https://artifation.nl/verse/",
    title: "Verse post",
    publishedAt: "2026-05-15T08:00:00Z",
    targetKeyword: "verse",
    pillarSlug: "ai-tools",
    slug: "verse",
  },
];

const SNAPSHOT: GscSnapshot = {
  snapshot_date: "2026-05-22",
  tenant_slug: "artifation",
  property_url: "sc-domain:artifation.nl",
  pulled_at_iso: "2026-05-22T07:00:00Z",
  posts: [
    {
      // Decaying: position degraded from all_time 5 → last_30d 12 (delta 7)
      url: "https://artifation.nl/ai-voor-mkb/",
      published_at: "2025-10-01",
      target_keyword: "ai voor mkb",
      pillar: "ai-per-afdeling",
      days_live: 233,
      last_30d: { clicks: 20, impressions: 800, ctr: 0.025, avg_position: 12.0 },
      all_time: { clicks: 600, impressions: 14000, ctr: 0.043, avg_position: 5.0 },
      top_queries: [
        { query: "ai voor mkb", impressions: 400, clicks: 8, position: 11.5 },
        { query: "ai mkb tools", impressions: 200, clicks: 4, position: 13.0 },
      ],
    },
    {
      // Striking distance: position 14.3 with 250 impressions
      url: "https://artifation.nl/ai-roi/",
      published_at: "2026-02-20",
      target_keyword: "ai roi",
      pillar: "ai-per-afdeling",
      days_live: 91,
      last_30d: { clicks: 8, impressions: 250, ctr: 0.032, avg_position: 14.3 },
      all_time: { clicks: 25, impressions: 700, ctr: 0.036, avg_position: 15 },
      top_queries: [
        { query: "ai roi berekenen", impressions: 180, clicks: 6, position: 12.5 },
      ],
    },
    {
      // Stagnant evergreen: ≥120 days, has impressions, almost no clicks
      url: "https://artifation.nl/ai-veiligheid/",
      published_at: "2025-09-01",
      target_keyword: "ai veiligheid",
      pillar: "ai-act",
      days_live: 263,
      last_30d: { clicks: 2, impressions: 180, ctr: 0.011, avg_position: 28.0 },
      all_time: { clicks: 12, impressions: 1400, ctr: 0.009, avg_position: 30.0 },
      top_queries: [
        { query: "ai veiligheid regels", impressions: 90, clicks: 1, position: 25.0 },
      ],
    },
    // pub_freshness intentionally NOT in snapshot to test freshness-only fallback
    // pub_recent (verse): not in snapshot (only 7 days live)
  ],
  summary: {
    posts_with_data: 3,
    posts_with_zero_impressions: 0,
    total_clicks_last_30d: 30,
    total_impressions_last_30d: 1230,
  },
};

describe("deriveRefreshOpportunities", () => {
  it("classifies decaying posts when position degraded ≥2 vs all-time", () => {
    const opps = deriveRefreshOpportunities({
      snapshot: SNAPSHOT,
      publishedPosts: POSTS,
      refreshHistory: [],
      now: NOW,
    });
    const decaying = opps.find((o) => o.publishedPostId === "pub_decaying");
    expect(decaying).toBeDefined();
    expect(decaying!.category).toBe("decaying");
    expect(decaying!.rationale).toMatch(/position/i);
    expect(decaying!.directives.length).toBeGreaterThan(0);
  });

  it("classifies striking-distance posts (position 11-20 + ≥50 impressions)", () => {
    const opps = deriveRefreshOpportunities({
      snapshot: SNAPSHOT,
      publishedPosts: POSTS,
      refreshHistory: [],
      now: NOW,
    });
    const striking = opps.find((o) => o.publishedPostId === "pub_striking");
    expect(striking).toBeDefined();
    expect(striking!.category).toBe("striking_distance");
    expect(striking!.signals.top_queries).toContain("ai roi berekenen");
  });

  it("classifies stagnant evergreen (≥120 days live, has impressions, near-zero clicks)", () => {
    const opps = deriveRefreshOpportunities({
      snapshot: SNAPSHOT,
      publishedPosts: POSTS,
      refreshHistory: [],
      now: NOW,
    });
    const stagnant = opps.find((o) => o.publishedPostId === "pub_evergreen_stagnant");
    expect(stagnant).toBeDefined();
    expect(stagnant!.category).toBe("stagnant_evergreen");
  });

  it("classifies freshness-overdue purely on age when no GSC data exists for the post", () => {
    const opps = deriveRefreshOpportunities({
      snapshot: SNAPSHOT,
      publishedPosts: POSTS,
      refreshHistory: [],
      now: NOW,
    });
    const overdue = opps.find((o) => o.publishedPostId === "pub_freshness");
    expect(overdue).toBeDefined();
    expect(overdue!.category).toBe("freshness_overdue");
    expect(overdue!.signals.days_since_publish).toBeGreaterThanOrEqual(180);
  });

  it("excludes posts younger than freshnessOverdueDays when they have no GSC signal", () => {
    const opps = deriveRefreshOpportunities({
      snapshot: SNAPSHOT,
      publishedPosts: POSTS,
      refreshHistory: [],
      now: NOW,
    });
    expect(opps.find((o) => o.publishedPostId === "pub_recent")).toBeUndefined();
  });

  it("excludes posts inside the cooldown window after a recent refresh", () => {
    const recentRefresh: RefreshHistoryEntry = {
      publishedPostId: "pub_decaying",
      triggeredAt: new Date(NOW.getTime() - 30 * 86_400_000).toISOString(),
    };
    const opps = deriveRefreshOpportunities({
      snapshot: SNAPSHOT,
      publishedPosts: POSTS,
      refreshHistory: [recentRefresh],
      now: NOW,
    });
    expect(opps.find((o) => o.publishedPostId === "pub_decaying")).toBeUndefined();
  });

  it("includes posts whose previous refresh is older than cooldownDays", () => {
    const oldRefresh: RefreshHistoryEntry = {
      publishedPostId: "pub_decaying",
      triggeredAt: new Date(NOW.getTime() - 90 * 86_400_000).toISOString(),
    };
    const opps = deriveRefreshOpportunities({
      snapshot: SNAPSHOT,
      publishedPosts: POSTS,
      refreshHistory: [oldRefresh],
      now: NOW,
    });
    expect(opps.find((o) => o.publishedPostId === "pub_decaying")).toBeDefined();
  });

  it("ranks opportunities by score descending", () => {
    const opps = deriveRefreshOpportunities({
      snapshot: SNAPSHOT,
      publishedPosts: POSTS,
      refreshHistory: [],
      now: NOW,
    });
    for (let i = 1; i < opps.length; i++) {
      expect(opps[i - 1]!.score).toBeGreaterThanOrEqual(opps[i]!.score);
    }
  });

  it("falls back to freshness-only opportunities when snapshot is null", () => {
    const opps = deriveRefreshOpportunities({
      snapshot: null,
      publishedPosts: POSTS,
      refreshHistory: [],
      now: NOW,
    });
    // Only posts ≥180 days old should appear
    const ids = opps.map((o) => o.publishedPostId);
    expect(ids).toContain("pub_freshness");
    expect(ids).toContain("pub_evergreen_stagnant");
    expect(ids).toContain("pub_decaying");
    // pub_recent is only 7 days old, pub_striking is ~91 days
    expect(ids).not.toContain("pub_recent");
    expect(ids).not.toContain("pub_striking");
    // All categories should be freshness_overdue
    for (const o of opps) {
      expect(o.category).toBe("freshness_overdue");
    }
  });

  it("produces category-specific directives that mention the right things", () => {
    const opps = deriveRefreshOpportunities({
      snapshot: SNAPSHOT,
      publishedPosts: POSTS,
      refreshHistory: [],
      now: NOW,
    });
    const striking = opps.find((o) => o.publishedPostId === "pub_striking")!;
    // Directives should mention the underperforming queries we want to climb
    const joined = striking.directives.join(" ").toLowerCase();
    expect(joined).toMatch(/ai roi berekenen|striking|deepen|expand/);
  });
});
