/**
 * Refresh-opportunity detector.
 *
 * Closes the loop "publish → forget" door GSC-snapshot + publishedPosts +
 * refresh-history te combineren tot een geranschikte lijst posts die baat
 * hebben bij een rewriter-pass.
 *
 * Vier categorieën, in dalende prioriteit (één per post — hoogste wint):
 *   1. decaying           — positie ≥2 plekken verslechterd vs all_time
 *   2. striking_distance  — positie 11-20 + ≥50 impressies (page-1 binnen handbereik)
 *   3. stagnant_evergreen — ≥120 dagen live, impressies aanwezig, vrijwel geen clicks
 *   4. freshness_overdue  — ≥180 dagen sinds publish/laatste refresh, ongeacht GSC
 *
 * Posts in de cooldown-window na een eerdere refresh worden uitgesloten
 * (default 60 dagen) — GSC heeft tijd nodig om effect te laten zien.
 */
import type { GscSnapshot, PostPerformance } from "./gscSnapshot.ts";

export type RefreshCategory =
  | "decaying"
  | "striking_distance"
  | "stagnant_evergreen"
  | "freshness_overdue";

export interface PublishedPostRef {
  publishedPostId: string;
  url: string;
  title?: string;
  publishedAt: string;          // ISO timestamp
  targetKeyword: string;
  pillarSlug: string;
  slug: string;
}

export interface RefreshHistoryEntry {
  publishedPostId: string;
  triggeredAt: string;          // ISO timestamp
}

export interface RefreshOpportunity {
  publishedPostId: string;
  url: string;
  title?: string;
  category: RefreshCategory;
  score: number;                // 0..1, higher = more urgent
  rationale: string;            // human-readable, surfaces in UI
  signals: {
    clicks_30d?: number;
    impressions_30d?: number;
    avg_position?: number;
    avg_position_all_time?: number;
    top_queries?: string[];     // queries we currently rank for but not well
    days_since_publish: number;
    days_since_refresh?: number;
  };
  directives: string[];         // rewriter-input: category-specific issues_to_address
}

export interface DeriveRefreshOpportunitiesOpts {
  snapshot: GscSnapshot | null;
  publishedPosts: PublishedPostRef[];
  refreshHistory: RefreshHistoryEntry[];
  now?: Date;
  /** Days a post must wait after a refresh before being re-flagged. */
  cooldownDays?: number;
  /** Age in days at which a post becomes freshness-overdue. */
  freshnessOverdueDays?: number;
  /** Min days live before stagnant-evergreen classification kicks in. */
  stagnantMinDaysLive?: number;
  /** Min days live before decaying classification kicks in. */
  decayingMinDaysLive?: number;
}

const DEFAULTS = {
  cooldownDays: 60,
  freshnessOverdueDays: 180,
  stagnantMinDaysLive: 120,
  decayingMinDaysLive: 90,
  strikingPositionMin: 11,
  strikingPositionMax: 20,
  strikingMinImpressions: 50,
  decayingPositionDelta: 2.0,
  stagnantMaxClicks: 5,
  stagnantMinImpressions: 100,
};

export function deriveRefreshOpportunities(
  opts: DeriveRefreshOpportunitiesOpts
): RefreshOpportunity[] {
  const now = opts.now ?? new Date();
  const cfg = { ...DEFAULTS };
  if (opts.cooldownDays !== undefined) cfg.cooldownDays = opts.cooldownDays;
  if (opts.freshnessOverdueDays !== undefined)
    cfg.freshnessOverdueDays = opts.freshnessOverdueDays;
  if (opts.stagnantMinDaysLive !== undefined)
    cfg.stagnantMinDaysLive = opts.stagnantMinDaysLive;
  if (opts.decayingMinDaysLive !== undefined)
    cfg.decayingMinDaysLive = opts.decayingMinDaysLive;

  const lastRefreshByPost = new Map<string, Date>();
  for (const entry of opts.refreshHistory) {
    const at = new Date(entry.triggeredAt);
    const existing = lastRefreshByPost.get(entry.publishedPostId);
    if (!existing || at > existing) {
      lastRefreshByPost.set(entry.publishedPostId, at);
    }
  }

  const snapshotByUrl = new Map<string, PostPerformance>();
  if (opts.snapshot) {
    for (const p of opts.snapshot.posts) {
      snapshotByUrl.set(normalizeUrl(p.url), p);
    }
  }

  const opportunities: RefreshOpportunity[] = [];

  for (const post of opts.publishedPosts) {
    const daysSincePublish = Math.floor(
      (now.getTime() - new Date(post.publishedAt).getTime()) / 86_400_000
    );
    const lastRefreshAt = lastRefreshByPost.get(post.publishedPostId);
    const daysSinceRefresh = lastRefreshAt
      ? Math.floor((now.getTime() - lastRefreshAt.getTime()) / 86_400_000)
      : undefined;

    // Cooldown: skip posts refreshed recently — GSC needs time to show effect.
    if (daysSinceRefresh !== undefined && daysSinceRefresh < cfg.cooldownDays) {
      continue;
    }

    const perf = snapshotByUrl.get(normalizeUrl(post.url));
    const effectiveAgeDays = daysSinceRefresh ?? daysSincePublish;

    let opp: RefreshOpportunity | null = null;

    if (perf) {
      // Try categories in priority order.
      opp =
        tryDecaying(post, perf, daysSincePublish, daysSinceRefresh, cfg) ??
        tryStrikingDistance(post, perf, daysSincePublish, daysSinceRefresh, cfg) ??
        tryStagnantEvergreen(post, perf, daysSincePublish, daysSinceRefresh, cfg);
    }

    if (!opp && effectiveAgeDays >= cfg.freshnessOverdueDays) {
      opp = buildFreshnessOverdue(post, perf, daysSincePublish, daysSinceRefresh);
    }

    if (opp) opportunities.push(opp);
  }

  opportunities.sort((a, b) => b.score - a.score);
  return opportunities;
}

