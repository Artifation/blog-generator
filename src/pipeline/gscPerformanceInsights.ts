/**
 * Leest de meest recente GSC-snapshot voor een tenant en distilleert
 * "performance signals" — feiten waar agents (topicSuggester, writer) op
 * kunnen sturen. Dit is de bridge tussen "we hebben data" en "we leren van
 * data". Pure data-transformatie, geen LLM.
 *
 * Input  : map met snapshots van `runGscSnapshot` (zie src/pipeline/gscSnapshot.ts)
 * Output : `PerformanceInsights` met top performers / underperformers /
 *          striking-distance posts / queries waar we al voor ranken
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { GscSnapshot, PostPerformance } from "./gscSnapshot.ts";

export interface PerformanceInsights {
  source_snapshot_date: string;
  top_performers: PostPerfRef[];
  underperformers: PostPerfRef[];
  striking_distance_posts: PostPerfRef[];
  ranking_keywords: RankingKeyword[];
}

export interface PostPerfRef {
  url: string;
  target_keyword: string;
  pillar?: string;
  days_live: number;
  clicks_30d: number;
  impressions_30d: number;
  avg_position: number;
  note: string;
}

export interface RankingKeyword {
  query: string;
  position: number;
  impressions: number;
  url: string;
}

export interface DerivePerformanceInsightsOpts {
  /** Minimum dagen live om een post te beoordelen als under/striking — voorkomt
   * dat verse posts ten onrechte als underperformer worden gemarkeerd. */
  minDaysLive?: number;
  /** Top-N posts per categorie (default 5). */
  topN?: number;
  /** Drempels — tunable per site, defaults zijn vrij conservatief. */
  thresholds?: {
    /** Posts boven dit aantal clicks gelden als top performer. */
    topPerformerClicks?: number;
    /** Posts onder dit aantal impressies gelden als underperformer (mits >minDaysLive). */
    underperformerMaxImpressions?: number;
    /** Avg position-range voor striking distance (kunnen page 1 halen met refresh). */
    strikingPositionMin?: number;
    strikingPositionMax?: number;
    /** Minimum impressies om als striking-distance kandidaat te kwalificeren. */
    strikingMinImpressions?: number;
    /** Avg position waaronder we een query als "we ranken al" beschouwen. */
    rankingTopPosition?: number;
  };
}

const DEFAULTS = {
  minDaysLive: 30,
  topN: 5,
  topPerformerClicks: 20,
  underperformerMaxImpressions: 50,
  strikingPositionMin: 11,
  strikingPositionMax: 20,
  strikingMinImpressions: 50,
  rankingTopPosition: 10,
};

export function derivePerformanceInsights(
  snapshot: GscSnapshot,
  opts: DerivePerformanceInsightsOpts = {}
): PerformanceInsights {
  const minDaysLive = opts.minDaysLive ?? DEFAULTS.minDaysLive;
  const topN = opts.topN ?? DEFAULTS.topN;
  const t = { ...DEFAULTS, ...(opts.thresholds ?? {}) };

  const eligible = snapshot.posts.filter((p) => p.days_live >= minDaysLive);

  const topPerformers = [...eligible]
    .filter((p) => p.last_30d.clicks >= t.topPerformerClicks)
    .sort((a, b) => b.last_30d.clicks - a.last_30d.clicks)
    .slice(0, topN)
    .map((p) => toRef(p, `Top performer: ${p.last_30d.clicks} clicks / ${p.last_30d.impressions} impressies last-30d`));

  const underperformers = [...eligible]
    .filter((p) => p.last_30d.impressions < t.underperformerMaxImpressions && p.days_live >= minDaysLive)
    .sort((a, b) => a.last_30d.impressions - b.last_30d.impressions || b.days_live - a.days_live)
    .slice(0, topN)
    .map((p) => toRef(p, `Underperformer: ${p.last_30d.impressions} impressies in ${p.days_live} dagen live — overweeg refresh of cannibalization-check`));

  const strikingDistance = [...eligible]
    .filter((p) =>
      p.last_30d.avg_position >= t.strikingPositionMin &&
      p.last_30d.avg_position <= t.strikingPositionMax &&
      p.last_30d.impressions >= t.strikingMinImpressions
    )
    .sort((a, b) => b.last_30d.impressions - a.last_30d.impressions)
    .slice(0, topN)
    .map((p) => toRef(p, `Striking distance: positie ${p.last_30d.avg_position.toFixed(1)} bij ${p.last_30d.impressions} impressies — refresh kan page 1 halen, GEEN nieuwe post`));

  // Verzamel alle queries waarvoor we al top-10 ranken — agent moet hier
  // GEEN nieuwe topics op voorstellen. Eén query kan in meerdere posts staan;
  // we behouden de beste (laagste) positie per query.
  const rankingMap = new Map<string, RankingKeyword>();
  for (const post of snapshot.posts) {
    for (const q of post.top_queries) {
      if (q.position > t.rankingTopPosition) continue;
      const existing = rankingMap.get(q.query);
      if (!existing || q.position < existing.position) {
        rankingMap.set(q.query, {
          query: q.query,
          position: q.position,
          impressions: q.impressions,
          url: post.url,
        });
      }
    }
  }
  const rankingKeywords = Array.from(rankingMap.values())
    .sort((a, b) => a.position - b.position);

  return {
    source_snapshot_date: snapshot.snapshot_date,
    top_performers: topPerformers,
    underperformers,
    striking_distance_posts: strikingDistance,
    ranking_keywords: rankingKeywords,
  };
}

function toRef(p: PostPerformance, note: string): PostPerfRef {
  return {
    url: p.url,
    target_keyword: p.target_keyword,
    pillar: p.pillar,
    days_live: p.days_live,
    clicks_30d: p.last_30d.clicks,
    impressions_30d: p.last_30d.impressions,
    avg_position: p.last_30d.avg_position,
    note,
  };
}

/**
 * Laad de meest recente snapshot uit `data/gsc-snapshots/<tenantSlug>/`. Returns
 * null wanneer er nog geen snapshots zijn voor deze tenant (eerste run, of
 * GSC nog niet gedraaid).
 */
export async function loadLatestSnapshot(
  tenantSlug: string,
  dataDir = "data"
): Promise<GscSnapshot | null> {
  const dir = path.join(dataDir, "gsc-snapshots", tenantSlug);
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return null;
  }
  const dated = files.filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  if (dated.length === 0) return null;
  const latest = dated[dated.length - 1]!;
  const raw = await readFile(path.join(dir, latest), "utf-8");
  return JSON.parse(raw) as GscSnapshot;
}
