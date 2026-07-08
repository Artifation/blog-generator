import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { persistRunSummary, sumRunCostLast7Days, type RunSummary } from "@/pipeline/runLogger";

function makeSummary(overrides: Partial<RunSummary> = {}): RunSummary {
  return {
    runId: "run-123",
    tenantSlug: "artifation",
    topicId: "ai-act-boetes",
    topicTitle: "AI Act-boetes voor MKB",
    startedAt: "2026-05-13T12:00:00.000Z",
    finishedAt: "2026-05-13T12:06:00.000Z",
    durationMs: 360000,
    verdict: "published",
    judgeScores: {
      semantic_completeness: 8.5,
      originality: 7.0,
      anti_ai_cliche: 9.0,
      fact_check: 10.0,
      seo_meta: 8.0,
      seo_schema: 10.0,
      brand_voice: 8.5,
      readability: 7.0,
    },
    weightedTotal: 8.4,
    signals: null,
    hardFails: [],
    wpPostId: 2847,
    costUsd: 0.16,
    ...overrides,
  };
}

describe("persistRunSummary", () => {
  it("writes per-run JSON + appends history line", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "rl-"));
    const s = makeSummary();
    await persistRunSummary(s, dir);

    const runFile = await readFile(`${dir}/runs/${s.runId}-${s.topicId}.json`, "utf8");
    expect(JSON.parse(runFile)).toMatchObject({ runId: s.runId, weightedTotal: 8.4 });

    const history = await readFile(`${dir}/score-history.jsonl`, "utf8");
    expect(history.trim().split("\n")).toHaveLength(1);
    expect(JSON.parse(history.trim())).toMatchObject({ topicId: s.topicId });
  });

  it("appends multiple runs to same history file", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "rl-"));
    await persistRunSummary(makeSummary({ runId: "r1" }), dir);
    await persistRunSummary(makeSummary({ runId: "r2", verdict: "rejected", weightedTotal: 7.4 }), dir);

    const history = await readFile(`${dir}/score-history.jsonl`, "utf8");
    const lines = history.trim().split("\n").map((l) => JSON.parse(l));
    expect(lines).toHaveLength(2);
    expect(lines[0].runId).toBe("r1");
    expect(lines[1].runId).toBe("r2");
    expect(lines[1].verdict).toBe("rejected");
  });
});

describe("sumRunCostLast7Days", () => {
  const now = new Date("2026-05-20T12:00:00.000Z");
  const daysAgo = (n: number) =>
    new Date(now.getTime() - n * 86_400_000).toISOString();

  it("returns 0 when there is no history file", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "rl-"));
    expect(await sumRunCostLast7Days("artifation", now, dir)).toBe(0);
  });

  it("sums only this tenant's costs within the 7-day window", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "rl-"));
    await persistRunSummary(makeSummary({ runId: "r1", finishedAt: daysAgo(1), costUsd: 0.16 }), dir);
    await persistRunSummary(makeSummary({ runId: "r2", finishedAt: daysAgo(3), costUsd: 0.2 }), dir);
    // Outside the window — excluded.
    await persistRunSummary(makeSummary({ runId: "r3", finishedAt: daysAgo(9), costUsd: 5 }), dir);
    // Different tenant — excluded.
    await persistRunSummary(makeSummary({ runId: "r4", tenantSlug: "klant-b", finishedAt: daysAgo(1), costUsd: 3 }), dir);

    expect(await sumRunCostLast7Days("artifation", now, dir)).toBeCloseTo(0.36, 5);
  });

  it("ignores entries without a numeric cost (e.g. cap_deferred / rejected pre-cost runs)", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "rl-"));
    await persistRunSummary(makeSummary({ runId: "r1", finishedAt: daysAgo(1), costUsd: 0.16 }), dir);
    const { costUsd, ...noCost } = makeSummary({ runId: "r2", finishedAt: daysAgo(1), verdict: "cap_deferred" });
    void costUsd;
    await persistRunSummary(noCost as RunSummary, dir);

    expect(await sumRunCostLast7Days("artifation", now, dir)).toBeCloseTo(0.16, 5);
  });

  it("skips malformed lines instead of throwing (fail-open)", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "rl-"));
    await mkdir(dir, { recursive: true });
    await writeFile(
      `${dir}/score-history.jsonl`,
      [
        JSON.stringify(makeSummary({ runId: "r1", finishedAt: daysAgo(1), costUsd: 0.16 })),
        "{ this is not valid json",
        "",
        JSON.stringify(makeSummary({ runId: "r2", finishedAt: daysAgo(2), costUsd: 0.1 })),
      ].join("\n"),
      "utf8",
    );

    expect(await sumRunCostLast7Days("artifation", now, dir)).toBeCloseTo(0.26, 5);
  });
});
