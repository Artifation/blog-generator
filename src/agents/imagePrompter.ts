import { z } from "zod";
import { runAgent } from "@/llm/runAgent";
import { resolveAgentModel } from "@/llm/client";
import type { LLMProvider } from "@/llm/types";
import { IMAGE_PROMPTER_SYSTEM_PROMPT } from "./prompts/imagePrompter.ts";

export const ImagePrompterOutputSchema = z.object({
  prompt: z.string().min(20),
  negative_prompt: z.string(),
  alt_text_nl: z.string().min(10).max(100),
});
export type ImagePrompterOutput = z.infer<typeof ImagePrompterOutputSchema>;

export interface ImagePrompterInput {
  title: string;
  tldr: string;
  brand_style: string;
  /** Topic-context voor topic-relevante imagery ipv generieke AI-abstracts. */
  pillar?: string;
  target_keyword?: string;
  key_entities?: string[];
}

export interface ImagePrompterDeps {
  provider: LLMProvider;
  sleepImpl?: (ms: number) => Promise<void>;
}

export async function runImagePrompter(input: ImagePrompterInput, deps: ImagePrompterDeps) {
  const model = resolveAgentModel("imagePrompter");
  return runAgent(
    {
      provider: deps.provider,
      systemPrompt: IMAGE_PROMPTER_SYSTEM_PROMPT,
      userPrompt: JSON.stringify(input, null, 2),
      model: model.model,
      maxTokens: model.maxTokens,
      schema: ImagePrompterOutputSchema,
    },
    deps.sleepImpl
  );
}
