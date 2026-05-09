import { describe, expect, it } from "vitest";
import { resolveAgentModel } from "@/llm/client";

describe("resolveAgentModel", () => {
  it("returns model + provider for known role", () => {
    expect(resolveAgentModel("researcher").provider).toBe("gemini");
    expect(resolveAgentModel("strategist").provider).toBe("anthropic");
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
});
