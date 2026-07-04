import { z } from "zod";
import { runAgent } from "@/llm/runAgent";
import type { AgentModelChoice } from "@/llm/client";
import type { LLMProvider } from "@/llm/types";
import { LINKEDIN_PROMPT, NEWSLETTER_PROMPT, XTHREAD_PROMPT } from "./prompts/repurposer.ts";

export type RepurposeFormat = "linkedin" | "newsletter" | "xthread";

const LinkedInOutputSchema = z.object({
  hook_first_200: z.string().min(50).max(400),
  full_text: z.string().min(800).max(3500),
  cta: z.string().min(10).max(200),
});

const NewsletterOutputSchema = z.object({
  subject_line: z.string().min(10).max(100),
  preheader: z.string().min(20).max(150),
  body_html: z.string().min(500),
  cta_url: z.string().url(),
});

const XThreadOutputSchema = z.object({
  tweets: z.array(z.string().min(20).max(280)).min(5).max(9),
  blog_link_tweet_index: z.number().int().min(0), // index van tweet die naar blog linkt
});

export type LinkedInOutput = z.infer<typeof LinkedInOutputSchema>;
export type NewsletterOutput = z.infer<typeof NewsletterOutputSchema>;
export type XThreadOutput = z.infer<typeof XThreadOutputSchema>;

export interface RepurposeInput {
  blog: {
    title: string;
    tldr: string;
    url: string;
    target_keyword: string;
    pillar: string;
  };
  brand_voice: string;
}

export interface RepurposeDeps {
  provider: LLMProvider;
  model: AgentModelChoice;
  sleepImpl?: (ms: number) => Promise<void>;
}

export async function runRepurposerLinkedIn(input: RepurposeInput, deps: RepurposeDeps) {
  return runAgent(
    {
      provider: deps.provider,
      systemPrompt: LINKEDIN_PROMPT(input.brand_voice),
      userPrompt: JSON.stringify(input.blog, null, 2),
      model: deps.model.model,
      maxTokens: deps.model.maxTokens,
      schema: LinkedInOutputSchema,
    },
    deps.sleepImpl
  );
}

export async function runRepurposerNewsletter(input: RepurposeInput, deps: RepurposeDeps) {
  return runAgent(
    {
      provider: deps.provider,
      systemPrompt: NEWSLETTER_PROMPT(input.brand_voice),
      userPrompt: JSON.stringify(input.blog, null, 2),
      model: deps.model.model,
      maxTokens: deps.model.maxTokens,
      schema: NewsletterOutputSchema,
    },
    deps.sleepImpl
  );
}

export async function runRepurposerXThread(input: RepurposeInput, deps: RepurposeDeps) {
  return runAgent(
    {
      provider: deps.provider,
      systemPrompt: XTHREAD_PROMPT(input.brand_voice),
      userPrompt: JSON.stringify(input.blog, null, 2),
      model: deps.model.model,
      maxTokens: deps.model.maxTokens,
      schema: XThreadOutputSchema,
    },
    deps.sleepImpl
  );
}
