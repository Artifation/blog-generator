import { describe, expect, it, vi } from "vitest";
import { runInternalLinker } from "@/agents/internalLinker";
import type { LLMProvider } from "@/llm/types";

const linkOut = JSON.stringify({
  should_link: true,
  confidence: 0.85,
  anchor_text: "AI in HR voor MKB",
  anchor_type: "partial",
  target_paragraph_signature: "Veel MKB-bedrijven worstelen met de vraag hoe AI hun HR-proce",
  rewritten_paragraph_html:
    '<p>Veel MKB-bedrijven worstelen met de vraag hoe AI hun HR-proces kan ondersteunen. Een concrete uitwerking lees je in <a href="https://artifation.nl/ai-in-hr-mkb/">AI in HR voor MKB</a>.</p>',
  rationale: "paragraaf opent met focus-keyword",
});

const noLinkOut = JSON.stringify({
  should_link: false,
  confidence: 0.3,
  anchor_text: "",
  anchor_type: "semantic",
  target_paragraph_signature: "",
  rewritten_paragraph_html: "",
  rationale: "geen passende paragraaf gevonden",
});

describe("runInternalLinker", () => {
  it("returns a positive link decision", async () => {
    const provider: LLMProvider = {
      name: "anthropic",
      call: vi.fn(async () => ({
        text: linkOut,
        inputTokens: 1000,
        outputTokens: 200,
        model: "claude-sonnet-4-6",
        provider: "anthropic" as const,
      })),
    };
    const r = await runInternalLinker(
      {
        old_post_html: "<p>Veel MKB-bedrijven worstelen ...</p>",
        new_post: {
          title: "AI in HR voor MKB",
          tldr_one_liner: "AI helpt MKB-HR.",
          focus_keyword: "AI in HR",
          url: "https://artifation.nl/ai-in-hr-mkb/",
          key_entities: ["MKB", "HR"],
        },
        constraint_anchor_already_used: [],
      },
      { provider, sleepImpl: () => Promise.resolve() }
    );
    expect(r.parsed.should_link).toBe(true);
    expect(r.parsed.confidence).toBeGreaterThan(0.7);
    expect(r.parsed.target_paragraph_signature).toContain("Veel MKB-bedrijven");
  });

  it("returns negative when no paragraph fits", async () => {
    const provider: LLMProvider = {
      name: "anthropic",
      call: vi.fn(async () => ({
        text: noLinkOut,
        inputTokens: 500,
        outputTokens: 50,
        model: "claude-sonnet-4-6",
        provider: "anthropic" as const,
      })),
    };
    const r = await runInternalLinker(
      {
        old_post_html: "<p>Iets totaal anders.</p>",
        new_post: {
          title: "X",
          tldr_one_liner: "y",
          focus_keyword: "AI in HR",
          url: "https://artifation.nl/x/",
          key_entities: [],
        },
        constraint_anchor_already_used: [],
      },
      { provider, sleepImpl: () => Promise.resolve() }
    );
    expect(r.parsed.should_link).toBe(false);
  });
});
