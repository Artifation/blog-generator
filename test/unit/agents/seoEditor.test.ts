import { describe, expect, it, vi } from "vitest";
import { runSeoEditor } from "@/agents/seoEditor";
import type { LLMProvider } from "@/llm/types";

const out = JSON.stringify({
  edited_html: "<div class='tldr'>...</div>" + "x".repeat(2000),
  meta_title: "AI in HR voor MKB | Artifation",
  meta_description:
    "Hoe AI MKB-HR helpt van vacature tot exit met praktische stappen, tools en valkuilen. Plan vandaag een AI Scan voor jouw team.",
  slug: "ai-in-hr-mkb-stappenplan",
  alt_texts_per_image_placeholder: ["AI in HR header"],
  fixes_applied: ["replaced 'leverage' x2"],
});

const provider: LLMProvider = {
  name: "anthropic",
  call: vi.fn(async () => ({
    text: out,
    inputTokens: 1,
    outputTokens: 1,
    model: "x",
    provider: "anthropic" as const,
  })),
};

describe("runSeoEditor", () => {
  it("returns edited draft + meta", async () => {
    const r = await runSeoEditor(
      {
        draft_html: "<h2>x</h2>",
        target_keyword: "AI in HR",
        internal_links_target_list: [{ url: "https://artifation.nl/ai-scan/", anchor: "AI Scan" }],
        ban_list: ["leverage"],
      },
      { provider, sleepImpl: () => Promise.resolve() }
    );
    expect(r.parsed.meta_title.length).toBeLessThanOrEqual(80);
    expect(r.parsed.slug).toMatch(/^[a-z0-9-]+$/);
  });
});