function normalizeUrl(u: string): string {
  // GSC stores URLs with trailing slash sometimes; normalize so DB-built
  // `https://domain/slug` matches snapshot `https://domain/slug/`.
  return u.replace(/\/$/, "");
}

function tryDecaying(
  post: PublishedPostRef,
  perf: PostPerformance,
  daysSincePublish: number,
  daysSinceRefresh: number | undefined,
  cfg: typeof DEFAULTS
): RefreshOpportunity | null {
  if (perf.days_live < cfg.decayingMinDaysLive) return null;
  const positionDelta = perf.last_30d.avg_position - perf.all_time.avg_position;
  if (positionDelta < cfg.decayingPositionDelta) return null;

  const score = clamp01(
    0.55 + Math.min(positionDelta / 20, 0.25) + Math.min(perf.last_30d.impressions / 5000, 0.2)
  );

  const topQueries = perf.top_queries.slice(0, 3).map((q) => q.query);
  return {
    publishedPostId: post.publishedPostId,
    url: post.url,
    title: post.title,
    category: "decaying",
    score,
    rationale: `Average position dropped ${positionDelta.toFixed(1)} places (${perf.all_time.avg_position.toFixed(1)} → ${perf.last_30d.avg_position.toFixed(1)}); ${perf.last_30d.impressions} impressions last 30d.`,
    signals: {
      clicks_30d: perf.last_30d.clicks,
      impressions_30d: perf.last_30d.impressions,
      avg_position: perf.last_30d.avg_position,
      avg_position_all_time: perf.all_time.avg_position,
      top_queries: topQueries,
      days_since_publish: daysSincePublish,
      days_since_refresh: daysSinceRefresh,
    },
    directives: [
      `Position decayed from ${perf.all_time.avg_position.toFixed(1)} to ${perf.last_30d.avg_position.toFixed(1)} for target keyword "${post.targetKeyword}". Refresh with: (1) updated 2026 stats and freshness anchors, (2) expanded coverage for any subtopic the SERP rewards, (3) re-evaluated internal-link injection.`,
      ...(topQueries.length > 0
        ? [`Queries showing impressions but losing ground: ${topQueries.join(", ")}. Ensure each is addressed with a dedicated H2/H3 and a direct answer.`]
        : []),
    ],
  };
}

