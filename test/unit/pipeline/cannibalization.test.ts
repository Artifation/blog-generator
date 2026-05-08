import { describe, expect, it } from "vitest";
import { detectCannibalization } from "@/pipeline/cannibalization";

describe("detectCannibalization", () => {
  it("detects keyword in existing slug", () => {
    const r = detectCannibalization({
      targetKeyword: "AI in HR",
      existingSlugs: ["ai-in-hr-stappenplan", "iets-anders"],
      existingTitles: ["Stappenplan AI in HR", "Iets anders"],
    });
    expect(r.isCannibalized).toBe(true);
    expect(r.reason).toContain("slug");
  });

  it("detects strong title overlap (>50% words)", () => {
    const r = detectCannibalization({
      targetKeyword: "AI voor accountants",
      existingSlugs: ["bla"],
      existingTitles: ["AI voor accountants in Nederland"],
    });
    expect(r.isCannibalized).toBe(true);
  });

  it("passes when no overlap", () => {
    const r = detectCannibalization({
      targetKeyword: "AI in HR",
      existingSlugs: ["ai-act-uitleg"],
      existingTitles: ["Wat is de AI Act"],
    });
    expect(r.isCannibalized).toBe(false);
  });
});
