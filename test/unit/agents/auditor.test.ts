import { describe, expect, it, vi } from "vitest";
import { runAuditor, AuditorOutputSchema, type AuditorInput } from "@/agents/auditor";
import type { LLMProvider } from "@/llm/types";

function provider(response: unknown): LLMProvider {
  return {
    name: "gemini",
    call: vi.fn(async () => ({
      text: JSON.stringify(response),
      inputTokens: 100,
      outputTokens: 200,
      model: "gemini-2.5-pro",
      provider: "gemini" as const,
    })),
  };
}

const INPUT: AuditorInput = {
  html: "<p>Een blog over AI in MKB. Sommige zinnen zijn echt heel lang en bevatten veel jargon dat de lezer moeilijk doorgrondt op een dieper niveau.</p>",
  target_keyword: "ai in mkb",
  brand_voice: "Direct, expert, nuchter — geen marketingjargon. Spreek lezer aan met 'je'.",
  ban_list: ["delve", "leverage"],
};

const VALID_RESPONSE = {
  scores: {
    readability: 5,
    originality: 6,
    brand_voice: 7,
    seo: 6,
    structure: 5,
    factual_clarity: 8,
  },
  weighted_total: 6.2,
  issues: [
    {
      severity: "warning",
      category: "readability",
      message: "Zin met 18+ woorden bevat veel jargon",
      quote: "Sommige zinnen zijn echt heel lang en bevatten veel jargon dat de lezer moeilijk doorgrondt op een dieper niveau.",
      suggested_rewrite: "Sommige zinnen zijn te lang. Lezers haken af.",
    },
    {
      severity: "suggestion",
      category: "structure",
      message: "Geen H2-headings — lange tekst splitsen",
      quote: null,
      suggested_rewrite: null,
    },
  ],
  summary: "De tekst is informatief maar leesbaarheid en structuur kunnen scherper.",
};

describe("runAuditor", () => {
  it("returns parsed audit output with scores, issues and summary", async () => {
    const result = await runAuditor(INPUT, { provider: provider(VALID_RESPONSE) });

    expect(result.parsed.scores.readability).toBe(5);
    expect(result.parsed.weighted_total).toBeCloseTo(6.2);
    expect(result.parsed.issues).toHaveLength(2);
    expect(result.parsed.issues[0]!.severity).toBe("warning");
    expect(result.parsed.issues[0]!.quote).toContain("Sommige zinnen");
    expect(result.parsed.summary).toMatch(/leesbaarheid/);
  });

  it("validates the output against the schema (rejects invalid severity)", () => {
    const bad = { ...VALID_RESPONSE, issues: [{ ...VALID_RESPONSE.issues[0], severity: "fatal" }] };
    const parsed = AuditorOutputSchema.safeParse(bad);
    expect(parsed.success).toBe(false);
  });

  it("validates the output against the schema (requires score 0..10)", () => {
    const bad = { ...VALID_RESPONSE, scores: { ...VALID_RESPONSE.scores, readability: 12 } };
    const parsed = AuditorOutputSchema.safeParse(bad);
    expect(parsed.success).toBe(false);
  });

  it("accepts a quote of null for whole-document issues", () => {
    const ok = { ...VALID_RESPONSE };
    const parsed = AuditorOutputSchema.safeParse(ok);
    expect(parsed.success).toBe(true);
  });

  it("sends html + target_keyword + brand_voice + ban_list to the provider", async () => {
    const p = provider(VALID_RESPONSE);
    await runAuditor(INPUT, { provider: p });

    const calls = (p.call as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(1);
    const userPrompt = (calls[0]![0] as { userPrompt: string }).userPrompt;
    expect(userPrompt).toContain("ai in mkb");
    expect(userPrompt).toContain("AI in MKB");
    expect(userPrompt).toContain("Direct, expert");
    expect(userPrompt).toContain("delve");
  });
});
