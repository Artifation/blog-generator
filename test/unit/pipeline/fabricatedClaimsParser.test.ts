import { describe, it, expect } from "vitest";
import { parsePreviousFabricatedClaims } from "@/pipeline/fabricatedClaimsParser";

describe("parsePreviousFabricatedClaims", () => {
  it("returns empty when no fabricated entries are present", () => {
    expect(parsePreviousFabricatedClaims([])).toEqual([]);
    expect(
      parsePreviousFabricatedClaims(["score < threshold", "weighted_total 6.2 < 7.0"])
    ).toEqual([]);
  });

  it("strips the 'fabricated claim: ' prefix", () => {
    expect(
      parsePreviousFabricatedClaims(["fabricated claim: 47% van MKB gebruikt AI"])
    ).toEqual(["47% van MKB gebruikt AI"]);
  });

  it("strips the trailing ' — <reason>' so the writer doesn't see fact-checker meta-comments", () => {
    expect(
      parsePreviousFabricatedClaims([
        "fabricated claim: 47% van MKB gebruikt AI — niet in key_facts",
      ])
    ).toEqual(["47% van MKB gebruikt AI"]);
  });

  it("keeps em-dashes that appear earlier in the claim (only the last ' — ' is the reason boundary)", () => {
    expect(
      parsePreviousFabricatedClaims([
        "fabricated claim: in 2024 — toen de AI Act in werking trad — bespaarde 47% — geen bron in research",
      ])
    ).toEqual(["in 2024 — toen de AI Act in werking trad — bespaarde 47%"]);
  });

  it("handles entries without a reason suffix", () => {
    expect(
      parsePreviousFabricatedClaims(["fabricated claim: 8 op de 10 ondernemers"])
    ).toEqual(["8 op de 10 ondernemers"]);
  });

  it("filters out non-fabricated hardFails entries while parsing the fabricated ones", () => {
    expect(
      parsePreviousFabricatedClaims([
        "score < threshold",
        "fabricated claim: 47% — niet in key_facts",
        "missing internal links",
        "fabricated claim: €12.000 jaarlijkse besparing — geen bron",
      ])
    ).toEqual(["47%", "€12.000 jaarlijkse besparing"]);
  });

  it("does not split on a normal hyphen (-) — only space-em-dash-space", () => {
    expect(
      parsePreviousFabricatedClaims(["fabricated claim: AI-gedreven groei van 47%"])
    ).toEqual(["AI-gedreven groei van 47%"]);
  });

  it("strips the optional '\\n→ FIX: <rewrite>' suffix added by factChecker-fixer", () => {
    expect(
      parsePreviousFabricatedClaims([
        "fabricated claim: 47% van MKB gebruikt AI — niet in key_facts\n→ FIX: Een groeiend deel van het MKB gebruikt AI",
      ])
    ).toEqual(["47% van MKB gebruikt AI"]);
  });

  it("handles FIX-suffix without a reason between claim and FIX", () => {
    expect(
      parsePreviousFabricatedClaims([
        "fabricated claim: 8 op de 10 ondernemers\n→ FIX: De meeste ondernemers",
      ])
    ).toEqual(["8 op de 10 ondernemers"]);
  });
});
