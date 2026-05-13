import { describe, expect, it } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { persistRunSummary, type RunSummary } from "@/pipeline/runLogger";

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
