import { z } from "zod";
import { runAgent } from "@/llm/runAgent";
import type { LLMProvider } from "@/llm/types";
import { REWRITER_SYSTEM_PROMPT } from "./prompts/rewriter.ts";
import { AuditorIssueSchema, type AuditorIssue } from "./auditor.ts";

export const RewriterOutputSchema = z.object({
  improved_html: z.string().min(50),
  change_log: z.array(z.string().min(3)).min(1).max(7),
});

export type RewriterOutput = z.infer<typeof RewriterOutputSchema>;

export interface RewriterInput {
  html: string;
  target_keyword: string;
  brand_voice: string;
  ban_list: string[];
  issues_to_address: AuditorIssue[];
  fix_first?: string[];
}

export interface RewriterDeps {
  provider: LLMProvider;
  sleepImpl?: (ms: number) => Promise<void>;
}

// Re-export AuditorIssueSchema voor consumers die een runtime-validatie willen
// vóór ze RewriterInput.issues_to_address opbouwen.
export { AuditorIssueSchema };

export async function runRewriter(input: RewriterInput, deps: RewriterDeps) {
  // Aparte agent voor de full-rewrite pass. Wordt alleen aangeroepen wanneer de
  // gebruiker expliciet om een verbeterde versie vraagt (na de fast audit).
  // maxTokens 16000 is genoeg voor ~3000 woorden output + change_log; ruim
  // binnen Gemini 2.5 Pro's 65K output-limit.
  return runAgent(
    {
      provider: deps.provider,
      systemPrompt: REWRITER_SYSTEM_PROMPT,
      userPrompt: JSON.stringify(input, null, 2),
      model: "gemini-2.5-pro",
      maxTokens: 16000,
      temperature: 0.6,
      schema: RewriterOutputSchema,
    },
    deps.sleepImpl
  );
}
