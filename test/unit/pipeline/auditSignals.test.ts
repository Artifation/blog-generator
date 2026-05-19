import { describe, expect, it } from "vitest";
import {
  analyzeHeadings,
  analyzeSentences,
  countPassiveVoiceNL,
  estimateReadingTimeMinutes,
  countQuestions,
} from "@/pipeline/auditSignals";

describe("analyzeHeadings", () => {
  it("counts h1/h2/h3 and flags missing H1", () => {
    const html = "<h2>Eerste</h2><p>tekst</p><h2>Tweede</h2><h3>Sub</h3>";
    const r = analyzeHeadings(html);
    expect(r.counts).toEqual({ h1: 0, h2: 2, h3: 1, h4: 0 });
    expect(r.issues).toContain("Geen H1 — elke blog hoort één H1 te hebben");
  });

  it("flags multiple H1s as an issue", () => {
    const html = "<h1>Een</h1><h1>Twee</h1>";
    const r = analyzeHeadings(html);
    expect(r.issues.join(" ")).toMatch(/meerdere H1/i);
  });

  it("flags hierarchy jumps (H1 -> H3 without H2)", () => {
    const html = "<h1>Top</h1><h3>Te diep</h3>";
    const r = analyzeHeadings(html);
    expect(r.issues.join(" ")).toMatch(/h1.*h3|h2.*overgeslagen|sla(.*) H2/i);
  });

  it("flags very few H2s in long content", () => {
    const html = `<h1>Top</h1><h2>Een</h2>${"<p>woord ".repeat(2000)}</p>`;
    const r = analyzeHeadings(html);
    expect(r.issues.join(" ")).toMatch(/te weinig H2/i);
  });

  it("no issues for a well-structured post", () => {
    const html = "<h1>Top</h1><h2>A</h2><p>x</p><h2>B</h2><h3>B.1</h3><p>y</p><h2>C</h2>";
    const r = analyzeHeadings(html);
    expect(r.issues).toEqual([]);
  });
});

describe("analyzeSentences", () => {
  it("computes basic stats and flags long sentences", () => {
    const text =
      "Kort. Iets langer met meerdere woorden. Deze zin is bewust extreem lang en bevat veel woorden zodat we kunnen testen of de detectie van lange zinnen werkt en de drempel van 25 woorden overschrijdt zonder twijfel.";
    const r = analyzeSentences(text);
    expect(r.count).toBe(3);
    expect(r.maxWords).toBeGreaterThan(25);
    expect(r.longSentences.length).toBe(1);
    expect(r.longSentences[0]!.wordCount).toBeGreaterThan(25);
    expect(r.percentOver25Words).toBeCloseTo((1 / 3) * 100, 0);
  });

  it("returns 0 counts for empty text", () => {
    const r = analyzeSentences("");
    expect(r.count).toBe(0);
    expect(r.avgWords).toBe(0);
    expect(r.medianWords).toBe(0);
  });

  it("computes median correctly", () => {
    const text = "Een. Twee woorden. Drie woorden hier. Vier woorden zijn dit. Vijf woorden tellen wij hier.";
    const r = analyzeSentences(text);
    expect(r.count).toBe(5);
    expect(r.medianWords).toBe(3);
  });
});

describe("countPassiveVoiceNL", () => {
  it("detects 'worden/werd/is geworden + participle' constructions", () => {
    const text =
      "De bal wordt gegooid. Het rapport werd geschreven door de auteur. De wedstrijd is gewonnen door het team.";
    expect(countPassiveVoiceNL(text)).toBeGreaterThanOrEqual(3);
  });

  it("does not flag active voice", () => {
    const text =
      "Ik gooi de bal. Hij schrijft het rapport. Het team wint de wedstrijd.";
    expect(countPassiveVoiceNL(text)).toBe(0);
  });

  it("ignores 'is' as copula (not passive)", () => {
    // "is rood" is copula, not passive.
    const text = "De auto is rood. Het huis is groot.";
    expect(countPassiveVoiceNL(text)).toBe(0);
  });
});

describe("estimateReadingTimeMinutes", () => {
  it("scales linearly at 200 wpm Dutch reading speed", () => {
    expect(estimateReadingTimeMinutes(200)).toBe(1);
    expect(estimateReadingTimeMinutes(1000)).toBe(5);
    expect(estimateReadingTimeMinutes(50)).toBe(1); // minimum 1
    expect(estimateReadingTimeMinutes(0)).toBe(0);
  });
});

describe("countQuestions", () => {
  it("counts sentence-ending question marks", () => {
    const text = "Werkt dit? Ja. Of niet? Misschien wel.";
    expect(countQuestions(text)).toBe(2);
  });

  it("does not double-count multi-question lines", () => {
    expect(countQuestions("Wat? Hoe? Waarom??")).toBe(3);
  });
});
