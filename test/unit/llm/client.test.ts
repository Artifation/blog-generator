import { describe, expect, it } from "vitest";
import { resolveAgentModel, createProviderRegistry } from "@/llm/client";

describe("resolveAgentModel", () => {
  it("returns model + provider for known role", () => {
    expect(resolveAgentModel("researcher").provider).toBe("gemini");
    expect(resolveAgentModel("strategist").provider).toBe("gemini");
    expect(resolveAgentModel("writer").provider).toBe("anthropic");
    expect(resolveAgentModel("seoEditor").provider).toBe("anthropic");
    expect(resolveAgentModel("factChecker").provider).toBe("anthropic");
    expect(resolveAgentModel("qualityJudge").provider).toBe("anthropic");
    expect(resolveAgentModel("imagePrompter").provider).toBe("groq");
  });

  it("resolves internalLinker to anthropic sonnet", () => {
    const m = resolveAgentModel("internalLinker");
    expect(m.provider).toBe("anthropic");
    expect(m.model).toBe("claude-sonnet-4-6");
  });

  it("resolves repurposer to anthropic sonnet with 2k maxTokens", () => {
    const m = resolveAgentModel("repurposer");
    expect(m.provider).toBe("anthropic");
    expect(m.model).toBe("claude-sonnet-4-6");
    expect(m.maxTokens).toBe(2000);
  });

  it("resolves topicSuggester to gemini-2.5-pro with 4k maxTokens", () => {
    const m = resolveAgentModel("topicSuggester");
    expect(m.provider).toBe("gemini");
    expect(m.model).toBe("gemini-2.5-pro");
    expect(m.maxTokens).toBe(4000);
  });
});

describe("resolveAgentModel with availability fallback", () => {
  it("uses primary when provider available", () => {
    const reg = createProviderRegistry({
      ANTHROPIC_API_KEY: "x",
      GEMINI_API_KEY: "x",
      GROQ_API_KEY: "x",
    } as NodeJS.ProcessEnv);
    expect(resolveAgentModel("writer", reg).provider).toBe("anthropic");
    expect(resolveAgentModel("imagePrompter", reg).provider).toBe("groq");
  });

  it("falls back to gemini when anthropic missing", () => {
    const reg = createProviderRegistry({
      GEMINI_API_KEY: "x",
    } as NodeJS.ProcessEnv);
    const m = resolveAgentModel("writer", reg);
    expect(m.provider).toBe("gemini");
    expect(m.model).toBe("gemini-2.5-pro");  // exact, not regex
    expect(m.maxTokens).toBe(8000);
  });

  it("falls back to gemini when groq missing for imagePrompter", () => {
    const reg = createProviderRegistry({
      GEMINI_API_KEY: "x",
    } as NodeJS.ProcessEnv);
    const m = resolveAgentModel("imagePrompter", reg);
    expect(m.provider).toBe("gemini");
    expect(m.model).toBe("gemini-2.5-flash");
    expect(m.maxTokens).toBe(1000);
  });

  it("throws when primary missing AND gemini missing (defense in depth)", () => {
    // No keys at all — registry says everything unavailable.
    const reg = createProviderRegistry({} as NodeJS.ProcessEnv);
    expect(() => resolveAgentModel("writer", reg)).toThrow(/Gemini fallback also missing/);
  });

  it("throws when gemini-primary role requested with no gemini", () => {
    // Researcher is gemini-primary; if gemini is missing, the role can't run.
    const reg = createProviderRegistry({} as NodeJS.ProcessEnv);
    expect(() => resolveAgentModel("researcher", reg)).toThrow(/Gemini fallback also missing/);
  });

  it("keeps gemini-primary roles on gemini when only gemini set", () => {
    const reg = createProviderRegistry({
      GEMINI_API_KEY: "x",
    } as NodeJS.ProcessEnv);
    expect(resolveAgentModel("researcher", reg).provider).toBe("gemini");
    expect(resolveAgentModel("topicSuggester", reg).provider).toBe("gemini");
  });

  it("legacy resolveAgentModel(role) without registry still returns primary", () => {
    // Backwards compat for callers that don't yet pass the registry.
    expect(resolveAgentModel("writer").provider).toBe("anthropic");
  });
});
