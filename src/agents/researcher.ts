import { z } from "zod";
import { runAgent } from "@/llm/runAgent";
import type { LLMProvider } from "@/llm/types";
import { resolveAgentModel } from "@/llm/client";
import { RESEARCHER_SYSTEM_PROMPT } from "./prompts/researcher.ts";

export const OriginalityAnchorSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("real_case"),
    source_url: z.string().url(),
    summary: z.string().min(60).max(500),
    what_makes_it_relevant: z.string().min(30).max(400),
  }),
  z.object({
    type: z.literal("hypothetical_scenario"),
    industry: z.string().min(3),
    region: z.string().min(2),
    situation: z.string().min(60).max(500),
    outcome: z.string().min(30).max(400),
  }),
]);
export type OriginalityAnchor = z.infer<typeof OriginalityAnchorSchema>;

export const ResearchOutputSchema = z.object({
  fan_out_subqueries: z.array(z.string()).min(3),
  key_entities: z.array(z.string()).min(3),
  internal_link_targets: z
    .array(z.object({ url: z.string().url(), anchor_suggestion: z.string(), why: z.string() }))
    .min(0),
  external_authority_sources: z
    .array(z.object({ url: z.string().url(), title: z.string(), why_authoritative: z.string() }))
    .min(0),
  key_facts: z.array(z.object({ claim: z.string(), source_url: z.string().url() })).min(0),
  competitor_serp_summary: z.string(),
  originality_anchor: OriginalityAnchorSchema.optional(),
});
export type ResearchOutput = z.infer<typeof ResearchOutputSchema>;

export interface ResearcherInput {
  target_keyword: string;
  topic_title: string;
  pillar: string;
  existing_site_urls: string[];
}

export interface ResearcherDeps {
  provider: LLMProvider;
  sleepImpl?: (ms: number) => Promise<void>;
}

export async function runResearcher(input: ResearcherInput, deps: ResearcherDeps) {
  const model = resolveAgentModel("researcher");
  return runAgent(
    {
      provider: deps.provider,
      systemPrompt: RESEARCHER_SYSTEM_PROMPT,
      userPrompt: JSON.stringify(input, null, 2),
      model: model.model,
      maxTokens: model.maxTokens,
      schema: ResearchOutputSchema,
    },
    deps.sleepImpl
  );
}
