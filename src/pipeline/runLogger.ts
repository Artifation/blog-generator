import { mkdir, writeFile, appendFile, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { RubricSignals } from "./rubric.ts";

export interface StageEvent {
  stage: string;
  [key: string]: unknown;
}

// Console-stage log — komt door in GH Actions log + lokaal.
export function logStage(event: StageEvent): void {
  console.log(JSON.stringify(event));
}

export interface RunSummary {
  runId: string;
  tenantSlug: string;
  topicId: string;
  topicTitle: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  verdict: "published" | "rejected" | "cap_deferred" | "cannibalization_skipped" | "error";
  judgeScores: Record<string, number> | null;
  weightedTotal: number | null;
  signals: RubricSignals | null;
  hardFails: string[];
  reason?: string;
  wpPostId?: number;
  costUsd?: number;
}

// Persisteer een run-samenvatting. Pad: data/runs/{runId}-{slug}.json voor GH artifact-upload,
// + append naar data/score-history.jsonl voor trend-analyse over tijd.
export async function persistRunSummary(
  summary: RunSummary,
  baseDir: string = "data"
): Promise<void> {
  const runFile = `${baseDir}/runs/${summary.runId}-${summary.topicId}.json`;
  const historyFile = `${baseDir}/score-history.jsonl`;
  await mkdir(dirname(runFile), { recursive: true });
  await writeFile(runFile, JSON.stringify(summary, null, 2), "utf8");
  await appendFile(historyFile, JSON.stringify(summary) + "\n", "utf8");
}

/**
 * Sum of `costUsd` across persisted run summaries for a tenant within the last
 * `windowDays` (default 7), read from score-history.jsonl. This is the src/
 * pipeline's source of rolling spend for the MAX_WEEKLY_USD pre-flight gate —
 * parity with the web path's DB-backed `sumRunCostLast7DaysForSite`.
 *
 * Fail-open by design: a missing history file (fresh install), malformed lines,
 * or entries without a cost/timestamp are treated as zero so a bad log line can
 * never wrongly block a run. Entries are matched on `tenantSlug`, so one shared
 * history file across tenants is fine.
 */
export async function sumRunCostLast7Days(
  tenantSlug: string,
  now: Date,
  baseDir: string = "data",
  windowDays: number = 7,
): Promise<number> {
  let raw: string;
  try {
    raw = await readFile(`${baseDir}/score-history.jsonl`, "utf8");
  } catch {
    return 0; // no history yet
  }
  const cutoff = now.getTime() - windowDays * 86_400_000;
  let total = 0;
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let entry: Partial<RunSummary>;
    try {
      entry = JSON.parse(trimmed) as Partial<RunSummary>;
    } catch {
      continue; // skip a malformed / partially-written line
    }
    if (entry.tenantSlug !== tenantSlug) continue;
    if (typeof entry.costUsd !== "number" || !Number.isFinite(entry.costUsd)) continue;
    const ts = entry.finishedAt ? Date.parse(entry.finishedAt) : NaN;
    if (!Number.isFinite(ts) || ts < cutoff) continue;
    total += entry.costUsd;
  }
  return total;
}
