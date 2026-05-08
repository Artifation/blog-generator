import { describe, expect, it } from "vitest";
import { loadTopics, parseTopics } from "@/config/topics";

describe("topics", () => {
  it("parses a list of topics", () => {
    const list = parseTopics([
      {
        id: "x",
        title: "X",
        pillar: "a",
        target_keyword: "x",
        intended_word_count: 1500,
        status: "queued",
        priority: 1,
      },
    ]);
    expect(list[0]!.id).toBe("x");
  });

  it("rejects unknown status", () => {
    expect(() =>
      parseTopics([
        {
          id: "x",
          title: "X",
          pillar: "a",
          target_keyword: "x",
          intended_word_count: 1500,
          status: "weird",
          priority: 1,
        },
      ])
    ).toThrow();
  });

  it("loads from disk", async () => {
    const list = await loadTopics("example", "test/fixtures/tenants");
    expect(list).toHaveLength(2);
  });
});
