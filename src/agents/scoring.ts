/**
 * Gedeelde scoring-utilities voor auditor + qualityJudge + UI.
 *
 * Eerdere staat: zowel `apps/web/app/audit/audit-form.tsx` als de drafts-UI
 * en mailtemplates definieerden zélf `scoreColor`, `verdictLabel`, en
 * threshold-constanten. Drift tussen "audit toont groen ≥ 8" en "draft toont
 * groen ≥ 7.5" is een bug die niemand merkt — maar wel verwarrend is voor
 * de gebruiker die dezelfde post in twee UI's andere kleuren ziet krijgen.
 *
 * Deze module is de single source of truth. Geen LLM, geen runtime side
 * effects — pure constants + functies.
 */

/** Score-thresholds: bepalen kleur + verdict-label in alle UI's. */
export const SCORE_THRESHOLDS = {
  /** ≥ deze score wordt groen / "publiceer-klaar". */
  good: 8,
  /** ≥ deze score wordt oranje / "kleine fixes nodig". */
  ok: 6,
} as const;

/** Verdict-banden gebruikt door auditor-UI en draft-UI. */
export const VERDICT_BANDS = [
  { min: 8.5, label: "Klaar om te publiceren" },
  { min: 7.0, label: "Bijna goed — kleine fixes" },
  { min: 5.0, label: "Substantiële revisie nodig" },
  { min: 0, label: "Herschrijven aanbevolen" },
] as const;

/** Brand-agnostic color tokens — UI's mappen ze op CSS variables. */
export const SCORE_COLORS = {
  good: "#047857",   // groen
  ok: "#b45309",     // oranje
  bad: "#b91c1c",    // rood
} as const;

/** Soft (10% alpha) achtergrond-varianten voor inline highlights. */
export const SCORE_COLORS_SOFT = {
  good: "rgba(4,120,87,0.10)",
  ok: "rgba(180,83,9,0.10)",
  bad: "rgba(185,28,28,0.10)",
} as const;

export function scoreColor(value: number): string {
  if (value >= SCORE_THRESHOLDS.good) return SCORE_COLORS.good;
  if (value >= SCORE_THRESHOLDS.ok) return SCORE_COLORS.ok;
  return SCORE_COLORS.bad;
}

export function scoreColorSoft(value: number): string {
  if (value >= SCORE_THRESHOLDS.good) return SCORE_COLORS_SOFT.good;
  if (value >= SCORE_THRESHOLDS.ok) return SCORE_COLORS_SOFT.ok;
  return SCORE_COLORS_SOFT.bad;
}

export function verdictLabel(weightedTotal: number): string {
  return VERDICT_BANDS.find((b) => weightedTotal >= b.min)!.label;
}

export function clampScore(n: number): number {
  return Math.max(0, Math.min(10, n));
}

/**
 * Gewichten gebruikt door de auditor-prompt (6-dim review). Identiek aan de
 * comment in `src/agents/prompts/auditor.ts`. Hier centraal zodat een
 * gewichtsverandering 1x landt i.p.v. in twee plekken te driften.
 */
export const AUDITOR_WEIGHTS = {
  readability: 0.20,
  originality: 0.20,
  brand_voice: 0.20,
  seo: 0.15,
  structure: 0.15,
  factual_clarity: 0.10,
} as const;

export type AuditorDimension = keyof typeof AUDITOR_WEIGHTS;

/** Aliases die de UI gebruikt om scores label te geven. */
export const AUDITOR_LABELS: Record<AuditorDimension, string> = {
  readability: "Leesbaarheid",
  originality: "Originaliteit",
  brand_voice: "Brand voice",
  seo: "SEO",
  structure: "Structuur",
  factual_clarity: "Feiten-helderheid",
};

/**
 * Bereken het gewogen totaal uit een set scores. Gebruikt door tests + de
 * audit-UI om "potentieel-na-fixes" projecties te valideren tegen wat de
 * agent zelf returnt (sanity-check tegen drift).
 */
export function weightedTotalFromScores(scores: Record<AuditorDimension, number>): number {
  let total = 0;
  for (const [k, w] of Object.entries(AUDITOR_WEIGHTS) as [AuditorDimension, number][]) {
    total += (scores[k] ?? 0) * w;
  }
  return total;
}
