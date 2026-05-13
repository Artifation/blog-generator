import { mkdir, writeFile, appendFile } from "node:fs/promises";
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
