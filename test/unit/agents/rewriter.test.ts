import { describe, expect, it, vi } from "vitest";
import { runRewriter, RewriterOutputSchema, type RewriterInput } from "@/agents/rewriter";
import type { LLMProvider } from "@/llm/types";
import type { AuditorIssue } from "@/agents/auditor";

function provider(response: unknown): LLMProvider {
  return {
    name: "gemini",
    call: vi.fn(async () => ({
      text: JSON.stringify(response),
      inputTokens: 200,
      outputTokens: 600,
      model: "gemini-2.5-pro",
      provider: "gemini" as const,
    })),
  };
}

const ISSUES: AuditorIssue[] = [
  {
    severity: "error",
    category: "brand_voice",
    message: "Te formele toon — gebruik 'jij' i.p.v. 'u'",
    quote: "U vraagt zich wellicht af hoe AI werkt voor uw onderneming.",
    suggested_rewrite: "Je vraagt je vast af hoe AI werkt voor jouw bedrijf.",
    priority: 1,
    estimated_score_lift: 1.2,
  },
  {
    severity: "warning",
    category: "seo",
    message: "Target keyword 'ai in mkb' ontbreekt in eerste 100 woorden",
    quote: null,
    suggested_rewrite: null,
    priority: 2,
    estimated_score_lift: 0.7,
  },
];

const INPUT: RewriterInput = {
  html: "<h1>AI voor bedrijven</h1><p>U vraagt zich wellicht af hoe AI werkt voor uw onderneming.</p>",
  target_keyword: "ai in mkb",
  brand_voice: "Direct, jij/jouw-vorm. Probleem-eerst.",
  ban_list: ["delve", "leverage"],
  issues_to_address: ISSUES,
  fix_first: ["Inleiding herschrijven naar jij-vorm met target keyword"],
};

const VALID_RESPONSE = {
  improved_html:
    "<h1>AI in MKB: zo werkt het voor jouw bedrijf</h1><p>Je vraagt je vast af hoe AI in MKB praktisch toepasbaar is. Hier lees je het concreet.</p>",
  change_log: [
    "Titel uitgebreid met target keyword 'ai in mkb' voor SEO + zichtbaarheid in SERP",
    "Inleiding herschreven naar jij-vorm conform brand voice",
    "Target keyword in eerste alinea geïntroduceerd",
  ],
};

describe("runRewriter", () => {
  it("returns improved_html + change_log when the response is valid", async () => {
    const result = await runRewriter(INPUT, { provider: provider(VALID_RESPONSE) });
    expect(result.parsed.improved_html).toContain("AI in MKB");
    expect(result.parsed.change_log).toHaveLength(3);
    expect(result.parsed.change_log[0]).toMatch(/keyword/i);
  });

  it("validates the schema (improved_html too short fails)", () => {
    const bad = { ...VALID_RESPONSE, improved_html: "short" };
    const parsed = RewriterOutputSchema.safeParse(bad);
    expect(parsed.success).toBe(false);
  });

  it("validates the schema (rejects empty change_log)", () => {
    const bad = { ...VALID_RESPONSE, change_log: [] };
    const parsed = RewriterOutputSchema.safeParse(bad);
    expect(parsed.success).toBe(false);
  });

  it("validates the schema (rejects change_log > 7 items)", () => {
    const bad = {
      ...VALID_RESPONSE,
      change_log: Array.from({ length: 8 }, (_, i) => `change ${i + 1}`),
    };
    const parsed = RewriterOutputSchema.safeParse(bad);
    expect(parsed.success).toBe(false);
  });

  it("sends html + issues + brand_voice + ban_list to the provider", async () => {
    const p = provider(VALID_RESPONSE);
    await runRewriter(INPUT, { provider: p });
    const calls = (p.call as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(1);
    const userPrompt = (calls[0]![0] as { userPrompt: string }).userPrompt;
    expect(userPrompt).toContain("ai in mkb");
    expect(userPrompt).toContain("Te formele toon");
    expect(userPrompt).toContain("jij/jouw-vorm");
    expect(userPrompt).toContain("delve");
  });

  it("uses gemini-2.5-pro with maxTokens 16000", async () => {
    const p = provider(VALID_RESPONSE);
    await runRewriter(INPUT, { provider: p });
    const calls = (p.call as ReturnType<typeof vi.fn>).mock.calls;
    const args = calls[0]![0] as { model: string; maxTokens: number };
    expect(args.model).toBe("gemini-2.5-pro");
    expect(args.maxTokens).toBe(16000);
  });
});