function tryStrikingDistance(
  post: PublishedPostRef,
  perf: PostPerformance,
  daysSincePublish: number,
  daysSinceRefresh: number | undefined,
  cfg: typeof DEFAULTS
): RefreshOpportunity | null {
  const pos = perf.last_30d.avg_position;
  if (
    pos < cfg.strikingPositionMin ||
    pos > cfg.strikingPositionMax ||
    perf.last_30d.impressions < cfg.strikingMinImpressions
  ) {
    return null;
  }

  // Closer to position 11 = easier uplift = higher score
  const positionBonus = (cfg.strikingPositionMax - pos) / (cfg.strikingPositionMax - cfg.strikingPositionMin);
  const score = clamp01(0.5 + positionBonus * 0.25 + Math.min(perf.last_30d.impressions / 2000, 0.25));

  const topQueries = perf.top_queries.slice(0, 3).map((q) => q.query);
  return {
    publishedPostId: post.publishedPostId,
    url: post.url,
    title: post.title,
    category: "striking_distance",
    score,
    rationale: `Currently ranks position ${pos.toFixed(1)} for "${post.targetKeyword}" with ${perf.last_30d.impressions} impressions last 30d — within striking distance of page 1.`,
    signals: {
      clicks_30d: perf.last_30d.clicks,
      impressions_30d: perf.last_30d.impressions,
      avg_position: pos,
      avg_position_all_time: perf.all_time.avg_position,
      top_queries: topQueries,
      days_since_publish: daysSincePublish,
      days_since_refresh: daysSinceRefresh,
    },
    directives: [
      `Striking-distance refresh: post ranks position ${pos.toFixed(1)} for "${post.targetKeyword}" with ${perf.last_30d.impressions} impressions/30d. Goal: lift to page 1. Deepen the on-page coverage for the queries below, add a clear topic-summary section near the top, and tighten the meta title for CTR.`,
      ...(topQueries.length > 0
        ? [`Underperforming queries to deepen with explicit H2/H3 sections: ${topQueries.join(", ")}.`]
        : []),
    ],
  };
}

function tryStagnantEvergreen(
  post: PublishedPostRef,
  perf: PostPerformance,
  daysSincePublish: number,
  daysSinceRefresh: number | undefined,
  cfg: typeof DEFAULTS
): RefreshOpportunity | null {
  if (perf.days_live < cfg.stagnantMinDaysLive) return null;
  if (perf.last_30d.clicks > cfg.stagnantMaxClicks) return null;
  if (perf.last_30d.impressions < cfg.stagnantMinImpressions) return null;

  const score = clamp01(0.3 + Math.min(perf.last_30d.impressions / 2000, 0.3));

  const topQueries = perf.top_queries.slice(0, 3).map((q) => q.query);
  return {
    publishedPostId: post.publishedPostId,
    url: post.url,
    title: post.title,
    category: "stagnant_evergreen",
    score,
    rationale: `${perf.days_live} days live, ${perf.last_30d.impressions} impressions but only ${perf.last_30d.clicks} clicks last 30d — content is being shown but not clicked.`,
    signals: {
      clicks_30d: perf.last_30d.clicks,
      impressions_30d: perf.last_30d.impressions,
      avg_position: perf.last_30d.avg_position,
      avg_position_all_time: perf.all_time.avg_position,
      top_queries: topQueries,
      days_since_publish: daysSincePublish,
      days_since_refresh: daysSinceRefresh,
    },
    directives: [
      `Stagnant evergreen: impressions exist but CTR is near zero. Refresh angle: rewrite the meta title + meta description for click-appeal, rebuild the intro hook, and clarify the unique value-prop in the first 200 words. Avoid expanding word count unless coverage gaps exist.`,
      ...(topQueries.length > 0
        ? [`Queries this post appears for but barely earns clicks: ${topQueries.join(", ")}. Address each explicitly.`]
        : []),
    ],
  };
}

function buildFreshnessOverdue(
  post: PublishedPostRef,
  perf: PostPerformance | undefined,
  daysSincePublish: number,
  daysSinceRefresh: number | undefined
): RefreshOpportunity {
  // Older posts get higher freshness scores. Capped so it never outranks a
  // strong decaying/striking candidate.
  const age = daysSinceRefresh ?? daysSincePublish;
  const score = clamp01(0.25 + Math.min(age / 1095, 0.25)); // 3y caps at +0.25

  return {
    publishedPostId: post.publishedPostId,
    url: post.url,
    title: post.title,
    category: "freshness_overdue",
    score,
    rationale: daysSinceRefresh !== undefined
      ? `Last refreshed ${daysSinceRefresh} days ago — overdue.`
      : `Published ${daysSincePublish} days ago, never refreshed.`,
    signals: {
      clicks_30d: perf?.last_30d.clicks,
      impressions_30d: perf?.last_30d.impressions,
      avg_position: perf?.last_30d.avg_position,
      avg_position_all_time: perf?.all_time.avg_position,
      top_queries: perf?.top_queries.slice(0, 3).map((q) => q.query),
      days_since_publish: daysSincePublish,
      days_since_refresh: daysSinceRefresh,
    },
    directives: [
      `Freshness pass for "${post.targetKeyword}". Verify all stats, statutory references and product names are current as of ${new Date().getUTCFullYear()}. Update any "<year>" anchors. Re-evaluate internal links — there may be newer pillar posts worth linking to.`,
    ],
  };
}

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
