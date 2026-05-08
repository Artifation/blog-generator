import type { z } from "zod";
import type { LLMProvider, LLMResponse } from "./types.ts";

export interface RunAgentInput<T extends z.ZodTypeAny> {
  provider: LLMProvider;
  systemPrompt: string;
  userPrompt: string;
  model: string;
  maxTokens: number;
  temperature?: number;
  schema: T;
  maxAttempts?: number;
}

export interface RunAgentResult<T extends z.ZodTypeAny> {
  parsed: z.infer<T>;
  raw: LLMResponse;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

export async function runAgent<T extends z.ZodTypeAny>(
  input: RunAgentInput<T>,
  sleepImpl: (ms: number) => Promise<void> = defaultSleep
): Promise<RunAgentResult<T>> {
  const maxAttempts = input.maxAttempts ?? 3;
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const raw = await input.provider.call({
        systemPrompt: input.systemPrompt,
        userPrompt: input.userPrompt,
        model: input.model,
        maxTokens: input.maxTokens,
        temperature: input.temperature,
      });

      const json = extractJson(raw.text);
      const parsed = input.schema.parse(json);
      return { parsed, raw };
    } catch (err) {
      lastError = err as Error;
      if (attempt === maxAttempts) break;
      await sleepImpl(2 ** attempt * 1000);
    }
  }
  throw new Error(
    `runAgent failed to parse after ${maxAttempts} attempts: ${lastError?.message}`
  );
}

function extractJson(text: string): unknown {
  const fence = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  const candidate = fence ? fence[1]! : text;
  const start = candidate.indexOf("{");
  const startArr = candidate.indexOf("[");
  const begin =
    start === -1 ? startArr : startArr === -1 ? start : Math.min(start, startArr);
  if (begin === -1) throw new Error("No JSON found in response");
  const slice = candidate.slice(begin);
  return JSON.parse(slice);
}
