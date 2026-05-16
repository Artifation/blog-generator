/**
 * Keyword-opportunity discovery — extraheert actiebare signalen uit GSC data.
 * Vervangt het keyword-research deel waar de vorige tool DataForSEO voor
 * gebruikte. De grote winst: in plaats van geaggregeerde markt-volumes te
 * kopen, kijken we naar wat *deze site* daadwerkelijk presteert. Dat geeft
 * specifieker en bruikbaarder signaal voor pillar-strategie en content-gaps.
 *
 * Vier signalen, pure functies op GscRow[]:
 *  - striking-distance: positie 8..20, hoge impressies → bijna ranking
 *  - rising:            impressies sterk gestegen tussen twee windows
 *  - decaying:          impressies sterk gedaald (content decay)
 *  - unmapped:          query waar nog geen topic voor bestaat (content gap)
 *
 * `scoreOpportunities` bundelt de signalen tot een geranked lijstje.
 */

import type { GscRow } from "./searchConsole";

// ---------------------------------------------------------------------------
// Striking distance
// ---------------------------------------------------------------------------

export interface StrikingDistanceOpts {
  minImpressions: number;
  minPosition?: number; // default 8
  maxPosition?: number; // default 20
}

export interface StrikingDistanceOpportunity {
  query: string;
  impressions: number;
  position: number;
  clicks: number;
}

export function findStrikingDistance(
  rows: GscRow[],
  opts: StrikingDistanceOpts
): StrikingDistanceOpportunity[] {
  const minPos = opts.minPosition ?? 8;
  const maxPos = opts.maxPosition ?? 20;

  return rows
    .filter((r) => {
      const q = r.keys[0];
      if (!q) return false;
      if (r.impressions < opts.minImpressions) return false;
      return r.position >= minPos && r.position <= maxPos;
    })
    .map((r) => ({
      query: r.keys[0]!,
      impressions: r.impressions,
      position: r.position,
      clicks: r.clicks,
    }))
    .sort((a, b) => b.impressions - a.impressions);
}

// ---------------------------------------------------------------------------
// Rising / decaying — compare two windows
// ---------------------------------------------------------------------------

export interface RisingQueriesOpts {
  minGrowth: number;       // absolute impression growth required
  minGrowthPct: number;    // relative growth required (% of previous, or % of current for new queries)
}

export interface RisingQueryOpportunity {
  query: string;
  impressions: number;
  growth: number;     // current.impressions - previous.impressions
  growthPct: number;  // 0..∞
}

function indexByQuery(rows: GscRow[]): Map<string, GscRow> {
  const m = new Map<string, GscRow>();
  for (const r of rows) {
    const q = r.keys[0];
    if (q) m.set(q, r);
  }
  return m;
}

export function findRisingQueries(
  current: GscRow[],
  previous: GscRow[],
  opts: RisingQueriesOpts
): RisingQueryOpportunity[] {
  const prevIdx = indexByQuery(previous);
  const out: RisingQueryOpportunity[] = [];

  for (const r of current) {
    const q = r.keys[0];
    if (!q) continue;

    const prev = prevIdx.get(q);
    const prevImpr = prev?.impressions ?? 0;
    const growth = r.impressions - prevImpr;

    if (growth < opts.minGrowth) continue;

    // For brand-new queries (prevImpr === 0), growthPct is undefined in the
    // strict ratio sense. We treat them as rising when growth alone clears
    // minGrowth, regardless of pct.
    const growthPct = prevImpr === 0 ? Infinity : (growth / prevImpr) * 100;
    if (prevImpr > 0 && growthPct < opts.minGrowthPct) continue;

    out.push({ query: q, impressions: r.impressions, growth, growthPct });
  }

  return out.sort((a, b) => b.growth - a.growth);
}

export interface DecayingQueriesOpts {
  minDropPct: number;             // relative drop required (% of previous)
  minPreviousImpressions: number; // ignore noise — queries that never had real volume
}

export interface DecayingQueryOpportunity {
  query: string;
  previousImpressions: number;
  currentImpressions: number;
  dropPct: number;
}

export function findDecayingQueries(
  current: GscRow[],
  previous: GscRow[],
  opts: DecayingQueriesOpts
): DecayingQueryOpportunity[] {
  const curIdx = indexByQuery(current);
  const out: DecayingQueryOpportunity[] = [];

  for (const r of previous) {
    const q = r.keys[0];
    if (!q) continue;
    if (r.impressions < opts.minPreviousImpressions) continue;

    const cur = curIdx.get(q);
    const curImpr = cur?.impressions ?? 0;
    const drop = r.impressions - curImpr;
    if (drop <= 0) continue;

    const dropPct = (drop / r.impressions) * 100;
    if (dropPct < opts.minDropPct) continue;

    out.push({
      query: q,
      previousImpressions: r.impressions,
      currentImpressions: curImpr,
      dropPct,
    });
  }

  return out.sort((a, b) => b.dropPct - a.dropPct);
}

