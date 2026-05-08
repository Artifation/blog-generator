import { z } from "zod";
import { runAgent } from "@/llm/runAgent";
import { resolveAgentModel } from "@/llm/client";
import type { LLMProvider } from "@/llm/types";
import { FACT_CHECKER_SYSTEM_PROMPT } from "./prompts/factChecker.ts";

export const FactCheckerOutputSchema = z.object({
  verified_claims: z.array(z.object({ claim: z.string(), source_url: z.string().url() })),
  unverifiable_claims: z.array(z.object({ claim: z.string(), reason: z.string() })),
  fabricated_claims: z.array(z.object({ claim: z.string(), reason: z.string() })),
  verdict: z.enum(["pass", "fail"]),
});
export type FactCheckerOutput = z.infer<typeof FactCheckerOutputSchema>;

export interface FactCheckerInput {
  edited_html: string;
  key_facts: { claim: string; source_url: string }[];
}

export interface FactCheckerDeps {
  provider: LLMProvider;
  sleepImpl?: (ms: number) => Promise<void>;
}

export async function runFactChecker(input: FactCheckerInput, deps: FactCheckerDeps) {
  const model = resolveAgentModel("factChecker");
  return runAgent(
    {
      provider: deps.provider,
      systemPrompt: FACT_CHECKER_SYSTEM_PROMPT,
      userPrompt: JSON.stringify(input, null, 2),
      model: model.model,
      maxTokens: model.maxTokens,
      schema: FactCheckerOutputSchema,
    },
    deps.sleepImpl
  );
}
