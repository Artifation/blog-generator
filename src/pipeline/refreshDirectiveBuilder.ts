/**
 * Converts a RefreshOpportunity into the AuditorIssue[] + fix_first shape
 * the rewriter agent expects. Pure transformation — no LLM, no IO. Kept
 * separate so it can be unit-tested without the rewriter or DB.
 */
import type { AuditorIssue } from "@/agents/auditor";
import type { RefreshOpportunity, RefreshCategory } from "./refreshOpportunities.ts";

export interface BuiltRewriterInputs {
  issues: AuditorIssue[];
  fix_first: string[];
}

const CATEGORY_SEVERITY: Record<RefreshCategory, AuditorIssue["severity"]> = {
  decaying: "error",
  striking_distance: "warning",
  stagnant_evergreen: "warning",
  freshness_overdue: "suggestion",
};

const CATEGORY_AUDIT_CATEGORY: Record<RefreshCategory, AuditorIssue["category"]> = {
  decaying: "seo",
  striking_distance: "seo",
  stagnant_evergreen: "readability",
  freshness_overdue: "factual",
};

const CATEGORY_HEADLINE: Record<RefreshCategory, string> = {
  decaying: "Reclaim lost ranking — position has decayed since publish",
  striking_distance: "Push to page 1 — currently within striking distance",
  stagnant_evergreen: "Earn the click — impressions exist but CTR is near zero",
  freshness_overdue: "Refresh for freshness — verify stats, dates and links",
};

export function buildRewriterInputsFromOpportunity(
  opp: RefreshOpportunity
): BuiltRewriterInputs {
  const severity = CATEGORY_SEVERITY[opp.category];
  const category = CATEGORY_AUDIT_CATEGORY[opp.category];

  const issues: AuditorIssue[] = opp.directives.map((directive, idx) => ({
    severity,
    category,
    message: directive,
    quote: null,
    suggested_rewrite: null,
    priority: idx === 0 ? 1 : 2,
  }));

  const fix_first = [
    CATEGORY_HEADLINE[opp.category],
    opp.rationale,
  ];

  return { issues, fix_first };
}
