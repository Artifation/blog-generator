import type { LLMProviderName } from "@/llm/types";

export interface UsageEntry {
  provider: LLMProviderName;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface CostBreakdownEntry extends UsageEntry {
  costUsd: number;
}

export interface CostResult {
  totalUsd: number;
  breakdown: CostBreakdownEntry[];
}

interface PriceTier {
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
}

const PRICES: Record<string, PriceTier> = {
  "claude-opus-4-7": { inputUsdPerMillion: 5, outputUsdPerMillion: 25 },
  "claude-sonnet-4-6": { inputUsdPerMillion: 3, outputUsdPerMillion: 15 },
  "claude-haiku-4-5-20251001": { inputUsdPerMillion: 1, outputUsdPerMillion: 5 },
  "gemini-2.5-pro": { inputUsdPerMillion: 1.25, outputUsdPerMillion: 10 },
  // Fallback model used when the registry downshifts from pro — was missing,
  // so its runs were costed at $0 and silently undercounted spend.
  "gemini-2.5-flash": { inputUsdPerMillion: 0.3, outputUsdPerMillion: 2.5 },
  "llama-3.3-70b-versatile": { inputUsdPerMillion: 0, outputUsdPerMillion: 0 },
};

// Surface (once per model id) any model that isn't priced, instead of silently
// charging $0 — that hid both new fallback models and date-suffixed ids.
const _warnedUnpriced = new Set<string>();

export function computeRunCost(usage: UsageEntry[]): CostResult {
  const breakdown = usage.map((u) => {
    const p = PRICES[u.model];
    if (!p && !_warnedUnpriced.has(u.model)) {
      _warnedUnpriced.add(u.model);
      console.warn(
        JSON.stringify({ stage: "costTracker", warning: "no price tier for model — costed at $0", model: u.model }),
      );
    }
    const tier = p ?? { inputUsdPerMillion: 0, outputUsdPerMillion: 0 };
    const costUsd =
      (u.inputTokens * tier.inputUsdPerMillion + u.outputTokens * tier.outputUsdPerMillion) / 1_000_000;
    return { ...u, costUsd };
  });
  return {
    totalUsd: breakdown.reduce((s, e) => s + e.costUsd, 0),
    breakdown,
  };
}

/**
 * Hard spend guardrails. Two opt-in, env-configured ceilings (unset = no cap,
 * so default behaviour is unchanged):
 *   MAX_RUN_USD    — abort a single run once its accumulated LLM/image spend
 *                    crosses this, so a retry-storm / looping topic can't run up
 *                    unbounded cost.
 *   MAX_WEEKLY_USD — refuse to START a run for a site whose rolling 7-day spend
 *                    already meets this, alongside the post-count cap.
 */
export class CostBudgetExceededError extends Error {
  readonly kind: "run" | "weekly";
  readonly spentUsd: number;
  readonly limitUsd: number;
  constructor(kind: "run" | "weekly", spentUsd: number, limitUsd: number) {
    super(
      `Cost ${kind} budget exceeded: spent $${spentUsd.toFixed(4)} exceeds limit $${limitUsd.toFixed(2)}`,
    );
    this.name = "CostBudgetExceededError";
    this.kind = kind;
    this.spentUsd = spentUsd;
    this.limitUsd = limitUsd;
  }
}

/** Parse a USD limit from env. Unset/blank/non-numeric/non-positive → null (no cap). */
export function parseUsdLimit(raw: string | undefined | null): number | null {
  if (raw == null || raw.trim() === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/** Throw once accumulated run cost strictly exceeds the ceiling (null = no cap). */
export function assertRunBudget(usage: UsageEntry[], limitUsd: number | null): void {
  if (limitUsd == null) return;
  const spent = computeRunCost(usage).totalUsd;
  if (spent > limitUsd) {
    throw new CostBudgetExceededError("run", spent, limitUsd);
  }
}

/** True when a site's rolling 7-day spend already meets the weekly cap (null = no cap). */
export function exceedsWeeklyBudget(spentUsdLast7Days: number, limitUsd: number | null): boolean {
  if (limitUsd == null) return false;
  return spentUsdLast7Days >= limitUsd;
}

/**
 * Fixed EUR→USD rate for the budget caps. Deliberately a constant, not a live
 * FX lookup: these are safety guardrails on cents-per-post amounts, not billing.
 * Change here if the rate drifts materially.
 */
export const USD_PER_EUR = 1.08;

export const eurToUsd = (eur: number): number => eur * USD_PER_EUR;
export const usdToEur = (usd: number): number => usd / USD_PER_EUR;

/**
 * Resolve the effective **USD** cap from a per-site euro value + an env USD
 * fallback. A positive per-site euro cap wins (converted to USD); otherwise the
 * env cap (`parseUsdLimit` → null when blank/invalid/≤0); both empty → null (no
 * cap). A per-site 0/negative is treated as "unset" so it can't silently block
 * every run — clearing the field (null) and entering 0 both fall back to env.
 */
export function effectiveUsdCap(
  perSiteEur: number | null | undefined,
  envUsd: string | undefined,
): number | null {
  if (perSiteEur != null && perSiteEur > 0) return eurToUsd(perSiteEur);
  return parseUsdLimit(envUsd);
}

export interface RollingCounter {
  totalUsdLast7Days: number;
  history: { dateIso: string; costUsd: number }[];
}

export function appendRunCost(counter: RollingCounter, costUsd: number, now: Date): RollingCounter {
  const history = [...counter.history, { dateIso: now.toISOString(), costUsd }];
  const cutoff = new Date(now.getTime() - 7 * 86400_000);
  const recent = history.filter((h) => new Date(h.dateIso) >= cutoff);
  return {
    totalUsdLast7Days: recent.reduce((s, h) => s + h.costUsd, 0),
    history: recent,
  };
}
