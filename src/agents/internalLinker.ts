import { z } from "zod";
import { runAgent } from "@/llm/runAgent";
import type { AgentModelChoice } from "@/llm/client";
import type { LLMProvider } from "@/llm/types";
import { INTERNAL_LINKER_SYSTEM_PROMPT } from "./prompts/internalLinker.ts";

export const InternalLinkerOutputSchema = z.object({
  should_link: z.boolean(),
  confidence: z.number().min(0).max(1),
  anchor_text: z.string(),
  anchor_type: z.enum(["exact_match", "partial", "semantic"]),
  target_paragraph_signature: z.string(),
  rewritten_paragraph_html: z.string(),
  rationale: z.string(),
});
export type InternalLinkerOutput = z.infer<typeof InternalLinkerOutputSchema>;

export interface InternalLinkerInput {
  old_post_html: string;
  new_post: {
    title: string;
    tldr_one_liner: string;
    focus_keyword: string;
    url: string;
    key_entities: string[];
  };
  constraint_anchor_already_used: string[];
}

export interface InternalLinkerDeps {
  provider: LLMProvider;
  model: AgentModelChoice;
  sleepImpl?: (ms: number) => Promise<void>;
}

export async function runInternalLinker(
  input: InternalLinkerInput,
  deps: InternalLinkerDeps
) {
  return runAgent(
    {
      provider: deps.provider,
      systemPrompt: INTERNAL_LINKER_SYSTEM_PROMPT,
      userPrompt: JSON.stringify(input, null, 2),
      model: deps.model.model,
      maxTokens: deps.model.maxTokens,
      schema: InternalLinkerOutputSchema,
    },
    deps.sleepImpl
  );
}
