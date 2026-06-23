import { describe, expect, it, vi } from "vitest";
import { runFactChecker } from "@/agents/factChecker";
import type { LLMProvider } from "@/llm/types";
import { resolveAgentModel } from "@/llm/client";

const passOut = JSON.stringify({
  verified_claims: [{ claim: "X", source_url: "https://rvo.nl" }],
  unverifiable_claims: [],
  fabricated_claims: [],
  verdict: "pass",
});

const failOut = JSON.stringify({
  verified_claims: [],
  unverifiable_claims: [],
  fabricated_claims: [{ claim: "74,4% van NL MKB", reason: "geen bron" }],
  verdict: "fail",
});

describe("runFactChecker", () => {
  it("returns pass when no fabricated", async () => {
    const provider: LLMProvider = {
      name: "anthropic",
      call: vi.fn(async () => ({
        text: passOut,
        inputTokens: 1,
        outputTokens: 1,
        model: "x",
        provider: "anthropic" as const,
      })),
    };
    const r = await runFactChecker(
      { edited_html: "x", key_facts: [{ claim: "X", source_url: "https://rvo.nl" }] },
      { provider, model: resolveAgentModel("factChecker"), sleepImpl: () => Promise.resolve() }
    );
    expect(r.parsed.verdict).toBe("pass");
  });

  it("returns fail when fabricated", async () => {
    const provider: LLMProvider = {
      name: "anthropic",
      call: vi.fn(async () => ({
        text: failOut,
        inputTokens: 1,
        outputTokens: 1,
        model: "x",
        provider: "anthropic" as const,
      })),
    };
    const r = await runFactChecker(
      { edited_html: "x", key_facts: [] },
      { provider, model: resolveAgentModel("factChecker"), sleepImpl: () => Promise.resolve() }
    );
    expect(r.parsed.verdict).toBe("fail");
  });
});
