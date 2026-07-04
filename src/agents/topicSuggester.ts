import { z } from "zod";
import { runAgent } from "@/llm/runAgent";
import type { AgentModelChoice } from "@/llm/client";
import type { LLMProvider } from "@/llm/types";
import { TOPIC_SUGGESTER_SYSTEM_PROMPT } from "./prompts/topicSuggester.ts";

export const TopicProposalSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().min(5).max(120),
  pillar: z.string(),
  target_keyword: z.string().min(2),
  intended_word_count: z.number().int().min(500).max(5000),
  intent: z.enum(["informational", "commercial", "transactional"]),
  priority: z.number().int().min(1).max(10),
  proposal_source: z.enum([
    "competitor_sitemap",
    "gsc_rising_query",
    "gsc_striking_distance",
    "gsc_unmapped_query",
    "dataforseo_keyword_idea",
    "manual",
  ]),
  proposal_rationale: z.string().min(10),
});

export const TopicSuggesterOutputSchema = z.object({
  proposals: z.array(TopicProposalSchema).max(20),
});

export type TopicProposal = z.infer<typeof TopicProposalSchema>;
export type TopicSuggesterOutput = z.infer<typeof TopicSuggesterOutputSchema>;

export interface TopicSuggesterInput {
  existing_topics: {
    id: string;
    title: string;
    target_keyword: string;
    pillar: string;
    status: string;
  }[];
  candidates: {
    source: string;
    title?: string;
    query?: string;
    rationale?: string;
  }[];
  pillars: { id: string; weight: number }[];
  max_n: number;
  /** Optioneel: GSC-performance feedback uit `gscPerformanceInsights`. Wanneer
   * aanwezig: de agent moet (1) GEEN nieuwe topics voorstellen voor queries
   * waar we al top-10 ranken, en (2) striking-distance posts markeren als
   * refresh-kandidaten i.p.v. nieuwe topics te genereren. */
  performance_signals?: {
    top_performers: { url: string; target_keyword: string; clicks_30d: number; impressions_30d: number; note: string }[];
    underperformers: { url: string; target_keyword: string; days_live: number; impressions_30d: number; note: string }[];
    striking_distance_posts: { url: string; target_keyword: string; avg_position: number; impressions_30d: number; note: string }[];
    ranking_keywords: { query: string; position: number; impressions: number; url: string }[];
  };
}

export interface TopicSuggesterDeps {
  provider: LLMProvider;
  model: AgentModelChoice;
  sleepImpl?: (ms: number) => Promise<void>;
}

export async function runTopicSuggester(
  input: TopicSuggesterInput,
  deps: TopicSuggesterDeps
) {
  return runAgent(
    {
      provider: deps.provider,
      systemPrompt: TOPIC_SUGGESTER_SYSTEM_PROMPT,
      userPrompt: JSON.stringify(input, null, 2),
      model: deps.model.model,
      maxTokens: deps.model.maxTokens,
      schema: TopicSuggesterOutputSchema,
    },
    deps.sleepImpl
  );
}
