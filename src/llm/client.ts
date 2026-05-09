import { createAnthropicProvider } from "./anthropic.ts";
import { createGeminiProvider } from "./gemini.ts";
import { createGroqProvider } from "./groq.ts";
import type { LLMProvider, LLMProviderName } from "./types.ts";

export type AgentRole =
  | "researcher"
  | "strategist"
  | "writer"
  | "seoEditor"
  | "factChecker"
  | "qualityJudge"
  | "imagePrompter"
  | "internalLinker"
  | "repurposer";

export interface AgentModelChoice {
  provider: LLMProviderName;
  model: string;
  maxTokens: number;
}

const ROLE_TO_MODEL: Record<AgentRole, AgentModelChoice> = {
  researcher: { provider: "gemini", model: "gemini-2.5-pro", maxTokens: 8000 },
  strategist: { provider: "anthropic", model: "claude-sonnet-4-6", maxTokens: 4000 },
  writer: { provider: "anthropic", model: "claude-sonnet-4-6", maxTokens: 8000 },
  seoEditor: { provider: "anthropic", model: "claude-haiku-4-5-20251001", maxTokens: 8000 },
  factChecker: { provider: "anthropic", model: "claude-opus-4-7", maxTokens: 4000 },
  qualityJudge: { provider: "anthropic", model: "claude-opus-4-7", maxTokens: 4000 },
  imagePrompter: { provider: "groq", model: "llama-3.3-70b-versatile", maxTokens: 1000 },
  internalLinker: { provider: "anthropic", model: "claude-sonnet-4-6", maxTokens: 4000 },
  repurposer: { provider: "anthropic", model: "claude-sonnet-4-6", maxTokens: 2000 },
};

export function resolveAgentModel(role: AgentRole): AgentModelChoice {
  return ROLE_TO_MODEL[role];
}

export interface ProviderRegistry {
  get(name: LLMProviderName): LLMProvider;
}

export function createProviderRegistry(
  env: NodeJS.ProcessEnv = process.env
): ProviderRegistry {
  const cache = new Map<LLMProviderName, LLMProvider>();
  return {
    get(name) {
      if (cache.has(name)) return cache.get(name)!;
      const p = (() => {
        if (name === "anthropic")
          return createAnthropicProvider(requireEnv(env, "ANTHROPIC_API_KEY"));
        if (name === "gemini")
          return createGeminiProvider(requireEnv(env, "GEMINI_API_KEY"));
        if (name === "groq")
          return createGroqProvider(requireEnv(env, "GROQ_API_KEY"));
        throw new Error(`Unknown provider: ${name}`);
      })();
      cache.set(name, p);
      return p;
    },
  };
}

function requireEnv(env: NodeJS.ProcessEnv, key: string): string {
  const v = env[key];
  if (!v) throw new Error(`Missing required env var: ${key}`);
  return v;
}
