import { describe, expect, it, vi } from "vitest";
import { runTopicSuggester } from "@/agents/topicSuggester";
import type { LLMProvider } from "@/llm/types";

// ---------------------------------------------------------------------------
// Fixture: valid proposal array returned by LLM
// ---------------------------------------------------------------------------

const MOCK_PROPOSALS = [
  {
    id: "20260509-ai-finance-mkb",
    title: "AI in finance voor MKB: wat levert het op?",
    pillar: "ai-per-afdeling",
    target_keyword: "ai finance mkb",
    intended_word_count: 1800,
    intent: "informational",
    priority: 3,
    proposal_source: "competitor_sitemap",
    proposal_rationale: "Concurrent publiceerde recent een artikel over dit onderwerp. Hoge zoekintentie in NL.",
  },
  {
    id: "20260509-ai-wet-act",
    title: "Wat betekent de EU AI Act voor jouw bedrijf?",
    pillar: "ai-act",
    target_keyword: "eu ai act mkb",
    intended_word_count: 2000,
    intent: "informational",
    priority: 2,
    proposal_source: "gsc_rising_query",
    proposal_rationale: "Stijgende GSC query met >50 impressies maar positie >10. Kans om ranking te pakken.",
  },
];

function makeProvider(proposals = MOCK_PROPOSALS): LLMProvider {
  return {
    name: "gemini",
    call: vi.fn(async () => ({
      text: JSON.stringify({ proposals }),
      inputTokens: 100,
      outputTokens: 200,
      model: "gemini-2.5-pro",
      provider: "gemini" as const,
    })),
  };
}

const BASE_INPUT = {
  existing_topics: [
    {
      id: "existing-topic",
      title: "Bestaand AI topic",
      target_keyword: "ai tools",
      pillar: "ai-per-afdeling",
      status: "queued",
    },
  ],
  candidates: [
    { source: "competitor_sitemap", title: "AI in finance", rationale: "competitor published this" },
    { source: "gsc_rising_query", query: "eu ai act mkb", rationale: "rising impressions" },
  ],
  pillars: [
    { id: "ai-per-afdeling", weight: 0.5 },
    { id: "ai-act", weight: 0.3 },
    { id: "sector-extensie", weight: 0.2 },
  ],
  max_n: 5,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runTopicSuggester", () => {
  it("returns parsed proposals matching schema", async () => {
    const provider = makeProvider();
    const result = await runTopicSuggester(BASE_INPUT, {
      provider,
      sleepImpl: () => Promise.resolve(),
    });

    expect(result.parsed.proposals).toHaveLength(2);

    const first = result.parsed.proposals[0]!;
    expect(first.id).toMatch(/^[a-z0-9-]+$/);
    expect(first.title.length).toBeGreaterThan(5);
    expect(first.pillar).toBe("ai-per-afdeling");
    expect(first.target_keyword).toBe("ai finance mkb");
    expect(first.intended_word_count).toBe(1800);
    expect(first.intent).toBe("informational");
    expect(first.priority).toBe(3);
    expect(first.proposal_source).toBe("competitor_sitemap");
    expect(first.proposal_rationale.length).toBeGreaterThanOrEqual(10);
  });

  it("calls provider with system prompt + JSON user prompt", async () => {
    const provider = makeProvider();
    await runTopicSuggester(BASE_INPUT, {
      provider,
      sleepImpl: () => Promise.resolve(),
    });

    expect(provider.call).toHaveBeenCalledOnce();
    const callArg = (provider.call as ReturnType<typeof vi.fn>).mock.calls[0]![0] as {
      systemPrompt: string;
      userPrompt: string;
      model: string;
      maxTokens: number;
    };
    expect(callArg.systemPrompt).toContain("SEO-strateeg");
    expect(callArg.model).toBe("gemini-2.5-pro");
    expect(callArg.maxTokens).toBe(4000);
    // User prompt should be parseable JSON containing our input
    const userInput = JSON.parse(callArg.userPrompt) as typeof BASE_INPUT;
    expect(userInput.max_n).toBe(5);
    expect(userInput.candidates).toHaveLength(2);
  });

  it("returns empty proposals array when LLM returns no proposals", async () => {
    const provider = makeProvider([]);
    const result = await runTopicSuggester(BASE_INPUT, {
      provider,
      sleepImpl: () => Promise.resolve(),
    });

    expect(result.parsed.proposals).toHaveLength(0);
  });

  it("rejects when LLM returns invalid schema (missing required field)", async () => {
    const badProvider: LLMProvider = {
      name: "gemini",
      call: vi.fn(async () => ({
        text: JSON.stringify({
          proposals: [
            {
              // missing id, title, etc.
              pillar: "ai-per-afdeling",
            },
          ],
        }),
        inputTokens: 10,
        outputTokens: 10,
        model: "gemini-2.5-pro",
        provider: "gemini" as const,
      })),
    };

    await expect(
      runTopicSuggester(BASE_INPUT, {
        provider: badProvider,
        sleepImpl: () => Promise.resolve(),
      })
    ).rejects.toThrow();
  });

  it("respects max 20 proposals cap via schema", async () => {
    // Schema max is 20 — provide exactly 20 to verify it passes
    const twentyProposals = Array.from({ length: 20 }, (_, i) => ({
      id: `20260509-topic-${i}`,
      title: `Topic ${i} voor MKB bedrijven`,
      pillar: "ai-per-afdeling",
      target_keyword: `topic keyword ${i}`,
      intended_word_count: 1500,
      intent: "informational" as const,
      priority: 5,
      proposal_source: "competitor_sitemap" as const,
      proposal_rationale: "Relevant topic met goede traffic-potentie voor NL markt.",
    }));

    const provider = makeProvider(twentyProposals);
    const result = await runTopicSuggester(BASE_INPUT, {
      provider,
      sleepImpl: () => Promise.resolve(),
    });

    expect(result.parsed.proposals).toHaveLength(20);
  });
});
