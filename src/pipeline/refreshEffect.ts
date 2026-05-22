/**
 * Computes the "did this refresh work?" delta from the `before_snapshot`
 * captured at refresh-trigger time and the current GSC metrics for the post.
 * Pure data-transformation — caller supplies both halves.
 */

export interface RefreshBeforeMetrics {
  clicks_30d?: number;
  impressions_30d?: number;
  avg_position?: number;
  top_queries?: string[];
}

export interface RefreshCurrentMetrics {
  clicks_30d: number;
  impressions_30d: number;
  avg_position: number;
}

export type RefreshEffectVerdict =
  | "improved"
  | "regressed"
  | "neutral"
  | "too_early"
  | "no_data";

export interface RefreshEffect {
  verdict: RefreshEffectVerdict;
  clicksDelta: number | null;
  impressionsDelta: number | null;
  /** Negative = ranking improved (lower position = better). */
  positionDelta: number | null;
  /** Days between refresh-trigger and "now" — used to flag too-early reads. */
  daysSinceRefresh: number;
}

export interface ComputeRefreshEffectOpts {
  before: RefreshBeforeMetrics | null;
  current: RefreshCurrentMetrics | null;
  triggeredAt: string;   // ISO timestamp
  now?: Date;
  /** Days after refresh before GSC data is considered meaningful. Default 30. */
  meaningfulAfterDays?: number;
  /** Position delta magnitude that counts as "neutral" (within noise). Default 0.5. */
  positionNoiseTolerance?: number;
  /** Clicks delta magnitude (absolute) that counts as "neutral". Default 2. */
  clicksNoiseTolerance?: number;
}

export function computeRefreshEffect(opts: ComputeRefreshEffectOpts): RefreshEffect {
  const now = opts.now ?? new Date();
  const triggered = new Date(opts.triggeredAt);
  const daysSinceRefresh = Math.floor(
    (now.getTime() - triggered.getTime()) / 86_400_000
  );
  const meaningful = opts.meaningfulAfterDays ?? 30;
  const posTol = opts.positionNoiseTolerance ?? 0.5;
  const clicksTol = opts.clicksNoiseTolerance ?? 2;

  if (!opts.before || !opts.current) {
    return {
      verdict: "no_data",
      clicksDelta: null,
      impressionsDelta: null,
      positionDelta: null,
      daysSinceRefresh,
    };
  }

  const clicksDelta =
    opts.before.clicks_30d != null
      ? opts.current.clicks_30d - opts.before.clicks_30d
      : null;
  const impressionsDelta =
    opts.before.impressions_30d != null
      ? opts.current.impressions_30d - opts.before.impressions_30d
      : null;
  const positionDelta =
    opts.before.avg_position != null
      ? opts.current.avg_position - opts.before.avg_position
      : null;

  if (daysSinceRefresh < meaningful) {
    return {
      verdict: "too_early",
      clicksDelta,
      impressionsDelta,
      positionDelta,
      daysSinceRefresh,
    };
  }

  // Score: position is the primary signal (intentional refresh goal).
  // Clicks back it up. Impressions alone don't determine verdict (could
  // indicate Google testing a higher position even before clicks follow).
  let score = 0;
  if (positionDelta != null) {
    if (positionDelta < -posTol) score += 2;        // improved
    else if (positionDelta > posTol) score -= 2;
  }
  if (clicksDelta != null) {
    if (clicksDelta > clicksTol) score += 1;
    else if (clicksDelta < -clicksTol) score -= 1;
  }

  const verdict: RefreshEffectVerdict =
    score >= 1 ? "improved" : score <= -1 ? "regressed" : "neutral";

  return {
    verdict,
    clicksDelta,
    impressionsDelta,
    positionDelta,
    daysSinceRefresh,
  };
}
