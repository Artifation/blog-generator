import { describe, expect, it } from "vitest";
import { countPublishedThisIsoWeek, markTopicStatus } from "@/pipeline/state";
import type { Topic } from "@/config/topics";

const t = (over: Partial<Topic>): Topic => ({
  id: "x",
  title: "X",
  pillar: "a",
  target_keyword: "x",
  intended_word_count: 1500,
  status: "queued",
  priority: 1,
  ...over,
});

describe("state helpers", () => {
  it("counts published topics in same ISO week", () => {
    const now = new Date("2026-05-08T10:00:00Z");
    const list = [
      t({ id: "a", status: "published", last_attempted: "2026-05-05T10:00:00Z" }),
      t({ id: "b", status: "published", last_attempted: "2026-05-04T10:00:00Z" }),
      t({ id: "c", status: "published", last_attempted: "2026-04-28T10:00:00Z" }),
    ];
    expect(countPublishedThisIsoWeek(list, now)).toBe(2);
  });

  it("marks topic status", () => {
    const list = [t({ id: "a" }), t({ id: "b" })];
    const updated = markTopicStatus(list, "a", "published", new Date("2026-05-08"));
    expect(updated.find((x) => x.id === "a")?.status).toBe("published");
    expect(updated.find((x) => x.id === "a")?.last_attempted).toBeDefined();
  });

  it("preserves wp_post_id passed via patch", () => {
    const list = [t({ id: "a" })];
    const updated = markTopicStatus(list, "a", "published", new Date("2026-05-08"), {
      wp_post_id: 99,
      wp_post_url: "https://artifation.nl/?p=99",
    });
    expect(updated.find((x) => x.id === "a")?.wp_post_id).toBe(99);
    expect(updated.find((x) => x.id === "a")?.wp_post_url).toBe("https://artifation.nl/?p=99");
  });
});
