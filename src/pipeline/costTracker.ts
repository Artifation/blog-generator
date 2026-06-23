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
