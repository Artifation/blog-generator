import { z } from "zod";
import { runAgent } from "@/llm/runAgent";
import type { AgentModelChoice } from "@/llm/client";
import type { LLMProvider } from "@/llm/types";
import type { StrategistOutput } from "./strategist.ts";
import type { OriginalityAnchor } from "./researcher.ts";
import { WRITER_SYSTEM_PROMPT } from "./prompts/writer.ts";

export const WriterOutputSchema = z.object({
  draft_html: z.string().min(500),
  self_score: z.number().min(0).max(10),
  self_critique: z.string(),
});
export type WriterOutput = z.infer<typeof WriterOutputSchema>;

export interface WriterInput {
  outline: StrategistOutput["outline"];
  brand_voice: string;
  ban_list: string[];
  contrarian_hint: string;
  /** Researcher's verifieerbare feiten met source_url. Writer mag SPECIFIEKE
   * statistieken/percentages/jaartallen ALLEEN uit deze lijst halen. */
  key_facts: { claim: string; source_url: string }[];
  /** Concrete NL-MKB case (real of hypothetisch) — Writer moet 'm 1x inline citeren. */
  originality_anchor?: OriginalityAnchor;
  /** User-supplied per-topic guidance threaded from the strategist. Writer
   * must honour these directly (specific brand asks, audience focus, things to
   * mention or avoid) on top of the outline. */
  custom_instructions?: string;
  /** Fabricated claims from a prior rejected draft of this same topic. When
   * present, the writer must explicitly NOT reproduce these (verbatim or
   * paraphrased) — they were already flagged by the factChecker as unsourced.
   * This closes the feedback loop so retries don't repeat the same mistakes. */
  previous_fabricated_claims?: string[];
}

export interface WriterDeps {
  provider: LLMProvider;
  model: AgentModelChoice;
  sleepImpl?: (ms: number) => Promise<void>;
}

export interface WriterResult {
  parsed: WriterOutput;
  iterations: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}

const SELF_SCORE_THRESHOLD = 7;
const MAX_ITERATIONS = 3;

export async function runWriter(input: WriterInput, deps: WriterDeps): Promise<WriterResult> {
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let last: WriterOutput | undefined;
  let iterations = 0;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    iterations++;
    const userPrompt =
      i === 0
        ? JSON.stringify(
            {
              outline: input.outline,
              contrarian_hint: input.contrarian_hint,
              key_facts: input.key_facts,
              originality_anchor: input.originality_anchor,
              custom_instructions: input.custom_instructions,
              previous_fabricated_claims: input.previous_fabricated_claims,
            },
            null,
            2
          )
        : JSON.stringify(
            {
              outline: input.outline,
              contrarian_hint: input.contrarian_hint,
              key_facts: input.key_facts,
              originality_anchor: input.originality_anchor,
              custom_instructions: input.custom_instructions,
              previous_fabricated_claims: input.previous_fabricated_claims,
              previous_draft: last?.draft_html,
              previous_critique: last?.self_critique,
              instruction:
                "Verbeter de vorige draft op basis van de critique. Behoud structuur, fix de issues. Gebruik alleen statistieken uit key_facts. Behoud de originality_anchor-citatie of voeg toe als die ontbreekt. Volg custom_instructions strikt als die meegegeven zijn. Vermijd previous_fabricated_claims volledig.",
            },
            null,
            2
          );

    const r = await runAgent(
      {
        provider: deps.provider,
        systemPrompt: WRITER_SYSTEM_PROMPT(input.brand_voice, input.ban_list),
        userPrompt,
        model: deps.model.model,
        maxTokens: deps.model.maxTokens,
        temperature: 1.0 - i * 0.1,
        schema: WriterOutputSchema,
      },
      deps.sleepImpl
    );

    totalInputTokens += r.raw.inputTokens;
    totalOutputTokens += r.raw.outputTokens;
    last = r.parsed;

    if (r.parsed.self_score >= SELF_SCORE_THRESHOLD) break;
  }

  return { parsed: last!, iterations, totalInputTokens, totalOutputTokens };
}
