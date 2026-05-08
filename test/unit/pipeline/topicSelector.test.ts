import { describe, expect, it } from "vitest";
import { selectNextTopic } from "@/pipeline/topicSelector";
import type { Topic } from "@/config/topics";

const queued = (over: Partial<Topic>): Topic => ({
  id: "x",
  title: "X",
  pillar: "a",
  target_keyword: "x",
  intended_word_count: 1500,
  status: "queued",
  priority: 1,
  ...over,
});

describe("selectNextTopic", () => {
  it("picks highest priority queued topic", () => {
    const list = [queued({ id: "a", priority: 1 }), queued({ id: "b", priority: 5 })];
    expect(selectNextTopic(list, new Date())?.id).toBe("b");
  });

  it("skips non-queued", () => {
    const list = [
      { ...queued({ id: "a", priority: 5 }), status: "published" as const },
      queued({ id: "b", priority: 1 }),
    ];
    expect(selectNextTopic(list, new Date())?.id).toBe("b");
  });

  it("respects retry_after", () => {
    const future = new Date("2099-01-01");
    const past = new Date("2000-01-01");
    const list = [
      queued({ id: "a", priority: 5, retry_after: future.toISOString() }),
      queued({ id: "b", priority: 1, retry_after: past.toISOString() }),
    ];
    expect(selectNextTopic(list, new Date("2025-01-01"))?.id).toBe("b");
  });

  it("returns undefined on empty queue", () => {
    expect(selectNextTopic([], new Date())).toBeUndefined();
  });
});
