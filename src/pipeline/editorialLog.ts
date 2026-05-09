/**
 * Editorial review log — append-only audit trail per calendar year.
 *
 * Satisfies the "editorial responsibility exception" of Article 50 of the
 * EU AI Act (deadline: 2 August 2026). Each published post gets a log entry
 * proving that a human editor reviewed and approved the AI-generated draft
 * before publication.
 *
 * Log location: data/editorial-reviews/<tenant>/<year>.json
 * (relative to the project root, not inside tenants/)
 */

import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export interface EditorialLogEntry {
  post_id: number;
  post_url: string;
  post_title: string;
  /** Tenant author name — proxy for the editor who approved the draft. */
  reviewer: string;
  /** ISO 8601 timestamp of approval/publish. */
  approved_at: string;
  /** AI models used during this pipeline run. */
  ai_models_used: string[];
  /** Short git SHA of pipeline version at runtime. */
  pipeline_version: string;
  /** Quality judge weighted_total score. */
  rubric_total: number;
  topic_id: string;
}

export interface PersistEditorialLogOpts {
  tenant_slug: string;
  /**
   * Base directory for tenant folders (default: "tenants").
   * The log is written to: <project_root>/data/editorial-reviews/<tenant>/<year>.json
   * where project_root = path.resolve(baseDir, "..").
   */
  baseDir?: string;
  now?: Date;
}

/**
 * Appends an entry to the annual editorial log file.
 * Uses a temp-file + rename for atomic-ish writes.
 */
export async function appendEditorialLogEntry(
  entry: EditorialLogEntry,
  opts: PersistEditorialLogOpts
): Promise<void> {
  const baseDir = opts.baseDir ?? "tenants";
  const now = opts.now ?? new Date();
  const year = now.getUTCFullYear().toString();

  // Log lives at <project_root>/data/editorial-reviews/<tenant>/<year>.json
  const projectRoot = path.resolve(baseDir, "..");
  const logDir = path.join(projectRoot, "data", "editorial-reviews", opts.tenant_slug);
  const logFile = path.join(logDir, `${year}.json`);

  await mkdir(logDir, { recursive: true });

  // Read existing entries (init as [] if file missing)
  let entries: EditorialLogEntry[] = [];
  try {
    const raw = await readFile(logFile, "utf-8");
    entries = JSON.parse(raw) as EditorialLogEntry[];
  } catch {
    // File doesn't exist yet — start fresh
    entries = [];
  }

  entries.push(entry);

  // Atomic-ish write: write to tmp file then rename
  const tmpFile = path.join(os.tmpdir(), `editorial-log-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  await writeFile(tmpFile, JSON.stringify(entries, null, 2) + "\n", "utf-8");
  await rename(tmpFile, logFile);
}
