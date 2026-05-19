import { z } from "zod";
import { runAgent } from "@/llm/runAgent";
import { resolveAgentModel } from "@/llm/client";
import type { LLMProvider } from "@/llm/types";
import type { RubricSignals } from "@/pipeline/rubric";
import { QUALITY_JUDGE_SYSTEM_PROMPT } from "./prompts/qualityJudge.ts";

export const QualityJudgeOutputSchema = z.object({
  scores: z.object({
    semantic_completeness: z.number().min(0).max(10),
    originality: z.number().min(0).max(10),
    anti_ai_cliche: z.number().min(0).max(10),
    fact_check: z.number().min(0).max(10),
    seo_meta: z.number().min(0).max(10),
    seo_schema: z.number().min(0).max(10),
    brand_voice: z.number().min(0).max(10),
    readability: z.number().min(0).max(10),
  }),
  weighted_total: z.number().min(0).max(10),
  hard_fails: z.array(z.string()),
  verdict: z.enum(["GO", "NO-GO"]),
  reasoning: z.string(),
  improvement_suggestions: z.array(z.string()),
});
export type QualityJudgeOutput = z.infer<typeof QualityJudgeOutputSchema>;

export interface QualityJudgeInput {
  edited_html: string;
  target_keyword: string;
  /** Pillar van het topic — drijft pillar-bias in readability-mapping (legal/compliance
   * pillars krijgen ruimere Flesch-bandbreedte omdat NL juridische vocabulair onvermijdbaar
   * lange woorden bevat). */
  pillar?: string;
  deterministic_signals: RubricSignals;
  fact_check_verdict: "pass" | "fail";
  fabricated_claims_count: number;
  /** Apart aangeleverd; meta-velden zitten NIET in edited_html (gaan via WP post-meta). */
  meta_fields?: {
    meta_title: string;
    meta_description: string;
    slug: string;
    alt_texts?: string[];
  };
}

export interface QualityJudgeDeps {
  provider: LLMProvider;
  sleepImpl?: (ms: number) => Promise<void>;
}

export async function runQualityJudge(input: QualityJudgeInput, deps: QualityJudgeDeps) {
  const model = resolveAgentModel("qualityJudge");
  return runAgent(
    {
      provider: deps.provider,
      systemPrompt: QUALITY_JUDGE_SYSTEM_PROMPT,
      userPrompt: JSON.stringify(input, null, 2),
      model: model.model,
      maxTokens: model.maxTokens,
      schema: QualityJudgeOutputSchema,
    },
    deps.sleepImpl
  );
}
