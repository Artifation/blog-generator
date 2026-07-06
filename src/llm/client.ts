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
  | "repurposer"
  | "topicSuggester";

export interface AgentModelChoice {
  provider: LLMProviderName;
  model: string;
  maxTokens: number;
}

export interface ProviderRegistry {
  get(name: LLMProviderName): LLMProvider;
  has(name: LLMProviderName): boolean;
}

const ROLE_TO_MODEL: Record<AgentRole, AgentModelChoice> = {
  researcher: { provider: "gemini", model: "gemini-2.5-pro", maxTokens: 8000 },
  // Gemini 2.5-pro is een thinking-model: de maxOutputTokens budget wordt
  // gedeeld met thinking-tokens. Bij complexe input (uitgebreide research +
  // SERP-data) wordt de output mid-string afgekapt rond char 5000-6000.
  // Verhoogd naar 16000 zodat denk-budget de output niet meer drukt.
  strategist: { provider: "gemini", model: "gemini-2.5-pro", maxTokens: 16000 },
  writer: { provider: "anthropic", model: "claude-sonnet-4-6", maxTokens: 8000 },
  // SeoEditor: zowel Haiku als Sonnet crashen consistent op pos ~1250 bij dit
  // type input (full draft HTML + ban_list). Niet maxTokens-gerelateerd —
  // mogelijk specifiek formatprobleem met Anthropic + grote HTML in JSON.
  // Gemini 2.5-pro werkt al voor strategist+writer-niveau structured output.
  seoEditor: { provider: "gemini", model: "gemini-2.5-pro", maxTokens: 16000 },
  // Anthropic Opus returnde "No JSON found in response" (platte tekst ipv JSON)
  // op deze schema's. Gemini 2.5-pro is consistent gebleken voor strategist en
  // seoEditor — zelfde model voor factChecker + qualityJudge.
  factChecker: { provider: "gemini", model: "gemini-2.5-pro", maxTokens: 8000 },
  qualityJudge: { provider: "gemini", model: "gemini-2.5-pro", maxTokens: 8000 },
  imagePrompter: { provider: "groq", model: "llama-3.3-70b-versatile", maxTokens: 1000 },
  internalLinker: { provider: "anthropic", model: "claude-sonnet-4-6", maxTokens: 4000 },
  repurposer: { provider: "anthropic", model: "claude-sonnet-4-6", maxTokens: 2000 },
  topicSuggester: { provider: "gemini", model: "gemini-2.5-pro", maxTokens: 4000 },
};

// Fallback-mapping voor wanneer de primaire provider geen key heeft.
// Gemini is altijd het laatste redmiddel; rollen die al primair Gemini
// gebruiken hebben geen fallback nodig (failen gewoon hard als Gemini ook
// ontbreekt — gevangen door generate.ts vóór de pipeline start).
const GEMINI_FALLBACK: Record<AgentRole, AgentModelChoice> = {
  researcher: { provider: "gemini", model: "gemini-2.5-pro", maxTokens: 8000 },
  strategist: { provider: "gemini", model: "gemini-2.5-pro", maxTokens: 16000 },
  writer: { provider: "gemini", model: "gemini-2.5-pro", maxTokens: 8000 },
  seoEditor: { provider: "gemini", model: "gemini-2.5-flash", maxTokens: 8000 },
  factChecker: { provider: "gemini", model: "gemini-2.5-pro", maxTokens: 4000 },
  qualityJudge: { provider: "gemini", model: "gemini-2.5-pro", maxTokens: 4000 },
  // 4000 not 1000: gemini-2.5-flash spends "thinking" tokens that count against
  // maxTokens, so a 1000 ceiling truncated the image-prompt JSON mid-output on
  // longer topics (Gemini-only sites like "blog" failed repeatedly with
  // "output truncated"). The prompt output itself is small — the higher ceiling
  // just leaves room for the model's reasoning.
  imagePrompter: { provider: "gemini", model: "gemini-2.5-flash", maxTokens: 4000 },
  internalLinker: { provider: "gemini", model: "gemini-2.5-pro", maxTokens: 4000 },
  repurposer: { provider: "gemini", model: "gemini-2.5-pro", maxTokens: 2000 },
  topicSuggester: { provider: "gemini", model: "gemini-2.5-pro", maxTokens: 4000 },
};

export function resolveAgentModel(
  role: AgentRole,
  registry?: ProviderRegistry
): AgentModelChoice {
  const primary = ROLE_TO_MODEL[role];
  if (!registry) return primary;
  if (registry.has(primary.provider)) return primary;
  // Defense-in-depth: if neither the primary nor Gemini is available,
  // fail loud here rather than returning a model the caller can't use.
  // The expected validation point is generate.ts; this guard catches the
  // case where that validation was bypassed.
  if (!registry.has("gemini")) {
    throw new Error(
      `Cannot resolve model for role "${role}": primary provider "${primary.provider}" unavailable and Gemini fallback also missing. Set GEMINI_API_KEY or the primary provider's key.`
    );
  }
  return GEMINI_FALLBACK[role];
}

const ENV_VAR_BY_PROVIDER: Record<LLMProviderName, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  gemini: "GEMINI_API_KEY",
  groq: "GROQ_API_KEY",
};

export function createProviderRegistry(
  env: NodeJS.ProcessEnv = process.env
): ProviderRegistry {
  const cache = new Map<LLMProviderName, LLMProvider>();
  const availability = new Map<LLMProviderName, boolean>();
  for (const [name, envKey] of Object.entries(ENV_VAR_BY_PROVIDER)) {
    availability.set(name as LLMProviderName, Boolean(env[envKey]));
  }
  return {
    has(name) {
      return availability.get(name) === true;
    },
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
