import { describe, expect, it, vi } from "vitest";
import { runStrategist } from "@/agents/strategist";
import type { LLMProvider } from "@/llm/types";

const out = {
  outline: {
    h1_suggestion: "AI in HR voor MKB: stappenplan 2026",
    tldr_one_liner: "AI helpt MKB-HR vanaf vacature tot exit, mits AVG-proof.",
    tldr_direct_answer_40_60w: "AI in HR helpt MKB-bedrijven het volledige proces van werving tot exit te versnellen: slimmer screenen, minder administratieve last, betere planning en datagedreven beslissingen. AVG-proof en transparant ingezet levert dit direct tijdwinst op voor HR-teams die anders verzuipen in handmatig CV-werk en spreadsheets.",
    tldr_summary_134_words: "x".repeat(700),
    h2_chunks: Array.from({ length: 5 }, (_, i) => ({
      h2: `H2-${i}`,
      subquestion_answered: `q${i}`,
      intended_word_count: 150,
      must_include: ["e1"],
      h3s: [],
    })),
    internal_links_to_inject: [
      { url: "https://artifation.nl/ai-scan/", anchor: "AI Scan" },
      { url: "https://artifation.nl/contact/", anchor: "neem contact op" },
      { url: "https://artifation.nl/ai-consultancy/", anchor: "AI consultancy" },
    ],
    external_links_to_cite: ["https://rvo.nl/wbso"],
    schema_choices: ["BlogPosting"],
    faq_block: [],
  },
  anchor_distribution: { exact_match_pct: 20, partial_pct: 40, semantic_pct: 40 },
  contrarian_opinion_hint: "MKB-HR overschat AI's vermogen om empathie te tonen.",
};

const provider: LLMProvider = {
  name: "anthropic",
  call: vi.fn(async () => ({
    text: JSON.stringify(out),
    inputTokens: 100,
    outputTokens: 200,
    model: "claude-sonnet-4-6",
    provider: "anthropic" as const,
  })),
};

describe("runStrategist", () => {
  it("returns parsed outline", async () => {
    const r = await runStrategist(
      { research: {} as any, brand_voice: "informeel", target_keyword: "AI in HR" },
      { provider, sleepImpl: () => Promise.resolve() }
    );
    expect(r.parsed.outline.h2_chunks).toHaveLength(5);
  });

  it("accepts intent and intended_word_count_target fields", async () => {
    const r = await runStrategist(
      {
        research: {} as any,
        brand_voice: "informeel",
        target_keyword: "AI in HR",
        intent: "commercial",
        intended_word_count_target: 900,
      },
      { provider, sleepImpl: () => Promise.resolve() }
    );
    expect(r.parsed.outline.h2_chunks).toHaveLength(5);
  });
});
