import { z } from "zod";
import { runAgent } from "@/llm/runAgent";
import type { AgentModelChoice } from "@/llm/client";
import type { LLMProvider } from "@/llm/types";
import type { OriginalityAnchor } from "./researcher.ts";
import { FACT_CHECKER_SYSTEM_PROMPT } from "./prompts/factChecker.ts";

export const FactCheckerOutputSchema = z.object({
  verified_claims: z.array(z.object({ claim: z.string(), source_url: z.string().url() })),
  unverifiable_claims: z.array(
    z.object({
      claim: z.string(),
      reason: z.string(),
      /** Voorgestelde kwalitatieve herformulering die de claim verwijdert of
       * generaliseert. Optioneel; alleen wanneer een fix mogelijk is zonder
       * de strekking van de zin te verliezen. */
      suggested_rewrite: z.string().optional(),
    })
  ),
  fabricated_claims: z.array(
    z.object({
      claim: z.string(),
      reason: z.string(),
      /** Concrete vervanging zonder verzonnen cijfers/namen — kwalitatieve
       * frasering die de claim wegneemt. De writer-retry-loop én reject-email
       * gebruiken dit om de gebruiker / writer te helpen de fout te corrigeren
       * zonder een nieuwe hallucinatie te introduceren. */
      suggested_rewrite: z.string().optional(),
    })
  ),
  verdict: z.enum(["pass", "fail"]),
});
export type FactCheckerOutput = z.infer<typeof FactCheckerOutputSchema>;

export interface FactCheckerInput {
  edited_html: string;
  key_facts: { claim: string; source_url: string }[];
  /** When the researcher provided a hypothetical_scenario anchor, the writer
   * is authorised to use its industry+region+situation+outcome specifics —
   * these should NOT be flagged as fabricated. Pass-through so the
   * fact-checker can recognise legitimate hypothetical content. */
  originality_anchor?: OriginalityAnchor;
}

export interface FactCheckerDeps {
  provider: LLMProvider;
  model: AgentModelChoice;
  sleepImpl?: (ms: number) => Promise<void>;
}

export async function runFactChecker(input: FactCheckerInput, deps: FactCheckerDeps) {
  return runAgent(
    {
      provider: deps.provider,
      systemPrompt: FACT_CHECKER_SYSTEM_PROMPT,
      userPrompt: JSON.stringify(input, null, 2),
      model: deps.model.model,
      maxTokens: deps.model.maxTokens,
      schema: FactCheckerOutputSchema,
    },
    deps.sleepImpl
  );
}
