import { describe, expect, it } from "vitest";
import {
  findStrikingDistance,
  findRisingQueries,
  findDecayingQueries,
  findUnmappedQueries,
  scoreOpportunities,
} from "@/integrations/keywordOpportunities";
import type { GscRow } from "@/integrations/searchConsole";

function row(
  keys: string[],
  impressions: number,
  position: number,
  clicks = 0,
  ctr = 0
): GscRow {
  return { keys, impressions, position, clicks, ctr };
}

// ---------------------------------------------------------------------------
// findStrikingDistance — queries we *almost* rank for: high impressions,
// position in the "page 1 bottom / page 2" range. DataForSEO sells this
// classification; we derive it for free from GSC.
// ---------------------------------------------------------------------------

describe("findStrikingDistance", () => {
  it("returns queries with position in 8..20 and impressions >= threshold", () => {
    const rows = [
      row(["ai voor mkb"], 500, 12.4),    // striking distance
      row(["ai tools"], 800, 6.1),         // already ranking well, skip
      row(["chatgpt"], 50, 11.0),          // too few impressions, skip
      row(["copilot mkb"], 300, 9.2),      // striking
      row(["llm uitleg"], 200, 21.0),      // too low, skip
      row(["whisper"], 200, 7.9),          // top-of-page-1, skip
    ];

    const out = findStrikingDistance(rows, { minImpressions: 100 });

    expect(out.map((o) => o.query).sort()).toEqual(["ai voor mkb", "copilot mkb"]);
  });

  it("respects minImpressions threshold", () => {
    const rows = [row(["x"], 90, 12), row(["y"], 110, 12)];
    const out = findStrikingDistance(rows, { minImpressions: 100 });
    expect(out.map((o) => o.query)).toEqual(["y"]);
  });

  it("excludes rows whose first key is empty", () => {
    const rows = [row([""], 500, 12), row(["valid"], 500, 12)];
    const out = findStrikingDistance(rows, { minImpressions: 100 });
    expect(out.map((o) => o.query)).toEqual(["valid"]);
  });

  it("sorts results by impressions descending (highest opportunity first)", () => {
    const rows = [
      row(["small"], 150, 12),
      row(["huge"], 5000, 14),
      row(["medium"], 800, 11),
    ];
    const out = findStrikingDistance(rows, { minImpressions: 100 });
    expect(out.map((o) => o.query)).toEqual(["huge", "medium", "small"]);
  });
});

// ---------------------------------------------------------------------------
// findRisingQueries — compares two windows; reports queries whose impressions
// grew by >= minGrowth (absolute) AND >= minGrowthPct (relative).
// ---------------------------------------------------------------------------

