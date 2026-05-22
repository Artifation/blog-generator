import { describe, expect, it } from "vitest";
import { applyFactCheckerFixes } from "@/pipeline/applyFactCheckerFixes";

describe("applyFactCheckerFixes", () => {
  it("applies a simple exact-match rewrite", () => {
    const result = applyFactCheckerFixes({
      html: "<p>Onderzoek toont aan dat 47% van het MKB AI gebruikt.</p>",
      fixes: [
        {
          claim: "47% van het MKB",
          reason: "geen bron",
          suggested_rewrite: "Een groeiend deel van het MKB",
        },
      ],
    });
    expect(result.patched_html).toBe("<p>Onderzoek toont aan dat Een groeiend deel van het MKB AI gebruikt.</p>");
    expect(result.applied).toHaveLength(1);
    expect(result.skipped).toHaveLength(0);
  });

  it("applies multiple fixes in order from longest claim to shortest", () => {
    // "47% van het MKB" zou na het toepassen van "47%" niet meer vindbaar zijn.
    // De sort zorgt dat de langere eerst gaat.
    const result = applyFactCheckerFixes({
      html: "<p>47% van het MKB gebruikt AI. Ook 47% van advocaten.</p>",
      fixes: [
        {
          claim: "47%",
          reason: "geen bron",
          suggested_rewrite: "Een aanzienlijk deel",
        },
        {
          claim: "47% van het MKB",
          reason: "geen bron",
          suggested_rewrite: "Een groeiend deel van het MKB",
        },
      ],
    });
    // Langere eerst → "47% van het MKB" → "Een groeiend deel van het MKB"
    // Daarna kortere "47%" → tweede instance.
    expect(result.patched_html).toContain("Een groeiend deel van het MKB gebruikt AI");
    expect(result.patched_html).toContain("Ook Een aanzienlijk deel van advocaten");
    expect(result.applied).toHaveLength(2);
  });

  it("skips fixes with VERWIJDER DEZE marker (sentence removal)", () => {
    const result = applyFactCheckerFixes({
      html: "<p>Onzin-statistiek hier 12.000 euro per jaar besparing.</p>",
      fixes: [
        {
          claim: "12.000 euro per jaar besparing",
          reason: "geen bron",
          suggested_rewrite: "VERWIJDER DEZE ZIN",
        },
      ],
    });
    expect(result.applied).toHaveLength(0);
    expect(result.skipped).toEqual([
      { claim: "12.000 euro per jaar besparing", reason: "removal_marker" },
    ]);
    expect(result.patched_html).toBe("<p>Onzin-statistiek hier 12.000 euro per jaar besparing.</p>");
  });

  it("skips fixes without a suggested_rewrite", () => {
    const result = applyFactCheckerFixes({
      html: "<p>Claim X hier.</p>",
      fixes: [{ claim: "Claim X", reason: "geen bron" }],
    });
    expect(result.skipped).toEqual([{ claim: "Claim X", reason: "no_rewrite" }]);
  });

  it("skips fixes whose claim cannot be located in the HTML", () => {
    const result = applyFactCheckerFixes({
      html: "<p>Iets totaal anders.</p>",
      fixes: [
        {
          claim: "een claim die niet voorkomt",
          reason: "fictief",
          suggested_rewrite: "irrelevant",
        },
      ],
    });
    expect(result.skipped).toEqual([
      { claim: "een claim die niet voorkomt", reason: "claim_not_found" },
    ]);
  });

  it("matches claims through whitespace differences (multi-space, newlines)", () => {
    const result = applyFactCheckerFixes({
      html: "<p>Onderzoek toont aan dat 47%\n  van het\n MKB AI gebruikt.</p>",
      fixes: [
        {
          claim: "47% van het MKB",
          reason: "geen bron",
          suggested_rewrite: "een groeiend deel van het MKB",
        },
      ],
    });
    expect(result.patched_html).toContain("een groeiend deel van het MKB");
    expect(result.applied).toHaveLength(1);
  });

  it("returns the original HTML untouched when no fixes can be applied", () => {
    const original = "<p>Niets te fixen.</p>";
    const result = applyFactCheckerFixes({
      html: original,
      fixes: [
        {
          claim: "bestaat niet",
          reason: "x",
          suggested_rewrite: "y",
        },
      ],
    });
    expect(result.patched_html).toBe(original);
    expect(result.applied).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
  });
});
