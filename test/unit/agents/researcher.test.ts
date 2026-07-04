import { describe, expect, it, vi } from "vitest";
import { runResearcher } from "@/agents/researcher";
import type { LLMProvider } from "@/llm/types";
import { resolveAgentModel } from "@/llm/client";

const mockOutput = JSON.stringify({
  fan_out_subqueries: ["q1", "q2", "q3", "q4", "q5"],
  key_entities: ["e1", "e2", "e3", "e4", "e5"],
  internal_link_targets: [
    { url: "https://artifation.nl/ai-scan/", anchor_suggestion: "AI Scan", why: "scan tool" },
  ],
  external_authority_sources: [
    { url: "https://rvo.nl/wbso", title: "WBSO", why_authoritative: "overheid" },
  ],
  key_facts: [{ claim: "X", source_url: "https://rvo.nl/wbso" }],
  competitor_serp_summary: "summary",
});

const provider: LLMProvider = {
  name: "gemini",
  call: vi.fn(async () => ({
    text: mockOutput,
    inputTokens: 10,
    outputTokens: 10,
    model: "gemini-2.5-pro",
    provider: "gemini" as const,
  })),
};

describe("runResearcher", () => {
  it("returns parsed research output", async () => {
    const r = await runResearcher(
      {
        target_keyword: "AI in HR",
        topic_title: "AI in HR voor MKB",
        pillar: "ai-per-afdeling",
        existing_site_urls: ["https://artifation.nl/ai-scan/"],
      },
      { provider, model: resolveAgentModel("researcher"), sleepImpl: () => Promise.resolve() }
    );
    expect(r.parsed.fan_out_subqueries).toHaveLength(5);
    expect(r.parsed.key_entities).toHaveLength(5);
  });
});