// ---------------------------------------------------------------------------
// Unmapped — queries with no existing topic targeting them
// ---------------------------------------------------------------------------

export interface UnmappedQueriesOpts {
  minImpressions: number;
}

export interface ExistingTopicRef {
  target_keyword: string;
  title: string;
}

export interface UnmappedQueryOpportunity {
  query: string;
  impressions: number;
  position: number;
}

// Stopwords skipped during token overlap. Kept tiny — bigger lists cause
// false positives ("voor advocaten" → ["advocaten"] matches anything with that
// noun). Two languages because the tool targets NL+EN sites.
const STOPWORDS_NL_EN = new Set([
  "de", "het", "een", "en", "of", "is", "van", "voor", "in", "op",
  "the", "a", "an", "and", "or", "is", "of", "for", "in", "on", "to",
]);

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((t) => t.length >= 2 && !STOPWORDS_NL_EN.has(t));
}

/**
 * A query is "unmapped" when no existing topic covers it. We match via token
 * overlap: every significant token from the query must appear in either the
 * topic's target_keyword or title. This catches paraphrases like
 * "ai voor advocaten" → "AI-strategie voor advocaten" that a strict substring
 * check would miss, while still rejecting unrelated topics.
 */
export function findUnmappedQueries(
  rows: GscRow[],
  existingTopics: ExistingTopicRef[],
  opts: UnmappedQueriesOpts
): UnmappedQueryOpportunity[] {
  const topicTokenSets = existingTopics.map(
    (t) => new Set([...tokenize(t.target_keyword), ...tokenize(t.title)])
  );

  const isCovered = (query: string): boolean => {
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) return true; // pure stopwords — ignore
    return topicTokenSets.some((set) => queryTokens.every((t) => set.has(t)));
  };

  return rows
    .filter((r) => {
      const q = r.keys[0];
      if (!q) return false;
      if (r.impressions < opts.minImpressions) return false;
      return !isCovered(q);
    })
    .map((r) => ({
      query: r.keys[0]!,
      impressions: r.impressions,
      position: r.position,
    }))
    .sort((a, b) => b.impressions - a.impressions);
}

// ---------------------------------------------------------------------------
// Score & merge
// ---------------------------------------------------------------------------

export type OpportunitySignal = "striking_distance" | "rising" | "unmapped";

export interface ScoredOpportunity {
  query: string;
  impressions: number;
  signals: OpportunitySignal[];
  rationale: string;
}

export interface ScoreOpportunitiesInput {
  strikingDistance: StrikingDistanceOpportunity[];
  rising: RisingQueryOpportunity[];
  unmapped: UnmappedQueryOpportunity[];
}

export function scoreOpportunities(input: ScoreOpportunitiesInput): ScoredOpportunity[] {
  const map = new Map<string, { impressions: number; signals: Set<OpportunitySignal>; reasons: string[] }>();

  function add(query: string, impressions: number, signal: OpportunitySignal, reason: string) {
    const existing = map.get(query);
    if (existing) {
      existing.signals.add(signal);
      existing.reasons.push(reason);
      existing.impressions = Math.max(existing.impressions, impressions);
    } else {
      map.set(query, { impressions, signals: new Set([signal]), reasons: [reason] });
    }
  }

  for (const sd of input.strikingDistance) {
    add(
      sd.query,
      sd.impressions,
      "striking_distance",
      `Positie ${sd.position.toFixed(1)} bij ${sd.impressions} impressies — kans om binnen page 1 te komen`
    );
  }
  for (const r of input.rising) {
    add(
      r.query,
      r.impressions,
      "rising",
      `Impressies +${r.growth} (${Number.isFinite(r.growthPct) ? r.growthPct.toFixed(0) : "nieuw"}%) tussen windows — stijgende interesse`
    );
  }
  for (const u of input.unmapped) {
    add(
      u.query,
      u.impressions,
      "unmapped",
      `${u.impressions} impressies maar geen bestaand topic — content-gap`
    );
  }

  return [...map.entries()]
    .map(([query, v]) => ({
      query,
      impressions: v.impressions,
      signals: [...v.signals],
      rationale: v.reasons.join(" | "),
    }))
    .sort((a, b) => {
      // First by number of signals (more = stronger evidence), then by impressions.
      if (b.signals.length !== a.signals.length) return b.signals.length - a.signals.length;
      return b.impressions - a.impressions;
    });
}
