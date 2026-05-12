import { z } from "zod";
import { runAgent } from "@/llm/runAgent";
import { resolveAgentModel } from "@/llm/client";
import type { LLMProvider } from "@/llm/types";
import type { StrategistOutput } from "./strategist.ts";
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
}

export interface WriterDeps {
  provider: LLMProvider;
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
  const model = resolveAgentModel("writer");
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let last: WriterOutput | undefined;
  let iterations = 0;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    iterations++;
    const userPrompt =
      i === 0
        ? JSON.stringify(
            { outline: input.outline, contrarian_hint: input.contrarian_hint, key_facts: input.key_facts },
            null,
            2
          )
        : JSON.stringify(
            {
              outline: input.outline,
              contrarian_hint: input.contrarian_hint,
              key_facts: input.key_facts,
              previous_draft: last?.draft_html,
              previous_critique: last?.self_critique,
              instruction:
                "Verbeter de vorige draft op basis van de critique. Behoud structuur, fix de issues. Gebruik alleen statistieken uit key_facts.",
            },
            null,
            2
          );

    const r = await runAgent(
      {
        provider: deps.provider,
        systemPrompt: WRITER_SYSTEM_PROMPT(input.brand_voice, input.ban_list),
        userPrompt,
        model: model.model,
        maxTokens: model.maxTokens,
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
