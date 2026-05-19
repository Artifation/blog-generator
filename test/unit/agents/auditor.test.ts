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
      priority: 2,
      estimated_score_lift: 0.8,
    },
    {
      severity: "suggestion",
      category: "structure",
      message: "Geen H2-headings — lange tekst splitsen",
      quote: null,
      suggested_rewrite: null,
      priority: 4,
      estimated_score_lift: 0.5,
    },
  ],
  summary: "De tekst is informatief maar leesbaarheid en structuur kunnen scherper.",
  fix_first: [
    "Splits de lange zin onder de inleiding in twee korte zinnen.",
    "Voeg H2-headings toe om de blog scanbaar te maken.",
  ],
  improved_version: "Een blog over AI in MKB. Sommige zinnen zijn te lang. Lezers haken af.",
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

  it("parses priority + estimated_score_lift per issue", async () => {
    const result = await runAuditor(INPUT, { provider: provider(VALID_RESPONSE) });
    expect(result.parsed.issues[0]!.priority).toBe(2);
    expect(result.parsed.issues[0]!.estimated_score_lift).toBeCloseTo(0.8);
    expect(result.parsed.issues[1]!.priority).toBe(4);
  });

  it("parses fix_first list and improved_version when provided", async () => {
    const result = await runAuditor(INPUT, { provider: provider(VALID_RESPONSE) });
    expect(result.parsed.fix_first).toHaveLength(2);
    expect(result.parsed.fix_first![0]).toMatch(/splits/i);
    expect(result.parsed.improved_version).toMatch(/AI in MKB/);
  });

  it("accepts a response without improved_version or fix_first (both optional)", () => {
    const minimal = { ...VALID_RESPONSE };
    delete (minimal as Record<string, unknown>).improved_version;
    delete (minimal as Record<string, unknown>).fix_first;
    const parsed = AuditorOutputSchema.safeParse(minimal);
    expect(parsed.success).toBe(true);
  });

  it("rejects priority outside 1..5", () => {
    const bad = {
      ...VALID_RESPONSE,
      issues: [{ ...VALID_RESPONSE.issues[0], priority: 9 }],
    };
    const parsed = AuditorOutputSchema.safeParse(bad);
    expect(parsed.success).toBe(false);
  });

  it("accepts serp_gaps + serp_positioning when provided", () => {
    const withSerp = {
      ...VALID_RESPONSE,
      serp_gaps: [
        {
          topic: "Concrete kosten per maand",
          covered_by: ["frankwatching.com", "computable.nl"],
          rationale: "Twee van de top-3 noemen specifieke prijsranges; jouw post blijft abstract.",
        },
      ],
      serp_positioning: "Top-10 is definitie-zwaar; jij kan winnen met hands-on stappenplan voor MKB.",
    };
    const parsed = AuditorOutputSchema.safeParse(withSerp);
    expect(parsed.success).toBe(true);
  });

  it("rejects a serp_gap without covered_by", () => {
    const bad = {
      ...VALID_RESPONSE,
      serp_gaps: [
        { topic: "X", covered_by: [], rationale: "iets uit de SERP top-10 reden hier" },
      ],
    };
    const parsed = AuditorOutputSchema.safeParse(bad);
    expect(parsed.success).toBe(false);
  });

  it("sends serp_results in the prompt when provided", async () => {
    const p = provider(VALID_RESPONSE);
    await runAuditor(
      {
        ...INPUT,
        serp_results: [
          { rank: 1, url: "https://frankwatching.com/x", domain: "frankwatching.com", title: "AI voor MKB: alles wat je moet weten", description: "Hoe AI MKB-bedrijven helpt..." },
        ],
      },
      { provider: p }
    );
    const userPrompt = (
      (p.call as ReturnType<typeof vi.fn>).mock.calls[0]![0] as { userPrompt: string }
    ).userPrompt;
    expect(userPrompt).toContain("frankwatching.com");
    expect(userPrompt).toContain("AI voor MKB");
  });
});
