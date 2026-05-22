import { z } from "zod";
import { runAgent } from "@/llm/runAgent";
import type { LLMProvider } from "@/llm/types";
import { AUDITOR_SYSTEM_PROMPT } from "./prompts/auditor.ts";

export const AuditorIssueSchema = z.object({
  severity: z.enum(["error", "warning", "suggestion"]),
  category: z.enum([
    "readability",
    "brand_voice",
    "seo",
    "structure",
    "originality",
    "factual",
  ]),
  message: z.string().min(3),
  quote: z.string().nullable(),
  suggested_rewrite: z.string().nullable(),
  /** 1 = fix first (highest impact), 5 = nice-to-have polish. */
  priority: z.number().int().min(1).max(5),
  /** Estimated points the weighted_total would gain if this issue is fixed.
   * Lets the UI surface a "fix-first ROI" list. */
  estimated_score_lift: z.number().min(0).max(5).optional(),
});

export const SerpGapSchema = z.object({
  /** Topic / subquery that the top-10 covers but the user's post does not. */
  topic: z.string().min(3),
  /** Domains in the top-10 that cover it — gives the user a concrete reference. */
  covered_by: z.array(z.string()).min(1).max(10),
  /** Why this matters for competitiveness on the target keyword. */
  rationale: z.string().min(10),
});

export const AuditorOutputSchema = z.object({
  scores: z.object({
    readability: z.number().min(0).max(10),
    originality: z.number().min(0).max(10),
    brand_voice: z.number().min(0).max(10),
    seo: z.number().min(0).max(10),
    structure: z.number().min(0).max(10),
    factual_clarity: z.number().min(0).max(10),
  }),
  weighted_total: z.number().min(0).max(10),
  issues: z.array(AuditorIssueSchema).min(0).max(30),
  summary: z.string().min(10),
  /** Fully rewritten version of the post applying the top issues. Optional —
   * the agent may skip this for tiny tweaks. When present, the UI offers a
   * "copy improved version" button. */
  improved_version: z.string().nullable().optional(),
  /** Bullet list of the 3-5 highest-impact things to fix first, in priority
   * order. The UI shows this prominently above the full issues list. */
  fix_first: z.array(z.string()).max(8).optional(),
  /** When serp_results is provided in the input, the auditor surfaces topics
   * the top-10 covers but the user's post misses — a competitive content
   * gap. Empty array when no SERP was supplied or no gaps found. */
  serp_gaps: z.array(SerpGapSchema).max(10).optional(),
  /** One-sentence positioning advice given the top-10 (e.g. "Top-10 leunt
   * zwaar op definitie-content; differentieer met een hands-on stappenplan
   * voor het MKB"). Only when serp_results is provided. */
  serp_positioning: z.string().nullable().optional(),
});

export type AuditorIssue = z.infer<typeof AuditorIssueSchema>;
export type SerpGap = z.infer<typeof SerpGapSchema>;
export type AuditorOutput = z.infer<typeof AuditorOutputSchema>;

export interface SerpResultForAuditor {
  rank: number;
  url: string;
  domain: string;
  title: string;
  description: string;
}

export interface AuditorInput {
  html: string;
  target_keyword: string;
  brand_voice: string;
  ban_list: string[];
  /** Optional top-10 SERP for the target keyword. When provided, the auditor
   * performs competitive gap analysis and fills serp_gaps + serp_positioning. */
  serp_results?: SerpResultForAuditor[];
}

export interface AuditorDeps {
  provider: LLMProvider;
  sleepImpl?: (ms: number) => Promise<void>;
}

export async function runAuditor(input: AuditorInput, deps: AuditorDeps) {
  // Phase 1 only: scores + issues + summary + fix_first + serp gaps/positioning.
  // De volledige `improved_version` rewrite zit nu in een aparte rewriter-agent
  // (src/agents/rewriter.ts) die alleen draait wanneer de gebruiker er expliciet
  // om vraagt. Reden: één call die ALLES doet liep tegen 24k output-tokens,
  // ~60s latency en chronische mid-string truncation. Splitsen geeft een snelle
  // audit (<15s, ~3k output) en een opt-in rewrite zonder de critic-pass te
  // belasten.
  return runAgent(
    {
      provider: deps.provider,
      systemPrompt: AUDITOR_SYSTEM_PROMPT,
      userPrompt: JSON.stringify(input, null, 2),
      model: "gemini-2.5-pro",
      maxTokens: 8000,
      temperature: 0.5,
      schema: AuditorOutputSchema,
    },
    deps.sleepImpl
  );
}
