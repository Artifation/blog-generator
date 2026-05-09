import { z } from "zod";
import { runAgent } from "@/llm/runAgent";
import { resolveAgentModel } from "@/llm/client";
import type { LLMProvider } from "@/llm/types";
import type { ResearchOutput } from "./researcher.ts";
import { STRATEGIST_SYSTEM_PROMPT } from "./prompts/strategist.ts";

export const StrategistOutputSchema = z.object({
  outline: z.object({
    h1_suggestion: z.string().max(80),
    tldr_one_liner: z.string().max(180),
    tldr_direct_answer_40_60w: z.string().min(40).max(180),
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
}

export interface StrategistDeps {
  provider: LLMProvider;
  sleepImpl?: (ms: number) => Promise<void>;
}

export async function runStrategist(input: StrategistInput, deps: StrategistDeps) {
  const model = resolveAgentModel("strategist");
  return runAgent(
    {
      provider: deps.provider,
      systemPrompt: STRATEGIST_SYSTEM_PROMPT,
      userPrompt: JSON.stringify(input, null, 2),
      model: model.model,
      maxTokens: model.maxTokens,
      schema: StrategistOutputSchema,
    },
    deps.sleepImpl
  );
}
