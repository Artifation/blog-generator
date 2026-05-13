import { z } from "zod";
import { runAgent } from "@/llm/runAgent";
import { resolveAgentModel } from "@/llm/client";
import type { LLMProvider } from "@/llm/types";
import { SEO_EDITOR_SYSTEM_PROMPT } from "./prompts/seoEditor.ts";

export const SeoEditorOutputSchema = z.object({
  edited_html: z.string().min(500),
  meta_title: z.string().min(10).max(80),
  meta_description: z.string().min(110).max(165),  // Yoast wil ≤156 ideaal, ≤170 nog acceptabel; LLM overshoot 158-165 niet hard rejecten — pipeline-block is duurder dan 5 extra chars
  slug: z.string().regex(/^[a-z0-9-]+$/).max(80),
  alt_texts_per_image_placeholder: z.array(z.string()),
  fixes_applied: z.array(z.string()),
});
export type SeoEditorOutput = z.infer<typeof SeoEditorOutputSchema>;

export interface SeoEditorInput {
  draft_html: string;
  target_keyword: string;
  internal_links_target_list: { url: string; anchor: string }[];
  ban_list: string[];
}

export interface SeoEditorDeps {
  provider: LLMProvider;
  sleepImpl?: (ms: number) => Promise<void>;
}

export async function runSeoEditor(input: SeoEditorInput, deps: SeoEditorDeps) {
  const model = resolveAgentModel("seoEditor");
  return runAgent(
    {
      provider: deps.provider,
      systemPrompt: SEO_EDITOR_SYSTEM_PROMPT,
      userPrompt: JSON.stringify(input, null, 2),
      model: model.model,
      maxTokens: model.maxTokens,
      schema: SeoEditorOutputSchema,
    },
    deps.sleepImpl
  );
}
