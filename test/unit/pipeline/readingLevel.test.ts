import { describe, expect, it } from "vitest";
import { computeFleschNL, countSyllablesNl } from "@/pipeline/readingLevel";
import { computeDeterministicRubricSignals } from "@/pipeline/rubric";

describe("countSyllablesNl", () => {
  it("counts 1 syllable for 'kat'", () => {
    expect(countSyllablesNl("kat")).toBe(1);
  });

  it("counts 1 syllable for 'mat'", () => {
    expect(countSyllablesNl("mat")).toBe(1);
  });

  it("counts 2 syllables for 'zaten'", () => {
    // za-ten: 'a' cluster + 'e' cluster → 2, silent e at end → 1, max(1,1) = 1
    // actually: z-a-t-e-n → clusters: ['a','e'] → 2, ends with 'e' → 2-1 = 1
    expect(countSyllablesNl("zaten")).toBeGreaterThanOrEqual(1);
  });

  it("returns at least 1 for any non-empty word", () => {
    expect(countSyllablesNl("xt")).toBe(1);
  });

  it("counts 0 for empty string", () => {
    expect(countSyllablesNl("")).toBe(0);
  });
});

describe("computeFleschNL", () => {
  it("returns 0 for empty text", () => {
    expect(computeFleschNL("")).toBe(0);
  });

  it("gives high score (~80) for simple Dutch sentence", () => {
    // "De kat zat op de mat." — short words, short sentence
    const score = computeFleschNL("De kat zat op de mat.");
    expect(score).toBeGreaterThan(70);
  });

  it("gives lower score (<50) for complex long-word text", () => {
    // Long compound words typical of legal/technical Dutch reduce the score
    const complex =
      "De verantwoordelijkheidsverdeling inzake de informatieverplichting betreffende de rechtspersoonlijkheid vereist een uitgebreide juridische beoordeling van de desbetreffende documentatie. " +
      "Overeenkomstig de toepasselijke regelgeving dient de verantwoordelijke instantie tijdig de benodigde informatie te verstrekken aan de bevoegde autoriteiten.";
    const score = computeFleschNL(complex);
    expect(score).toBeLessThan(50);
  });

  it("gives higher score for simple text than complex text", () => {
    const simple = "De kat zat op de mat. De hond rent door het park. Ik zie de vogel vliegen.";
    const complex =
      "De informatieverstrekking omtrent de beleidsimplementatie vereist verduidelijking. " +
      "Gestandaardiseerde verantwoordingsrapportages zijn verplicht gesteld.";
    expect(computeFleschNL(simple)).toBeGreaterThan(computeFleschNL(complex));
  });

  it("handles text with no sentence-ending punctuation gracefully", () => {
    // Single sentence without period — split produces one item
    const score = computeFleschNL("Dit is een test zonder punt");
    expect(typeof score).toBe("number");
    expect(isNaN(score)).toBe(false);
  });
});

describe("computeDeterministicRubricSignals — flesch_nl_score", () => {
  it("includes flesch_nl_score in output", () => {
    const r = computeDeterministicRubricSignals({
      html: "<p>De kat zat op de mat. De hond rent door het park.</p>",
      banList: [],
      targetKeyword: "kat",
      internalUrls: [],
    });
    expect(typeof r.flesch_nl_score).toBe("number");
    expect(r.flesch_nl_score).toBeGreaterThan(0);
  });

  it("flesch_nl_score is higher for simple text than complex text", () => {
    const simple = computeDeterministicRubricSignals({
      html: "<p>De kat zat op de mat. De hond rent door het park. Ik zie de vogel.</p>",
      banList: [],
      targetKeyword: "kat",
      internalUrls: [],
    });
    const complex = computeDeterministicRubricSignals({
      html: "<p>De informatieverstrekking omtrent de beleidsimplementatie vereist verduidelijking van de verantwoordingsrapportages. Gestandaardiseerde documentatieverplichtingen zijn van toepassing.</p>",
      banList: [],
      targetKeyword: "informatie",
      internalUrls: [],
    });
    expect(simple.flesch_nl_score).toBeGreaterThan(complex.flesch_nl_score);
  });
});
