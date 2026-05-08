import * as React from "react";
import { describe, expect, it } from "vitest";
import { render } from "@react-email/render";
import { Success } from "@/email/templates/Success";
import { Reject } from "@/email/templates/Reject";

describe("email templates render", () => {
  it("renders success", async () => {
    const html = await render(
      React.createElement(Success, {
        title: "T",
        weightedTotal: 8.5,
        scoreBreakdown: { semantic_completeness: 9 },
        tldr: "tldr",
        imageUrl: "https://x.test/i.png",
        editUrl: "https://x.test/edit",
        previewUrl: "https://x.test/preview",
        targetKeyword: "kw",
        internalLinksUsed: [{ url: "https://x.test/a", anchor: "a" }],
      })
    );
    expect(html).toContain("Concept klaar");
    expect(html).toContain("8.5");
  });

  it("renders reject", async () => {
    const html = await render(
      React.createElement(Reject, {
        title: "T",
        weightedTotal: 6.2,
        scoreBreakdown: { originality: 5 },
        hardFails: ["originality < 6"],
        reasoning: "te generiek",
        improvementSuggestions: ["voeg casus toe"],
      })
    );
    expect(html).toContain("Reject");
    expect(html).toContain("6.2");
  });
});
