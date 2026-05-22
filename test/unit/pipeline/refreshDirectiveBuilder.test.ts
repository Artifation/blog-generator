import { describe, expect, it } from "vitest";
import { buildRewriterInputsFromOpportunity } from "@/pipeline/refreshDirectiveBuilder";
import type { RefreshOpportunity } from "@/pipeline/refreshOpportunities";

const BASE: Omit<RefreshOpportunity, "category" | "directives"> = {
  publishedPostId: "pub_x",
  url: "https://example.com/x",
  title: "Example post",
  score: 0.7,
  rationale: "Position decayed 5 places",
  signals: {
    clicks_30d: 10,
    impressions_30d: 500,
    avg_position: 14.2,
    days_since_publish: 200,
  },
};

describe("buildRewriterInputsFromOpportunity", () => {
  it("maps each directive into an AuditorIssue with descending priority", () => {
    const opp: RefreshOpportunity = {
      ...BASE,
      category: "decaying",
      directives: ["First directive", "Second directive", "Third directive"],
    };
    const { issues, fix_first } = buildRewriterInputsFromOpportunity(opp);
    expect(issues).toHaveLength(3);
    expect(issues[0]!.priority).toBe(1);
    expect(issues[1]!.priority).toBe(2);
    expect(issues[2]!.priority).toBe(2);
    expect(issues[0]!.message).toBe("First directive");
    expect(fix_first[0]).toMatch(/reclaim|decay/i);
    expect(fix_first[1]).toContain("decayed");
  });

  it("uses 'seo' category + 'error' severity for decaying refreshes", () => {
    const opp: RefreshOpportunity = {
      ...BASE,
      category: "decaying",
      directives: ["d1"],
    };
    const { issues } = buildRewriterInputsFromOpportunity(opp);
    expect(issues[0]!.category).toBe("seo");
    expect(issues[0]!.severity).toBe("error");
  });

  it("uses 'readability' category + 'warning' severity for stagnant_evergreen", () => {
    const opp: RefreshOpportunity = {
      ...BASE,
      category: "stagnant_evergreen",
      directives: ["d1"],
    };
    const { issues, fix_first } = buildRewriterInputsFromOpportunity(opp);
    expect(issues[0]!.category).toBe("readability");
    expect(issues[0]!.severity).toBe("warning");
    expect(fix_first[0]).toMatch(/click|ctr/i);
  });

  it("uses 'factual' + 'suggestion' for freshness_overdue (gentlest pass)", () => {
    const opp: RefreshOpportunity = {
      ...BASE,
      category: "freshness_overdue",
      directives: ["d1"],
    };
    const { issues, fix_first } = buildRewriterInputsFromOpportunity(opp);
    expect(issues[0]!.category).toBe("factual");
    expect(issues[0]!.severity).toBe("suggestion");
    expect(fix_first[0]).toMatch(/refresh|freshness/i);
  });
});
