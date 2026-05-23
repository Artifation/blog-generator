/**
 * Sliding-window rate-limit on login attempts. Backed by the `login_attempts`
 * SQLite table — no Redis, no external state.
 *
 * Defaults: max 5 failed logins per IP per 15 minutes. Tunable via env:
 *   AUTH_RATE_LIMIT_WINDOW_MS   default 900_000 (15 min)
 *   AUTH_RATE_LIMIT_MAX_ATTEMPTS default 5
 *
 * Only FAILED attempts count toward the cap — a successful login does not
 * lock you out. We still log success rows so the same table is also a useful
 * audit trail.
 */

import { sql } from "drizzle-orm";
import { getDb, ensureSchema } from "../db/client";
import { newId } from "../db/ids";

function windowMs(): number {
  const raw = Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : 15 * 60 * 1000;
}

function maxAttempts(): number {
  const raw = Number(process.env.AUTH_RATE_LIMIT_MAX_ATTEMPTS);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 5;
}

export interface RateLimitCheck {
  allowed: boolean;
  /** Number of failures in the current window (capped at maxAttempts+1). */
  attempts: number;
  /** Total budget — informational, for UI copy. */
  limit: number;
  /** ms remaining until the oldest counted attempt rolls out of the window. */
  retryAfterMs: number;
}

/**
 * Check whether an IP may attempt a login right now. Read-only — call
 * `recordAttempt` separately after you know the outcome.
 *
 * GC: deletes rows older than 2× the window opportunistically so the table
 * stays small without a cron job.
 */
export async function checkRateLimit(ip: string): Promise<RateLimitCheck> {
  await ensureSchema();
  const db = getDb();
  const now = Date.now();
  const since = now - windowMs();
  const limit = maxAttempts();

  // Opportunistic GC — bounds the table size. 2x the window is enough to
  // keep history fresh for debugging without growing forever.
  await db.run(
    sql`DELETE FROM login_attempts WHERE ts < ${now - windowMs() * 2}`,
  );

  const result = await db.run(
    sql`SELECT COUNT(*) AS c, MIN(ts) AS oldest
        FROM login_attempts
        WHERE ip = ${ip} AND success = 0 AND ts >= ${since}`,
  );
  const row = (result.rows?.[0] ?? {}) as { c?: number; oldest?: number | null };
  const attempts = Number(row.c ?? 0);
  const oldest = row.oldest != null ? Number(row.oldest) : null;
  const retryAfterMs = oldest != null ? Math.max(0, oldest + windowMs() - now) : 0;

  return {
    allowed: attempts < limit,
    attempts,
    limit,
    retryAfterMs,
  };
}

/**
 * Persist the outcome of one attempt. Call this for BOTH success and failure
 * so we have a complete audit trail.
 */
export async function recordAttempt(
  ip: string,
  success: boolean,
  attemptedEmail?: string,
): Promise<void> {
  await ensureSchema();
  const db = getDb();
  await db.run(
    sql`INSERT INTO login_attempts (id, ip, ts, success, attempted_email)
        VALUES (${newId("att")}, ${ip}, ${Date.now()}, ${success ? 1 : 0}, ${
          attemptedEmail ?? null
        })`,
  );
}

/**
 * Human-friendly minute count for "probeer over X min". Always rounds up so
 * the UI never says "0 min".
 */
export function retryMinutes(retryAfterMs: number): number {
  return Math.max(1, Math.ceil(retryAfterMs / 60_000));
}