describe("findRisingQueries", () => {
  it("returns queries with significant impression growth between windows", () => {
    const previous = [
      row(["query a"], 100, 15),
      row(["query b"], 50, 20),
      row(["query c"], 200, 12),
    ];
    const current = [
      row(["query a"], 400, 12),  // +300, +300%  → rising
      row(["query b"], 60, 18),   // +10, +20%   → not enough
      row(["query c"], 195, 12),  // -5          → not rising
      row(["query d"], 250, 14),  // new query   → rising
    ];

    const out = findRisingQueries(current, previous, {
      minGrowth: 100,
      minGrowthPct: 50,
    });

    const queries = out.map((o) => o.query).sort();
    expect(queries).toEqual(["query a", "query d"]);
  });

  it("treats brand-new queries (no previous impressions) as rising if current >= minGrowth", () => {
    const previous: GscRow[] = [];
    const current = [row(["new query"], 150, 10), row(["tiny query"], 5, 30)];

    const out = findRisingQueries(current, previous, {
      minGrowth: 100,
      minGrowthPct: 50,
    });

    expect(out.map((o) => o.query)).toEqual(["new query"]);
  });

  it("returns empty array when no queries grow enough", () => {
    const previous = [row(["a"], 100, 10)];
    const current = [row(["a"], 110, 10)];

    const out = findRisingQueries(current, previous, {
      minGrowth: 100,
      minGrowthPct: 50,
    });
    expect(out).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// findDecayingQueries — queries whose performance dropped substantially.
// ---------------------------------------------------------------------------

describe("findDecayingQueries", () => {
  it("returns queries whose impressions dropped by >= minDropPct", () => {
    const previous = [
      row(["healthy"], 500, 8),
      row(["dying"], 400, 12),
      row(["stable"], 200, 6),
    ];
    const current = [
      row(["healthy"], 480, 8),
      row(["dying"], 100, 25),  // -75%
      row(["stable"], 195, 6),
    ];

    const out = findDecayingQueries(current, previous, { minDropPct: 50, minPreviousImpressions: 100 });
    expect(out.map((o) => o.query)).toEqual(["dying"]);
  });

  it("ignores queries below minPreviousImpressions (noise filter)", () => {
    const previous = [row(["tiny"], 30, 15)];
    const current = [row(["tiny"], 5, 15)];

    const out = findDecayingQueries(current, previous, { minDropPct: 50, minPreviousImpressions: 100 });
    expect(out).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// findUnmappedQueries — queries showing up in GSC for which no existing topic
// targets the same keyword. The most direct content-gap signal.
// ---------------------------------------------------------------------------

describe("findUnmappedQueries", () => {
  it("returns queries not matched (substring, case-insensitive) by any existing target_keyword or title", () => {
    const rows = [
      row(["ai voor advocaten"], 400, 9),
      row(["chatgpt voor mkb"], 300, 11),
      row(["copilot uitleg"], 150, 14),
    ];
    const existingTopics = [
      { target_keyword: "chatgpt voor mkb", title: "ChatGPT voor MKB — gids" },
      { target_keyword: "ai-strategie", title: "AI-strategie voor advocaten" },
    ];

    const out = findUnmappedQueries(rows, existingTopics, { minImpressions: 100 });

    // "chatgpt voor mkb" matched directly; "ai voor advocaten" matched via title substring;
    // only "copilot uitleg" remains.
    expect(out.map((o) => o.query)).toEqual(["copilot uitleg"]);
  });

  it("respects minImpressions threshold", () => {
    const rows = [row(["small"], 50, 10), row(["big"], 500, 10)];
    const out = findUnmappedQueries(rows, [], { minImpressions: 100 });
    expect(out.map((o) => o.query)).toEqual(["big"]);
  });
});

// ---------------------------------------------------------------------------
// scoreOpportunities — combines signals into a ranked list with reasons.
// ---------------------------------------------------------------------------

describe("scoreOpportunities", () => {
  it("merges striking-distance + rising + unmapped, dedups by query, attaches reasons", () => {
    const opportunities = scoreOpportunities({
      strikingDistance: [
        { query: "ai voor mkb", impressions: 500, position: 12, clicks: 5 },
      ],
      rising: [
        { query: "ai voor mkb", impressions: 500, growth: 300, growthPct: 150 },
        { query: "copilot studio", impressions: 200, growth: 200, growthPct: 100 },
      ],
      unmapped: [
        { query: "rag uitleg", impressions: 250, position: 9 },
        { query: "copilot studio", impressions: 200, position: 18 },
      ],
    });

    const byQuery = Object.fromEntries(opportunities.map((o) => [o.query, o]));

    expect(byQuery["ai voor mkb"]!.signals.sort()).toEqual(["rising", "striking_distance"]);
    expect(byQuery["copilot studio"]!.signals.sort()).toEqual(["rising", "unmapped"]);
    expect(byQuery["rag uitleg"]!.signals).toEqual(["unmapped"]);
  });

  it("ranks queries with more signals higher", () => {
    const out = scoreOpportunities({
      strikingDistance: [{ query: "triple", impressions: 100, position: 12, clicks: 0 }],
      rising: [{ query: "triple", impressions: 100, growth: 80, growthPct: 80 }],
      unmapped: [
        { query: "triple", impressions: 100, position: 12 },
        { query: "single", impressions: 800, position: 12 },
      ],
    });

    expect(out[0]!.query).toBe("triple"); // 3 signals beats 1 signal even with lower impressions
  });
});
