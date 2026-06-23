import { z } from "zod";
import { runAgent } from "@/llm/runAgent";
import type { AgentModelChoice } from "@/llm/client";
import type { LLMProvider } from "@/llm/types";
import type { ResearchOutput } from "./researcher.ts";
import { STRATEGIST_SYSTEM_PROMPT } from "./prompts/strategist.ts";
import type { AnchorHistoryEntry } from "@/pipeline/anchorTracker";

export const StrategistOutputSchema = z.object({
  outline: z.object({
    h1_suggestion: z.string().max(80),
    tldr_one_liner: z.string().max(180),
    tldr_direct_answer_40_60w: z.string().min(200).max(500),
    tldr_summary_134_words: z.string().min(100),
    h2_chunks: z
      .array(
        z.object({
          h2: z.string(),
          subquestion_answered: z.string(),
          intended_word_count: z.number().min(150).max(400),
          must_include: z.array(z.string()).min(1),
          h3s: z.array(z.string()).default([]),
        })
      )
      .min(5)
      .max(9),
    internal_links_to_inject: z.array(z.object({ url: z.string().url(), anchor: z.string() })).min(3),
    external_links_to_cite: z.array(z.string().url()),
    schema_choices: z.array(z.string()).min(1),
    faq_block: z.array(z.object({ q: z.string(), a_short: z.string() })).max(5),
  }),
  anchor_distribution: z.object({
    exact_match_pct: z.number(),
    partial_pct: z.number(),
    semantic_pct: z.number(),
  }),
  contrarian_opinion_hint: z.string(),
});
export type StrategistOutput = z.infer<typeof StrategistOutputSchema>;

export interface StrategistInput {
  research: ResearchOutput;
  brand_voice: string;
  target_keyword: string;
  intent?: "informational" | "commercial" | "transactional";
  intended_word_count_target?: number;
  anchor_history?: AnchorHistoryEntry[];
  /** User-supplied per-topic guidance (e.g. "focus op compliance", "noem
   * product X", "gebruik casus klant Y"). The strategist must let this shape
   * the outline (sections, angles, what to emphasize) on top of the research. */
  custom_instructions?: string;
  /** Top-10 live SERP-resultaten van DataForSEO. Strategist gebruikt deze om
   * outline te baseren op wat feitelijk rankt — niet alleen op LLM-intuïtie. */
  serp_results?: { rank: number; url: string; domain: string; title: string; description: string }[];
  /** Eigen GSC-feedback uit gepubliceerde posts (zie gscPerformanceInsights).
   * Strategist gebruikt dit om: (1) outline-secties te plannen die complementair
   * zijn aan top performers (geen kannibalisatie), (2) gaps te identificeren
   * tussen wat we al ranken en wat de SERP nog vraagt. */
  performance_signals?: {
    top_performers: { url: string; target_keyword: string; clicks_30d: number; note: string }[];
    ranking_keywords: { query: string; position: number; url: string }[];
  };
}

export interface StrategistDeps {
  provider: LLMProvider;
  model: AgentModelChoice;
  sleepImpl?: (ms: number) => Promise<void>;
}

export async function runStrategist(input: StrategistInput, deps: StrategistDeps) {
  return runAgent(
    {
      provider: deps.provider,
      systemPrompt: STRATEGIST_SYSTEM_PROMPT,
      userPrompt: JSON.stringify(input, null, 2),
      model: deps.model.model,
      maxTokens: deps.model.maxTokens,
      // Lagere temperature — strategist returnt complexe geneste JSON; bij
      // default 1.0 verlies de LLM soms halverwege de JSON-syntax (klassieke
      // "unquoted property name"-fout op positie ~4000).
      temperature: 0.3,
      schema: StrategistOutputSchema,
    },
    deps.sleepImpl
  );
}
