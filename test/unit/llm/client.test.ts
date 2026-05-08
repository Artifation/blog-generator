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
});
